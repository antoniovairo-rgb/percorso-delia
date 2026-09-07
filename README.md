# Il percorso di Delia, servizi educativi 0-6 a Roma

App di una pagina sola, HTML statico. Nessun server, nessuna dipendenza esterna,
nessun font remoto. Tutto quello che scrive Delia (spunte del percorso,
candidature, dati personali) resta nel localStorage del suo browser: non viene
spedito da nessuna parte e non lo vede nessun altro.

**Online su:** https://antoniovairo-rgb.github.io/percorso-delia/

## Cosa c'e dentro

Nove sezioni: Percorso (otto tappe con checklist e barra di avanzamento),
Corso ESEI (con il conto dei crediti rispetto al D.M. 378/2018), Annunci,
Scuole private, Candidature, Dove cercare, Canali, Lettere, Profilo.

Gli annunci e i canali sono tutti reali, con la data di pubblicazione e il link
alla fonte. Niente e dedotto: dove una fonte non si e potuta leggere, c'e scritto.

## Come si aggiorna

1. Il sorgente buono vive nel progetto Claude "Lavoro Delia", nel documento
   `claude/app-percorso-sorgente.html`. Si parte sempre da li.
2. Un'attivita programmata gira a giorni alterni, cerca gli annunci nuovi,
   aggiorna il sorgente e ripubblica l'artifact su claude.ai.
3. Se qualcosa e cambiato, produce questo `index.html` e lo manda in chat.
4. Il caricamento qui e manuale: **Add file > Upload files**, si trascina il
   file, poi **Commit changes**. GitHub Pages ridistribuisce da solo in un minuto.

Il push automatico da sessione non e possibile: l'attivita programmata nasce
fuori da Claude Code e non ha il campo per collegare un repository.

## Da non toccare a mano

- **Gli id dentro l'array `TAPPE`.** Le spunte salvate sui dispositivi sono
  legate a quegli id: cambiarli azzererebbe il percorso di Delia.
- **L'oggetto `S.io`** e la logica dei campi personali.

Il resto (array `ANNUNCI`, `CANALI`, `DOVE`, `ZONE`) si aggiorna liberamente.
Prima di pubblicare, verificare la sintassi con `node --check` sul contenuto
del tag `script`.

## Palette

Rossa dal 7 settembre 2026. Primario `#C0242E`, gradiente da `#B01E30` a
`#E2582C`. Tutte le coppie testo/sfondo sono sopra il minimo di leggibilita
WCAG AA (4,5:1); la piu bassa e 4,8:1.

## Nota sulla riservatezza

Un sito GitHub Pages su account gratuito e **pubblico** e non si puo proteggere
con password. Per questo nel file non ci sono nome, telefono, email, indirizzo
ne matricola: quei campi li compila Delia al primo avvio e restano solo sul suo
dispositivo.
