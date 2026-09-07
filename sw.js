/* Service worker di "Il mio percorso".
   Regola importante: la pagina si prende sempre dalla rete quando c'e,
   cosi gli aggiornamenti arrivano subito. La cache serve solo da riserva
   quando il telefono e offline. */
const VERSIONE = "percorso-delia-v3";
const GUSCIO = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", ev => {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(VERSIONE).then(c => Promise.allSettled(GUSCIO.map(u => c.add(u))))
  );
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(nomi.filter(n => n !== VERSIONE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", ev => {
  if (ev.data === "aggiorna") self.skipWaiting();
});

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // La pagina: prima la rete, la cache solo se la rete non risponde.
  if (req.mode === "navigate") {
    ev.respondWith((async () => {
      try {
        const rete = await fetch(req);
        const c = await caches.open(VERSIONE);
        c.put("./index.html", rete.clone());
        return rete;
      } catch (e) {
        const c = await caches.open(VERSIONE);
        return (await c.match("./index.html")) || (await c.match("./")) ||
          new Response("<h1>Sei offline</h1><p>Riapri l'app quando torna la rete.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  // Il resto (icone, manifest): cache subito, e intanto la aggiorno di nascosto.
  ev.respondWith((async () => {
    const c = await caches.open(VERSIONE);
    const salvata = await c.match(req);
    const dallaRete = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return salvata || (await dallaRete) || Response.error();
  })());
});
