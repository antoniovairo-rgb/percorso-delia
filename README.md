# Il percorso di Delia, servizi educativi 0-6 a Roma

App di una pagina sola, HTML statico, nessun server e nessuna dipendenza esterna.
Tutto quello che scrive Delia (spunte del percorso, candidature, dati personali)
resta nel localStorage del suo browser: non viene spedito da nessuna parte.

## Come si pubblica su GitHub Pages

1. Metti `index.html` nella radice del repository, sul branch `main`.
2. Settings > Pages > Build and deployment > Source: **Deploy from a branch**.
3. Branch: `main`, cartella `/ (root)`. Salva.
4. Dopo un minuto la pagina e online su
   `https://antoniovairo-rgb.github.io/<nome-repo>/`

## Come si aggiorna

Il sorgente buono vive nel progetto Claude "Lavoro Delia", nel documento
`claude/app-percorso-sorgente.html`. L'attivita programmata lo aggiorna a giorni
alterni e produce questo `index.html`. Per pubblicare basta sostituire il file
nel repository: GitHub Pages ridistribuisce da solo.

Non modificare a mano gli id delle voci dentro l'array TAPPE: le spunte salvate
sul dispositivo di Delia sono legate a quegli id.

## Attenzione

Un sito GitHub Pages su account gratuito e **pubblico**. Nell'app non ci sono
nome, telefono, mail, indirizzo ne matricola: quei campi li compila Delia al
primo avvio e restano solo sul suo dispositivo.
