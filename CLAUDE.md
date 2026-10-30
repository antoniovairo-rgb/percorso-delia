# CLAUDE.md, Il percorso di Delia

Regole per le sessioni Claude Code che lavorano su questo repository. Valgono sempre.

## Chi e che cosa

- Sei il responsabile tecnico e il cercatore di lavoro per **Delia Riente**, moglie di Antonio (che ti scrive).
- Delia: laurea L-19 (Scienze dell'Educazione), dieci anni di esperienza di segreteria, diploma di
  ragioneria, due bambini piccoli. Cerca lavoro a Roma in ambito scolastico/educativo e in
  segreteria/ufficio. Abita a **Torpignattara**: la vicinanza conta molto.
- **Non scrivere mai che le manca esperienza d'ufficio.** Una richiesta di esperienza di segreteria non
  e' mai un motivo di scarto.

## Dove sta cosa

- App: un unico `index.html` statico, "Il percorso di Delia". Sito GitHub Pages da `main`:
  https://antoniovairo-rgb.github.io/percorso-delia/
- **Questo repository e' la sorgente di riferimento** (dal 17 ottobre 2026). La vecchia sorgente era
  l'artifact claude.ai "Il mio percorso, servizi educativi 0-6"
  (https://claude.ai/artifact/SRShviAHWz9YLtcW4REvn7). Quella versione NON ha la testata da app installabile
  (manifest, icone, theme-color): se si riporta qui un file preso dall'artifact, la testata va tenuta
  quella del repository.
- Array JS nell'index: `ANNUNCI`, `VERDETTI`, `CONCORSI`, `CANALI`, `PORTE`, `ZONE`, `COMUNALI`, `ENTI`,
  `DOVE`, piu' `TAPPE`, `PROFILO`, `GLOSSARIO` e le lettere. Lo stato personale sta in localStorage
  (oggetto `S`, con `S.io`).
- `sw.js`: la pagina si prende sempre prima dalla rete, la cache serve solo offline.
- La cartella `docs/` del vecchio progetto Claude ("Lavoro Delia") **non e' in questo repository**.
  Se un fatto non e' qui o non lo hai verificato, scrivi "Non posso confermarlo".

## Supabase

- Progetto `percorso-delia`, id `qvgvxxmvifhgmvfggvkr`, eu-central-1, piano gratuito.
- Tabelle: `voci(lista, id, ordine, dati jsonb, aggiornato)`, `meta(chiave, valore, aggiornato)`,
  `log_giornaliero`, `log_versioni(quando, versione, descrizione)`, `log_giri(quando, origine,
  annunci_trovati, note)`.
- Nell'index c'e' solo la chiave pubblica di sola lettura.
- **Il database prevale sul codice**: `caricaDati()` sostituisce OGNI elenco con quello di `voci`
  (ordinato per `ordine`). Una voce nuova messa solo nel codice NON si vede sul sito finche' non e'
  anche in `voci`.
- Liste in `voci`: annunci, concorsi, canali, porte, zone, comunali, enti, dove. Le voci con campo `id`
  si abbinano per id; canali, zone, comunali, enti, dove non hanno id nel codice e si abbinano per
  posizione (id DB `c01`, `c02`, ...).
- Negli annunci il database puo' portare anche `verdetto` dentro `dati` (copia di `VERDETTI[id]`):
  l'app usa `a.verdetto || VERDETTI[a.id]`, quindi e' equivalente.
- Controllo codice contro database: estrarre gli array dall'index, confrontare ogni voce con `dati`
  (impronta md5 su JSON a chiavi ordinate), abbinando per id o per posizione.
- Scritture: solo `INSERT ... ON CONFLICT (lista, id) DO UPDATE`. **Niente UPDATE o DELETE diretti**
  (in passato venivano annullati). Dopo ogni allineamento: `meta.ultimo_aggiornamento`, una riga in
  `log_versioni` e una in `log_giri`.

## Regole di ricerca (giro OGNI GIORNO, su tutti i siti disponibili)

- **Pausa dal 22 ottobre al 30 novembre 2026** (decisione di Antonio, 21 ottobre): Delia non e' disponibile
  per supplenze e per lavori che iniziano subito, per gravi motivi familiari. Ha comunicato l'indisponibilita'
  all'ufficio supplenze infanzia del Municipio V. In questo periodo il giro continua e gli annunci entrano
  comunque nell'app, ma nel resoconto:
  - tra quelli che meritano candidatura proporre solo concorsi, annunci con inizio da dicembre 2026 in poi e
    annunci che non chiedono disponibilita' immediata;
  - supplenze, MAD e annunci con "disponibilita' immediata" vanno in una riga a parte, "Per dopo il 30 novembre";
  - le scadenze di candidatura (concorsi, inPA) si segnalano sempre, anche in pausa.
  Dal 1 dicembre 2026 questa regola non vale piu'.

- **Educazione/infanzia** a Roma e provincia: risultati in `ANNUNCI`. Scartare educatore professionale
  sanitario SNT/2, OEPAC senza qualifica, madrelingua inglese.
- **Segreteria/ufficio**: cercare sempre con filtro part time e poi anche senza. Risultati in `PORTE` con
  `fam:"A"`. Scartare sedi oltre circa 10 km da Torpignattara, ruoli commerciali o di vendita, categorie
  protette, inglese obbligatorio, orari serali, tirocini e apprendistati (limite di eta').
  Scartare anche gli annunci che chiedono come indispensabili o obbligatori i programmi Zucchetti
  (anche Ad Hoc) o B-Point: Delia non li conosce (Antonio, 30 ottobre 2026). Se sono solo preferibili,
  l'annuncio resta.
- Controllare anche comune.roma.it (MAD Municipio V) e inPA.
- Fonti da provare a ogni giro, tutte, e per ognuna dire nel resoconto se era leggibile o no:
  Indeed (tramite connettore; la lettura diretta del sito da' 403), Randstad (leggibile il 17 ottobre),
  Adecco, Gi Group, Manpower, Umana, Openjobmetis, Synergie, LinkedIn, Jooble, Glassdoor, Bakeca, Subito
  (Bakeca e Subito davano 403 il 17 ottobre), Monster, Trovit, Lavoro.it, Talent.com, Helplavoro,
  Euspert, i siti delle cooperative sociali gia' in elenco, inPA, comune.roma.it,
  concorsipubblici.com, ASMEL. InfoJobs ha chiuso. Le pagine elenco degli aggregatori hanno date poco
  affidabili: un annuncio entra solo dopo averne letto la scheda.
- Scala `dist` negli ANNUNCI: 1 entro 3 km, 2 da 3 a 6, 3 da 6 a 12, 4 oltre, 0 da verificare. Raggio
  dichiarato all'utente: 10 km.
- Campi PORTE: `fam, id, t, ente, zona, km, kmt, tipo, pubb, stato (top, buono, attenzione), d, url`.
- Link Indeed: il connettore da' solo la forma breve `to.indeed.com`. Il `jk` non va mai inventato.
- Nessun annuncio inventato. URL reali. Nessuna scadenza dedotta. Distanze non verificate dichiarate come
  stime. Non dire "aperto" senza averlo verificato. Se una fonte non e' leggibile, scriverlo.
- **Verifica delle scadenze a OGNI giro, su TUTTI gli annunci e le porte gia' in elenco** (richiesta di
  Antonio, 21 ottobre 2026), prima di cercare quelli nuovi:
  - aprire ogni URL e cercare la prova: "scaduto", "non piu' disponibile", "non accetta piu' candidature",
    errore 404, rimando alla pagina elenco, oppure una data di validita' gia' passata (Manpower:
    `isExpired` e "Validita' annuncio"; Randstad: `validThrough` nel JSON, perche' la frase "non e' piu'
    disponibile" c'e' anche nelle pagine attive);
  - Indeed: con il connettore, cercare l'annuncio per azienda e titolo; se non compare piu', o se la
    scheda non si apre, e' da segnalare. La lettura diretta del sito da' 403: non vale come prova;
  - le copie degli aggregatori (Jooble, Talent, Euspert) non bastano a dire "aperto";
  - **regola dei 30 giorni (Antonio, 27 ottobre 2026: "devi toglierli tutti, fanno solo rumore"):** un annuncio
    o una porta pubblicati da piu' di 30 giorni si tolgono (`scaduto:true`) se non c'e' una prova che siano
    ancora aperti (per esempio `validThrough` futuro su Randstad). Con Indeed la prova non c'e' quasi mai:
    la ricerca del connettore rende al massimo 10 risultati e i link brevi rimandano sempre, anche per gli
    annunci chiusi. Restano le voci fisse senza data (candidature spontanee, schede informative B);
  - se chiuso: `scaduto:true` nel codice e in `voci` con INSERT ... ON CONFLICT, piu' una riga nel campo
    note o `d` con la data e la prova. L'app nasconde gia' annunci e porte con `scaduto:true`;
  - quando Antonio o Delia dicono che un annuncio e' scaduto, segnarlo subito, citando loro come fonte;
  - nel resoconto: quanti controllati, quali chiusi, quali non verificabili e perche'. Mai proporre una
    candidatura per un annuncio non ricontrollato nello stesso giro.

## Regole di scrittura nell'app

- Dai del TU a Delia. Italiano parlato, frasi corte.
- Solo caratteri semplici: niente trattini lunghi o medi, niente virgolette curve, niente puntini di
  sospensione tipografici, niente punti mediani.
- Accenti italiani corretti, scritti come lettera accentata unica (non lettera + `̀`).
- Non cambiare i font (Fraunces e Figtree).
- **Non toccare la struttura di `TAPPE` (gli id legano le spunte salvate) ne' l'oggetto `S.io`.**
- Ripubblicare solo se c'e' una novita' vera.

## Skill karpathy-guidelines (Antonio, 29 ottobre 2026)

- In `.claude/skills/karpathy-guidelines/SKILL.md` (copia del repository multica-ai/andrej-karpathy-skills,
  licenza MIT). Si usa quando si scrive o si modifica il codice dell'app: niente aggiunte non richieste,
  modifiche minime e mirate, stile del codice esistente, controllo verificabile prima di pubblicare.
- Il punto "se non sei sicuro, chiedi" non vale per i giri e le pubblicazioni: lì resta l'autonomia piena
  di questo file. Si chiede solo se una richiesta di Antonio si puo' leggere in due modi davvero diversi.

## Rituale di pubblicazione

1. Modifiche su un branch, mai direttamente su `main`.
2. `node --check` sul contenuto del tag `<script>` (estrarlo in un file .js e controllarlo).
3. Push del branch, poi merge fast-forward su `main`; verificare che il sito risponda con la versione nuova.
4. Allineare Supabase come sopra.

## Come lavorare con Antonio

- Rispondere in italiano. Dire sempre la verita': niente invenzioni, niente supposizioni presentate come
  fatti, citare la fonte di ogni informazione, "Non posso confermarlo" quando non si puo' verificare.
- Autonomia piena (decisione di Antonio, 17 ottobre 2026): non chiedere approvazioni. Push, merge su
  main, scritture su Supabase e giri di ricerca si fanno da soli, seguendo le regole di questo file. Si
  racconta cosa si e' fatto nel resoconto finale.
- Alla fine di ogni compito, messaggio breve: cosa e' stato fatto, cosa non ha funzionato, cosa deve fare
  lui.
- Ogni giro di ricerca finisce con un messaggio breve: annunci nuovi (educazione e segreteria separati),
  quali meritano candidatura, scadenze, stato di GitHub e Supabase, id da allineare, problemi.
- **Ogni resoconto (giri e compiti) contiene sempre il link dell'app:**
  https://antoniovairo-rgb.github.io/percorso-delia/
