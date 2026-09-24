# server/

Backend Node.js di [IoT Display Hub](../README.md).

## Italiano

### Scopo

Riceve `screen/current` dall'ESP32 via MQTT, mantiene un timer per schermata
attiva (`mqtt/screenManager.js`) e pubblica sui topic `data/*` i dati già
pronti per il display, con la frequenza corretta per ciascuna schermata.
Interroga le API esterne (Open-Meteo, Spotify Web API, GitHub Releases per
l'aggiornamento firmware via rete), legge e scrive su MongoDB (frasi
motivazionali) e Redis (cache TTL, deduplica), ed espone poche route HTTP
(health check, copertina Spotify, callback OAuth, binario firmware). Non
esegue mai `sudo` né operazioni privilegiate sull'host: lo spegnimento reale
del Raspberry Pi è delegato a un processo separato che gira sull'host (vedi
[`../ops/README.md`](../ops/README.md)).

Pattern principale: `screens/*.js` decide quando pubblicare e come formattare
il payload; `integrations/*.js` sa solo come parlare con l'API esterna
specifica.

### Variabili d'ambiente

Non esiste un `.env.example` separato per `server/`: tutte le variabili,
comprese quelle usate dal backend, vivono in un unico `.env.example` nella
root del repository, passato al container tramite `env_file: .env` in
`docker-compose.yml`. Le principali (nessun valore reale qui):

| Variabile | Uso |
|---|---|
| `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` | Connessione al broker con le credenziali `display-server` |
| `DISPLAY_ID` | Prefisso topic (es. `cyd-01`) |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_DB_NAME` | Connessione a MongoDB |
| `REDIS_HOST`, `REDIS_PORT` | Connessione a Redis |
| `WEATHER_LAT`, `WEATHER_LON` | Coordinate per Open-Meteo |
| `WEATHER_API_KEY` | Non richiesta da Open-Meteo, riservata per un eventuale cambio provider futuro |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` | Credenziali OAuth Spotify |
| `PORT` | Porta interna del backend (`3000`, mappata su `3001` verso l'host) |

### Comandi per lo sviluppo locale

```bash
npm install
npm run dev     # node --watch, riavvio automatico ad ogni modifica
npm start       # produzione, nessun riavvio automatico
npm run lint    # oxlint src tests
npm test        # suite Jest completa
npm run test:coverage
```

`npm run dev`/`npm start` richiedono MongoDB e Redis raggiungibili. Nota
importante: nel `docker-compose.yml` attuale, `mongodb` e `redis` **non**
espongono una porta verso l'host (solo `mosquitto` su `1884` e `server` su
`3001` lo fanno), quindi eseguire il server fuori Docker richiede
un'esposizione temporanea di quelle porte nel compose, oppure lavorare con
l'intero stack attivo e un override che punti il server a `localhost`. In
pratica, il ciclo di sviluppo più comune resta
`docker compose up -d --build server` (nessun hot reload, ma ambiente
identico alla produzione).

### Test

Framework Jest, `server/tests/` a specchio di `server/src/`. Broker MQTT in
memoria (Aedes `^0.51.3`, non l'ultima major perché distribuita come ESM) per
i test di integrazione, nessun `mongodb-memory-server`. `tests/e2e/e2e_stack.sh`
(`npm run test:e2e`) è uno script bash manuale contro lo stack Docker reale,
non una suite Jest, non integrato in CI.

### Docker

`Dockerfile` multi-stage: `build` (installa tutte le dipendenze, copia i
sorgenti) → `test` (lint + `test:coverage`, la build fallisce se falliscono) →
`prod` (immagine minimale, solo dipendenze di produzione). La build fallisce
prima di raggiungere lo stage `prod` se lint o test non passano.

```bash
docker compose build server
docker compose up -d --build server
docker compose logs -f server
```

---

## English

### Purpose

Receives `screen/current` from the ESP32 over MQTT, keeps one timer per active
screen (`mqtt/screenManager.js`) and publishes ready-made data on the `data/*`
topics, at the right rate for each screen. Calls the external APIs (Open-Meteo,
Spotify Web API, GitHub Releases for over-the-air firmware updates), reads and
writes MongoDB (motivational quotes) and Redis (TTL cache, deduplication), and
exposes a handful of HTTP routes (health check, Spotify cover, OAuth callback,
firmware binary). It never runs `sudo` or any privileged operation on the
host: actually powering off the Raspberry Pi is delegated to a separate
process running on the host (see [`../ops/README.md`](../ops/README.md)).

Main pattern: `screens/*.js` decides when to publish and how to format the
payload; `integrations/*.js` only knows how to talk to the specific external
API.

### Environment variables

There is no separate `.env.example` for `server/`: every variable, including
the ones used by the backend, lives in a single `.env.example` at the root of
the repository, passed to the container via `env_file: .env` in
`docker-compose.yml`. The main ones (no real values here):

| Variable | Used for |
|---|---|
| `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` | Broker connection with the `display-server` credentials |
| `DISPLAY_ID` | Topic prefix (e.g. `cyd-01`) |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_DB_NAME` | MongoDB connection |
| `REDIS_HOST`, `REDIS_PORT` | Redis connection |
| `WEATHER_LAT`, `WEATHER_LON` | Coordinates for Open-Meteo |
| `WEATHER_API_KEY` | Not required by Open-Meteo, reserved for a possible future provider change |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` | Spotify OAuth credentials |
| `PORT` | Backend internal port (`3000`, mapped to `3001` on the host) |

### Local development commands

```bash
npm install
npm run dev     # node --watch, auto-restart on every change
npm start       # production, no auto-restart
npm run lint    # oxlint src tests
npm test        # full Jest suite
npm run test:coverage
```

`npm run dev`/`npm start` require reachable MongoDB and Redis. Important note:
in the current `docker-compose.yml`, `mongodb` and `redis` do **not** expose a
port to the host (only `mosquitto` on `1884` and `server` on `3001` do), so
running the server outside Docker requires either temporarily exposing those
ports in the compose file, or working with the whole stack up and an override
pointing the server at `localhost`. In practice, the most common development
loop remains `docker compose up -d --build server` (no hot reload, but an
environment identical to production).

### Testing

Jest, with `server/tests/` mirroring `server/src/`. An in-memory MQTT broker
(Aedes `^0.51.3`, not the latest major since it ships as ESM) is used for
integration tests, no `mongodb-memory-server`. `tests/e2e/e2e_stack.sh`
(`npm run test:e2e`) is a manual bash script against the real Docker stack,
not a Jest suite, and is not wired into CI.

### Docker

Multi-stage `Dockerfile`: `build` (installs all dependencies, copies the
sources) → `test` (lint + `test:coverage`, the build fails if either fails) →
`prod` (minimal image, production dependencies only). The build fails before
reaching the `prod` stage if lint or tests don't pass.

```bash
docker compose build server
docker compose up -d --build server
docker compose logs -f server
```