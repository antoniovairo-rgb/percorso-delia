// Giro di ricerca automatico per "Il percorso di Delia", con l'API di Claude.
// Gira dentro la GitHub Action .github/workflows/giro-api.yml.
//
// Passi:
//  1. legge index.html (copia di riserva degli elenchi) e lo stato di Supabase (che prevale);
//  2. verifica le scadenze senza AI: Randstad (validThrough), Manpower (isExpired), LinkedIn, 404,
//     e la regola dei 30 giorni del CLAUDE.md;
//  3. chiede a Claude di cercare annunci nuovi con web_search e web_fetch, con le regole del CLAUDE.md;
//  4. trasforma il risultato in JSON con l'output strutturato;
//  5. scrive su Supabase (solo INSERT ... ON CONFLICT via REST) e aggiorna index.html;
//  6. scrive il resoconto in resoconto.md.
//
// Variabili: ANTHROPIC_API_KEY, SUPABASE_SECRET_KEY (sb_secret_...), DRY_RUN=1 per non scrivere niente,
// MODELLO (predefinito claude-opus-5-5), REPO_ROOT (predefinito: due cartelle sopra questo file).

import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.REPO_ROOT || path.resolve(QUI, "..", "..");
const INDEX = path.join(ROOT, "index.html");
const CLAUDE_MD = path.join(ROOT, "CLAUDE.md");
const RESOCONTO = path.join(ROOT, "resoconto.md");
const APP = "https://antoniovairo-rgb.github.io/percorso-delia/";
const SB = "https://qvgvxxmvifhgmvfggvkr.supabase.co";
const SB_PUB = "sb_publishable_ijmCWSwRcMoMFyxZfBiuxw_0sXfMm9r"; // chiave pubblica di sola lettura, la stessa dell'app
const DRY = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
// solo per le prove in locale: TEST_JSON salta Claude e usa quel file come risultato; SOLO_FILE=1 non scrive su Supabase
const TEST_JSON = process.env.TEST_JSON;
const SOLO_FILE = process.env.SOLO_FILE === "1";
const MODELLO = process.env.MODELLO || "claude-opus-5-5";
const PREZZI = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10] }; // dollari per milione di token, in e out

const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const oggiRoma = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Rome" }));
const OGGI = `${oggiRoma.getDate()} ${MESI[oggiRoma.getMonth()]} ${oggiRoma.getFullYear()}`;
// "il 7 novembre" ma "l'8 novembre", "l'11 novembre"
const IL_OGGI = ([8, 11].includes(oggiRoma.getDate()) ? "l'" : "il ") + OGGI;
const ISO = `${oggiRoma.getFullYear()}-${String(oggiRoma.getMonth() + 1).padStart(2, "0")}-${String(oggiRoma.getDate()).padStart(2, "0")}`;
const MMDD = ISO.slice(5, 7) + ISO.slice(8, 10);
const log = (...a) => console.log(...a);

// ---------- utilita' ----------
function dataDa(s) {
  const m = /(\d{1,2}) (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) (\d{4})/.exec(s || "");
  return m ? new Date(+m[3], MESI.indexOf(m[2]), +m[1]) : null;
}
const giorniDa = (d) => Math.floor((oggiRoma - d) / 86400000);
// regole di scrittura dell'app: caratteri semplici, accenti composti
function pulisci(v) {
  if (typeof v === "string") {
    return v.normalize("NFC")
      .replace(/[—–]/g, "-").replace(/[“”«»]/g, '"')
      .replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/·/g, ",")
      .replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(v)) return v.map(pulisci);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pulisci(x)]));
  return v;
}
const norma = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const slug = (s) => norma(s).split(" ").slice(0, 3).join("-") || "voce";

// estrae il letterale di un array (const NOME = [...]) dal sorgente, saltando stringhe e commenti
function letterale(src, nome) {
  const m = new RegExp(`const ${nome}\\s*=\\s*\\[`).exec(src);
  if (!m) throw new Error(`array ${nome} non trovato in index.html`);
  let i = m.index + m[0].length - 1, d = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") q = c;
    else if (c === "/" && src[j + 1] === "*") j = src.indexOf("*/", j) + 1;
    else if (c === "/" && src[j + 1] === "/") j = src.indexOf("\n", j);
    else if (c === "[" || c === "{") d++;
    else if (c === "]" || c === "}") { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`array ${nome} non chiuso`);
}
const elenco = (src, nome) => vm.runInNewContext("(" + letterale(src, nome) + ")");

function sezione(md, titolo) {
  const i = md.indexOf("## " + titolo);
  if (i < 0) return "";
  const j = md.indexOf("\n## ", i + 3);
  return md.slice(i, j < 0 ? undefined : j).trim();
}

async function sb(percorso, opz = {}) {
  const chiave = opz.scrivi ? process.env.SUPABASE_SECRET_KEY : SB_PUB;
  const r = await fetch(SB + percorso, {
    method: opz.metodo || "GET",
    headers: { apikey: chiave, "Content-Type": "application/json", ...(opz.prefer ? { Prefer: opz.prefer } : {}) },
    body: opz.corpo ? JSON.stringify(opz.corpo) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${opz.metodo || "GET"} ${percorso}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// ---------- 1. stato attuale ----------
const src = fs.readFileSync(INDEX, "utf8");
const regole = fs.readFileSync(CLAUDE_MD, "utf8");
const db = await sb("/rest/v1/voci?select=lista,id,ordine,dati&order=lista.asc,ordine.asc");
const voci = (l) => db.filter((r) => r.lista === l);
const aperti = (l) => voci(l).filter((r) => !r.dati.scaduto);
log(`Database: ${db.length} voci; aperti ${aperti("annunci").length} annunci, ${aperti("porte").length} porte.`);

// ---------- 2. verifica scadenze, senza AI ----------
async function scarica(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (percorso-delia giro)" }, signal: AbortSignal.timeout(20000) });
    return { stato: r.status, url: r.url, testo: await r.text() };
  } catch (e) { return { stato: 0, errore: String(e) }; }
}
async function prova(url) {
  if (!url || /indeed\.com/.test(url)) return { esito: "nonverificabile", perche: "Indeed non si legge senza connettore" };
  const p = await scarica(url);
  if (p.stato === 404 || p.stato === 410) return { esito: "chiuso", perche: `la pagina risponde ${p.stato}` };
  if (p.stato !== 200) return { esito: "nonverificabile", perche: p.stato ? `risposta ${p.stato}` : p.errore };
  if (/randstad\.it/.test(url)) {
    const m = /"validThrough"\s*:\s*"([^"]+)"/.exec(p.testo);
    if (!m) return { esito: "chiuso", perche: "la pagina Randstad non ha piu' la data di validita'" };
    return new Date(m[1]) < new Date() ? { esito: "chiuso", perche: `validThrough ${m[1].slice(0, 10)} gia' passato` } : { esito: "aperto", perche: `validThrough ${m[1].slice(0, 10)}` };
  }
  if (/manpower\.it/.test(url)) {
    if (/"isExpired"\s*:\s*true/.test(p.testo)) return { esito: "chiuso", perche: "Manpower: isExpired true" };
    if (/"isExpired"\s*:\s*false/.test(p.testo)) return { esito: "aperto", perche: "Manpower: isExpired false" };
  }
  if (/linkedin\.com/.test(url)) {
    if (/No longer accepting applications|Non accetta più candidature|Non accetta piu' candidature/i.test(p.testo)) return { esito: "chiuso", perche: "LinkedIn: non accetta piu' candidature" };
    if (/linkedin\.com\/jobs\/view/.test(p.url)) return { esito: "aperto", perche: "LinkedIn: scheda attiva, nessuna dicitura di chiusura" };
    return { esito: "chiuso", perche: "LinkedIn rimanda all'elenco delle ricerche" };
  }
  return { esito: "nonverificabile", perche: "pagina aperta, nessuna prova automatica" };
}

const scaduti = []; // {lista,id,campo,motivo}
const controllati = { totale: 0, aperti: 0, nonverificabili: [] };
for (const l of ["annunci", "porte"]) {
  for (const r of aperti(l)) {
    const d = r.dati;
    if (l === "porte" && d.fam !== "A" && d.fam !== "D") continue; // schede fisse
    const pubb = dataDa(d.pubb);
    if (!pubb && !d.url) continue; // candidature spontanee
    controllati.totale++;
    const p = await prova(d.url);
    const vecchio = pubb && giorniDa(pubb) > 30;
    let motivo = null;
    if (p.esito === "chiuso") motivo = p.perche;
    else if (vecchio && p.esito !== "aperto") motivo = `pubblicato da piu' di 30 giorni e senza prova che sia ancora aperto (${p.perche})`;
    if (motivo) scaduti.push({ lista: l, id: r.id, campo: l === "annunci" ? "note" : "d", motivo });
    else if (p.esito === "aperto") controllati.aperti++;
    else controllati.nonverificabili.push(`${r.id} (${p.perche})`);
  }
}
log(`Verifica: ${controllati.totale} controllati, ${scaduti.length} da togliere.`);

// ---------- 3. ricerca con Claude ----------
const client = TEST_JSON ? null : new Anthropic();
const usi = { input: 0, output: 0, ricerche: 0, letture: 0 };
function conta(m) {
  usi.input += (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0) + (m.usage.cache_read_input_tokens || 0);
  usi.output += m.usage.output_tokens || 0;
  usi.ricerche += m.usage.server_tool_use?.web_search_requests || 0;
  usi.letture += m.usage.server_tool_use?.web_fetch_requests || 0;
}
async function chiedi(params) {
  const m = await client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }).finalMessage();
  conta(m);
  if (m.stop_reason === "refusal") throw new Error(`Claude ha rifiutato la richiesta: ${m.stop_details?.category || "?"}`);
  return m;
}

const gia = [
  ...aperti("annunci").map((r) => `ANNUNCIO | ${r.dati.ente} | ${r.dati.titolo} | ${r.dati.url || ""}`),
  ...aperti("porte").filter((r) => r.dati.fam === "A" || r.dati.fam === "D").map((r) => `PORTA | ${r.dati.ente} | ${r.dati.t} | ${r.dati.url || ""}`),
  ...voci("concorsi").map((r) => `CONCORSO | ${r.dati.ente} | ${r.dati.titolo} | scade ${r.dati.scadenza || ""}`),
].join("\n");

const sistema = `Sei il cercatore di lavoro per Delia Riente: laurea L-19 in Scienze dell'Educazione, dieci anni di segreteria (assistente di direzione area legale in DeA Capital, CDP Investimenti SGR, Cerved, JAKALA, segreteria con fatturazione in imprese edili, receptionist in studi odontoiatrici), diploma di ragioneria, attestato paghe e contributi, due bambini piccoli. Abita a Torpignattara, Roma (Municipio V, metro C Malatesta).
Oggi e' il ${OGGI}. Rispondi in italiano.

Queste sono le regole decise da Antonio, il marito di Delia. Seguile alla lettera:

${sezione(regole, "Regole di ricerca")}

${sezione(regole, "Regole di scrittura nell'app")}

Il connettore Indeed non c'e': non usare Indeed come fonte e non costruire link Indeed.`;

const domanda = `Fai il giro di ricerca di oggi. Cerca SOLO annunci e concorsi nuovi, pubblicati negli ultimi 10 giorni:
1. educazione e infanzia a Roma e provincia;
2. segreteria e ufficio entro circa 10 km da Torpignattara, prima part time e poi tempo pieno, piu' il lavoro da casa;
3. concorsi aperti su inPA a Roma e provincia accessibili con la L-19 o con il diploma, e novita' su comune.roma.it per educatori e MAD del Municipio V.

Per ogni annuncio che proponi devi aver aperto e letto la scheda con web_fetch. Niente inventato: titolo, ente, zona, contratto, orario, paga, data di pubblicazione e requisiti come scritti nella scheda; distanze solo come stima dichiarata; nessuna scadenza dedotta.

Questi sono GIA' in elenco, non riproporli:
${gia}

Alla fine scrivi, per ogni annuncio valido: tipo (educazione, segreteria, da casa, concorso), titolo, ente, zona, distanza stimata in km, contratto e orario, data di pubblicazione, URL esatto della scheda letta, fonte, requisiti, data di inizio se scritta, un giudizio (ok, forse, no) e due o tre frasi per Delia che spiegano come il suo profilo combacia e cosa chiedere. Poi l'elenco degli annunci visti e scartati con il motivo, e l'elenco delle fonti provate con leggibile si/no ed errore.`;

let messaggi = [{ role: "user", content: domanda }];
let risposta = { stop_reason: "end_turn", content: [] };
for (let giro = 0; giro < 8 && !TEST_JSON; giro++) {
  risposta = await chiedi({
    model: MODELLO,
    max_tokens: 64000,
    system: sistema,
    output_config: { effort: "medium" },
    tools: [
      { type: "web_search_20260209", name: "web_search", max_uses: 25, user_location: { type: "approximate", city: "Roma", country: "IT", timezone: "Europe/Rome" } },
      { type: "web_fetch_20260209", name: "web_fetch", max_uses: 40, max_content_tokens: 20000 },
    ],
    messages: messaggi,
  });
  if (risposta.stop_reason !== "pause_turn") break;
  messaggi = [{ role: "user", content: domanda }, { role: "assistant", content: risposta.content }];
  log(`pausa del server, riprendo (${giro + 1})`);
}
if (risposta.stop_reason === "pause_turn") throw new Error("la ricerca non si e' conclusa dopo 8 riprese");
const testoRicerca = risposta.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
fs.writeFileSync(path.join(ROOT, "ricerca.txt"), testoRicerca);
log(`Ricerca finita: ${usi.ricerche} ricerche, ${usi.letture} pagine lette.`);

// ---------- 4. trasformazione in JSON ----------
const str = { type: "string" };
const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["annunci", "porte", "concorsi", "fonti", "scartati"],
  properties: {
    annunci: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["titolo", "ente", "zona", "cat", "km", "tipo", "pubb", "url", "fonte", "note", "giudizio", "verdetto", "consigliata", "inizio_immediato"],
      properties: { titolo: str, ente: str, zona: str, cat: { type: "string", enum: ["nido", "infanzia", "socio", "extra", "dom"] }, km: { anyOf: [{ type: "number" }, { type: "null" }] }, tipo: str, pubb: str, url: str, fonte: str, note: str, giudizio: { type: "string", enum: ["ok", "forse", "no"] }, verdetto: str, consigliata: { type: "boolean" }, inizio_immediato: { type: "boolean" } } } },
    porte: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["t", "ente", "zona", "km", "kmt", "tipo", "pubb", "stato", "d", "url", "da_casa", "consigliata", "inizio_immediato"],
      properties: { t: str, ente: str, zona: str, km: { anyOf: [{ type: "number" }, { type: "null" }] }, kmt: str, tipo: str, pubb: str, stato: { type: "string", enum: ["top", "buono", "attenzione"] }, d: str, url: str, da_casa: { type: "boolean" }, consigliata: { type: "boolean" }, inizio_immediato: { type: "boolean" } } } },
    concorsi: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["titolo", "ente", "zona", "km", "postiN", "tipo", "titoloRichiesto", "prove", "scadenza", "pubb", "url", "fonte", "note", "adatto"],
      properties: { titolo: str, ente: str, zona: str, km: { anyOf: [{ type: "number" }, { type: "null" }] }, postiN: { anyOf: [{ type: "integer" }, { type: "null" }] }, tipo: str, titoloRichiesto: str, prove: str, scadenza: str, pubb: str, url: str, fonte: str, note: str, adatto: { type: "boolean" } } } },
    fonti: { type: "array", items: { type: "object", additionalProperties: false, required: ["nome", "leggibile", "nota"], properties: { nome: str, leggibile: { type: "boolean" }, nota: str } } },
    scartati: { type: "array", items: str },
  },
};
const estrazione = TEST_JSON ? { content: [{ type: "text", text: fs.readFileSync(TEST_JSON, "utf8") }] } : await chiedi({
  model: MODELLO,
  max_tokens: 32000,
  output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
  system: `Trasformi in JSON il resoconto di un giro di ricerca di lavoro. Usa SOLO le informazioni scritte nel resoconto: non aggiungere, non dedurre, non correggere fatti. Se un dato non c'e', scrivi "non scritto" (o null per i numeri). I testi "note", "d" e "verdetto" sono per Delia: dai del tu, italiano parlato, frasi corte, solo caratteri semplici (niente trattini lunghi, niente virgolette curve). "consigliata" e' true solo se il resoconto la indica come da candidare. "inizio_immediato" e' true se l'annuncio chiede disponibilita' immediata o inizio subito. Annunci educativi a casa delle famiglie vanno in cat "dom". Oggi e' il ${OGGI}.\n\n${sezione(regole, "Regole di scrittura nell'app")}`,
  messages: [{ role: "user", content: testoRicerca || "Nessun resoconto." }],
});
const trovati = pulisci(JSON.parse(estrazione.content.find((b) => b.type === "text").text));

// ---------- controlli sui risultati ----------
const giaUrl = new Set(db.map((r) => r.dati.url).filter(Boolean));
const giaChiave = new Set(db.map((r) => norma(r.dati.ente) + "|" + norma(r.dati.titolo || r.dati.t)));
const valido = (x, titolo) => /^https:\/\//.test(x.url) && !/indeed\.com/.test(x.url) && !giaUrl.has(x.url) && !giaChiave.has(norma(x.ente) + "|" + norma(titolo));
const usati = new Set(db.map((r) => r.id));
function nuovoId(base) { let i = 0, id; do { id = base + (i ? "-" + i : ""); i++; } while (usati.has(id)); usati.add(id); return id; }
const lettera = (n) => String.fromCharCode(97 + n);
const distDa = (km) => (km == null ? 0 : km <= 3 ? 1 : km <= 6 ? 2 : km <= 12 ? 3 : 4);
const conImmediato = (tipo, imm) => (imm && !/immediat|da subito/i.test(tipo) ? tipo + ", inizio immediato" : tipo);

const nuoviAnnunci = trovati.annunci.filter((a) => valido(a, a.titolo)).map((a, n) => {
  let id; do { id = `o${MMDD}${lettera(n)}`; n += 26; } while (usati.has(id)); usati.add(id);
  return { obj: { id, titolo: a.titolo, ente: a.ente, zona: a.zona, cat: a.cat, dist: distDa(a.km), tipo: conImmediato(a.tipo, a.inizio_immediato), pubb: a.pubb, url: a.url, fonte: a.fonte, note: `Nuovo, trovato ${IL_OGGI} dal giro automatico. ${a.note}` }, verdetto: [a.giudizio, a.verdetto], extra: a };
});
const nuovePorte = trovati.porte.filter((p) => valido(p, p.t) && (p.da_casa || p.km == null || p.km <= 10.5)).map((p) => ({
  obj: { fam: p.da_casa ? "D" : "A", id: nuovoId(`p-${slug(p.ente)}-${MMDD}`), t: p.t, ente: p.ente, zona: p.zona, km: p.km ?? 0, kmt: p.kmt, tipo: conImmediato(p.tipo, p.inizio_immediato), pubb: p.pubb, stato: p.stato, d: `Novita' del ${OGGI}, dal giro automatico. ${p.d}`, url: p.url },
  extra: p,
}));
const nuoviConcorsi = trovati.concorsi.filter((c) => valido(c, c.titolo)).map((c) => ({
  obj: { id: nuovoId(`c-${slug(c.ente)}-${ISO.slice(0, 4)}`), adatto: c.adatto, postiN: c.postiN, titolo: c.titolo, ente: c.ente, zona: c.zona, dist: c.km != null && c.km > 12 ? 4 : distDa(c.km), tipo: c.tipo, titoloRichiesto: c.titoloRichiesto, prove: c.prove, scadenza: c.scadenza, pubb: c.pubb, url: c.url, fonte: c.fonte, note: `Novita' del ${OGGI}, dal giro automatico. ${c.note}` },
}));
log(`Nuovi: ${nuoviAnnunci.length} annunci, ${nuovePorte.length} porte, ${nuoviConcorsi.length} concorsi.`);

// ---------- 5. scritture ----------
const novita = nuoviAnnunci.length + nuovePorte.length + nuoviConcorsi.length + scaduti.length;
const costo = (() => { const p = PREZZI[MODELLO]; return p ? (usi.input * p[0] + usi.output * p[1]) / 1e6 : null; })();
const riepilogo = `${nuoviAnnunci.length} annunci, ${nuovePorte.length} porte, ${nuoviConcorsi.length} concorsi nuovi; ${scaduti.length} tolti. Token ${usi.input} in, ${usi.output} out; ${usi.ricerche} ricerche, ${usi.letture} letture${costo != null ? `; costo token circa ${costo.toFixed(2)} dollari, ricerche escluse` : ""}.`;

if (!DRY && novita) {
  let s = src;
  const metti = (ancora, testo) => { const i = s.indexOf(ancora); if (i < 0) throw new Error("ancora non trovata: " + ancora); s = s.slice(0, i + ancora.length) + testo + s.slice(i + ancora.length); };
  const riga = (o) => "  " + JSON.stringify(o) + ",\n";
  if (nuoviAnnunci.length) {
    metti(/const ANNUNCI\s*=\s*\[\n/.exec(s)[0], nuoviAnnunci.map((a) => riga(a.obj)).join(""));
    metti("const VERDETTI = {", nuoviAnnunci.map((a) => `${JSON.stringify(a.obj.id)}: ${JSON.stringify(a.verdetto)}, `).join(""));
  }
  if (nuovePorte.length) metti(/const PORTE\s*=\s*\[\n/.exec(s)[0], nuovePorte.map((p) => riga(p.obj)).join(""));
  if (nuoviConcorsi.length) metti(/const CONCORSI\s*=\s*\[\n/.exec(s)[0], nuoviConcorsi.map((c) => riga(c.obj)).join(""));
  const prefisso = (x) => `Tolto ${IL_OGGI} dal giro automatico: ${x.motivo}. `;
  for (const x of scaduti) {
    const k = s.indexOf(`id:"${x.id}"`) >= 0 ? s.indexOf(`id:"${x.id}"`) : s.indexOf(`"id":"${x.id}"`);
    if (k < 0) continue; // voce solo nel database
    const fine = s.indexOf('id:"', k + 5) >= 0 ? s.indexOf('id:"', k + 5) : s.length;
    let seg = s.slice(k, fine);
    const m = new RegExp(`(?<![A-Za-z_"])"?${x.campo}"?:"`).exec(seg);
    if (!m || /scaduto"?:\s*true/.test(seg.slice(0, 80))) continue;
    seg = seg.slice(0, m.index + m[0].length) + prefisso(x).replace(/"/g, '\\"') + seg.slice(m.index + m[0].length);
    seg = seg.replace(/^(id:"[^"]+",|"id":"[^"]+",)/, (t) => t + (t.startsWith('"') ? '"scaduto":true,' : " scaduto:true,"));
    s = s.slice(0, k) + seg + s.slice(fine);
  }
  // lo script dell'app deve restare valido
  const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(s);
  new vm.Script(script[1]);
  fs.writeFileSync(INDEX, s);

  const ordine = {}; db.forEach((r) => (ordine[r.lista] = Math.max(ordine[r.lista] ?? -1, r.ordine)));
  const righe = [
    ...nuoviAnnunci.map((a) => ({ lista: "annunci", id: a.obj.id, ordine: ++ordine.annunci, dati: { ...a.obj, verdetto: a.verdetto } })),
    ...nuovePorte.map((p) => ({ lista: "porte", id: p.obj.id, ordine: ++ordine.porte, dati: p.obj })),
    ...nuoviConcorsi.map((c) => ({ lista: "concorsi", id: c.obj.id, ordine: ++ordine.concorsi, dati: c.obj })),
    ...scaduti.map((x) => { const r = db.find((v) => v.lista === x.lista && v.id === x.id); return { lista: x.lista, id: x.id, ordine: r.ordine, dati: { ...r.dati, scaduto: true, [x.campo]: prefisso(x) + (r.dati[x.campo] || "") } }; }),
  ].map((r) => ({ ...r, aggiornato: new Date().toISOString() }));
  if (SOLO_FILE) { log("SOLO_FILE: righe preparate per Supabase", JSON.stringify(righe).slice(0, 2000)); }
  // INSERT ... ON CONFLICT (lista, id) DO UPDATE, via REST
  else await sb("/rest/v1/voci?on_conflict=lista,id", { metodo: "POST", scrivi: true, prefer: "resolution=merge-duplicates,return=minimal", corpo: righe });
  if (!SOLO_FILE) await sb("/rest/v1/meta?on_conflict=chiave", { metodo: "POST", scrivi: true, prefer: "resolution=merge-duplicates,return=minimal", corpo: [{ chiave: "ultimo_aggiornamento", valore: ISO, aggiornato: new Date().toISOString() }] });
  if (!SOLO_FILE) await sb("/rest/v1/log_versioni", { metodo: "POST", scrivi: true, prefer: "return=minimal", corpo: [{ quando: new Date().toISOString(), versione: "giro automatico " + ISO, descrizione: "Giro automatico con l'API: " + righe.map((r) => r.id).join(", ") }] });
  log(SOLO_FILE ? `Prova: ${righe.length} righe preparate, niente scritto su Supabase.` : `Scritte ${righe.length} righe su Supabase.`);
}
if (!DRY && !SOLO_FILE) {
  await sb("/rest/v1/log_giri", { metodo: "POST", scrivi: true, prefer: "return=minimal", corpo: [{ quando: new Date().toISOString(), origine: "giro automatico con l'API (GitHub Action)", annunci_trovati: nuoviAnnunci.length + nuovePorte.length + nuoviConcorsi.length, note: riepilogo }] });
}

// ---------- 6. resoconto ----------
const pausa = oggiRoma <= new Date(2026, 10, 30);
const voce = (t, url, extra) => `- [${t}](${url})${extra ? ": " + extra : ""}`;
const md = [];
md.push(`**App:** ${APP}`, "", `# Giro automatico, ${OGGI}${DRY ? " (prova, niente scritto)" : ""}`, "", riepilogo, "");
const consigliati = [...nuoviAnnunci.filter((a) => a.extra.consigliata && !(pausa && a.extra.inizio_immediato)).map((a) => voce(a.obj.titolo, a.obj.url, a.obj.ente)),
  ...nuovePorte.filter((p) => p.extra.consigliata && !(pausa && p.extra.inizio_immediato)).map((p) => voce(p.obj.t, p.obj.url, p.obj.ente)),
  ...nuoviConcorsi.filter((c) => c.obj.adatto).map((c) => voce(c.obj.titolo, c.obj.url, "scade " + c.obj.scadenza))];
md.push("## Da candidare", consigliati.length ? consigliati.join("\n") : "Nessuno oggi.", "");
if (pausa) {
  const dopo = [...nuoviAnnunci.filter((a) => a.extra.inizio_immediato).map((a) => voce(a.obj.titolo, a.obj.url, a.obj.ente)), ...nuovePorte.filter((p) => p.extra.inizio_immediato).map((p) => voce(p.obj.t, p.obj.url, p.obj.ente))];
  if (dopo.length) md.push("## Per dopo il 30 novembre", dopo.join("\n"), "");
}
md.push("## Educazione", nuoviAnnunci.length ? nuoviAnnunci.map((a) => voce(a.obj.titolo, a.obj.url, `${a.obj.ente}, ${a.obj.zona} (${a.verdetto[0]})`)).join("\n") : "Niente di nuovo.", "");
md.push("## Segreteria", nuovePorte.length ? nuovePorte.map((p) => voce(p.obj.t, p.obj.url, `${p.obj.ente}, ${p.obj.kmt} (${p.obj.stato})`)).join("\n") : "Niente di nuovo.", "");
if (nuoviConcorsi.length) md.push("## Concorsi", nuoviConcorsi.map((c) => voce(c.obj.titolo, c.obj.url, `scade ${c.obj.scadenza}`)).join("\n"), "");
const inScadenza = voci("concorsi").map((r) => r.dati).filter((c) => c.adatto !== false && dataDa(c.scadenza) && giorniDa(dataDa(c.scadenza)) <= 0 && giorniDa(dataDa(c.scadenza)) >= -14);
if (inScadenza.length) md.push("## Concorsi in scadenza", inScadenza.map((c) => `- ${c.titolo}: ${c.scadenza}`).join("\n"), "");
md.push("## Verifica scadenze", `${controllati.totale} controllati, ${controllati.aperti} aperti con prova, ${scaduti.length} tolti, ${controllati.nonverificabili.length} non verificabili.`);
if (scaduti.length) md.push(...scaduti.map((x) => `- tolto ${x.id}: ${x.motivo}`));
md.push("", "## Fonti", ...trovati.fonti.map((f) => `- ${f.nome}: ${f.leggibile ? "leggibile" : "non leggibile"}${f.nota ? ", " + f.nota : ""}`), "");
if (trovati.scartati.length) md.push("## Scartati", ...trovati.scartati.map((x) => "- " + x), "");
fs.writeFileSync(RESOCONTO, md.join("\n"));
log(md.join("\n"));
