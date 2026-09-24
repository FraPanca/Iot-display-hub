# IoT Display Hub

Sistema domestico con display touch ESP32-S3 e backend Node.js su Raspberry Pi 5,
comunicanti via MQTT.

## Italiano

### Descrizione

IoT Display Hub è un pannello informativo domestico. Un display touch ESP32-S3
(Freenove CYD, 3.5", 8MB PSRAM, grafica LVGL) mostra una schermata alla volta a
schermo intero, navigabile con swipe orizzontale: orario, meteo, telecomando
Spotify, monitoraggio di sistema, frase motivazionale, spegnimento.

Il principio architetturale di fondo è che l'ESP32 non elabora nulla: riceve
dati già pronti via MQTT e li mostra. Tutta la logica applicativa (scheduling
delle pubblicazioni, chiamate alle API esterne, formattazione dei dati) vive in
un backend Node.js in esecuzione su un Raspberry Pi 5, containerizzato con
Docker Compose insieme al broker MQTT e ai servizi di persistenza.

### Stack tecnologico

- **Backend**: Node.js 20, Express, Mongoose (MongoDB), client Redis ufficiale,
  MQTT.js, sharp (conversione immagini)
- **Firmware**: C/C++ tramite PlatformIO, LVGL 8.4.0, `256dpi/MQTT` 2.5.3,
  ArduinoJson
- **Broker messaggi**: Eclipse Mosquitto 2, autenticazione (password file) e ACL
- **Persistenza**: MongoDB 7 (frasi motivazionali), Redis 7 con AOF (cache TTL,
  deduplica)
- **Containerizzazione**: Docker + Docker Compose
- **Avvio di sistema**: systemd (stack Docker, listener di shutdown)
- **CI/CD**: GitHub Actions (lint, test, build check server e firmware,
  security audit, build/push immagine, build/release firmware)

### Hardware richiesto

- Raspberry Pi 5, con hard disk esterno da 1TB montato su `/mnt/wd1tb`, usato
  per la persistenza di MongoDB e Redis al posto della scheda SD
- ESP32-S3 Freenove CYD 3.5", display touch QSPI (controller ST77922), 8MB
  PSRAM, 16MB flash

### Architettura

```
ESP32-S3 (LVGL, WiFi)
        |
        | MQTT (Mosquitto, porta host 1884)
        v
+--------------------------------------------------------+
| Raspberry Pi 5 (Docker Compose)                        |
|                                                        |
| Mosquitto <--MQTT--> Server Node.js (porta host 3001)  |
|                           |               |            |
|                       MongoDB           Redis          |
|                   (frasi, config)   (cache TTL, dedup) |
+--------------------------------------------------------+
        ^                              |
        | MQTT (stesso broker,         | HTTP
        | credenziali display-server)  v
        |                     Open-Meteo, Spotify Web API,
ops/shutdown_listener.sh      GitHub Releases API (OTA)
(systemd, invoca
shutdown.sh via sudo)
```

Il backend non fa mai subscribe/unsubscribe dinamico: pubblica lui stesso i
dati sui topic `data/*` con la frequenza giusta per la schermata attiva (vista
da `screen/current`), e li ferma quando l'ESP32 cambia schermata.

Il listener di spegnimento gira separatamente, fuori Docker: il backend Node
non ha accesso a `sudo` (è containerizzato), quindi lo spegnimento reale del
Raspberry Pi è delegato a `ops/scripts/shutdown_listener.sh`, un processo che
si sottoscrive allo stesso topic MQTT e invoca `shutdown.sh` con privilegi
granulari. Dettagli in [`ops/README.md`](ops/README.md).

### Le sei schermate

| Schermata | Frequenza pubblicazione | Contenuto |
|---|---|---|
| Orario | Ogni 60s | Ora corrente, formato HH:mm |
| Meteo | Ogni 30 minuti | Condizione, temperatura, umidità, vento, probabilità precipitazioni, previsioni 5 giorni |
| Spotify | On-change | Copertina (via HTTP separato), titolo, album, artista, controlli riproduzione |
| Monitoraggio sistema | Ogni 15s (con deduplica) | CPU, memoria, disco, temperatura, stato servizi |
| Frase motivazionale | Ogni ora | Testo frase, da archivio MongoDB in italiano |
| Spegnimento | Solo eventi | Spegni display (locale), spegni Raspberry Pi (con conferma) |

### Struttura del repository

```
iot-display-hub/
├── server/      backend Node.js, vedi server/README.md
├── firmware/    firmware ESP32-S3 (PlatformIO), vedi firmware/README.md
├── mosquitto/   configurazione broker MQTT e ACL, vedi mosquitto/README.md
├── ops/         script di sistema (shutdown, systemd), vedi ops/README.md
├── .github/     workflow GitHub Actions (CI/CD)
├── docker-compose.yml
├── manage.sh
└── .env.example
```

Documentazione di dettaglio per ciascuna directory:

- [`server/README.md`](server/README.md)
- [`firmware/README.md`](firmware/README.md)
- [`mosquitto/README.md`](mosquitto/README.md)
- [`ops/README.md`](ops/README.md)

### Setup rapido

Presuppone un Raspberry Pi 5 con Docker e Docker Compose già installati, l'HDD
esterno montato su `/mnt/wd1tb`, e un ESP32-S3 Freenove CYD pronto per il
flashing via USB (vedi [`firmware/README.md`](firmware/README.md) per i
dettagli sul flashing).

1. **Clonare il repository**:
   ```bash
   git clone https://github.com/FraPanca/iot-display-hub.git
   cd iot-display-hub
   ```

2. **Generare le credenziali del broker MQTT** (vedi
   [`mosquitto/README.md`](mosquitto/README.md) per il dettaglio completo):
   ```bash
   docker run --rm -v "$(pwd)/mosquitto/config:/config" eclipse-mosquitto:2 \
     mosquitto_passwd -c /config/passwordfile display-esp32
   docker run --rm -v "$(pwd)/mosquitto/config:/config" eclipse-mosquitto:2 \
     mosquitto_passwd /config/passwordfile display-server
   ```

3. **Ottenere le credenziali Spotify**: registrare un'app su
   developer.spotify.com con un redirect URI di loopback
   (`http://127.0.0.1:3001/api/spotify/callback`), autorizzare l'app dal
   proprio account Spotify, scambiare il codice ottenuto con un refresh token
   tramite l'endpoint token di Spotify, e conservarlo come
   `SPOTIFY_REFRESH_TOKEN`.

4. **Creare il file `.env`** nella root del progetto a partire da
   `.env.example`, compilando credenziali MQTT (le stesse generate al passo 2
   per `display-server`), credenziali MongoDB, coordinate per Open-Meteo e le
   credenziali Spotify ottenute al passo 3.

5. **Avviare lo stack**:
   ```bash
   docker compose up -d --build
   curl http://localhost:3001/api/health
   ```

6. **Configurare e caricare il firmware**: copiare
   `firmware/src/secrets.h.example` in `firmware/src/secrets.h`, compilare
   SSID/password WiFi, host/porta del broker (porta host, `1884`), credenziali
   `display-esp32`, host/porta del backend, poi compilare e caricare il
   firmware con PlatformIO (ambiente `freenove_cyd35`) con l'ESP32 collegato
   via USB. Dettagli in [`firmware/README.md`](firmware/README.md).

7. **Abilitare l'avvio automatico** copiando le unit in `ops/systemd/` sotto
   `/etc/systemd/system/`, l'entry sudoers in `ops/sudoers.d/` sotto
   `/etc/sudoers.d/`, poi:
   ```bash
   sudo systemctl enable --now iot-display-hub-docker.service
   sudo systemctl enable --now iot-display-hub-shutdown-listener.service
   ```
   Da questo momento lo stack si gestisce con `./manage.sh {start|stop|restart|status}`.

### CI/CD

Due workflow GitHub Actions:

- **CI** (`.github/workflows/ci.yml`), su push/PR verso `main`: lint e test del
  server, security audit delle dipendenze di produzione, build check del
  firmware (PlatformIO, ambiente `freenove_cyd35`), build Docker dell'immagine
  server senza push
- **CD** (`.github/workflows/cd.yml`), su push di un tag `v*.*.*`: verifica che
  `FIRMWARE_VERSION` in `firmware/src/config.h` corrisponda al tag, compila il
  firmware e pubblica `firmware.bin` come asset della GitHub Release, builda e
  pubblica l'immagine del server su GHCR (nativamente in arm64)

### Licenza

MIT, vedi [`LICENSE`](LICENSE).

---

## English

### Description

IoT Display Hub is a home information panel. An ESP32-S3 touch display
(Freenove CYD, 3.5", 8MB PSRAM, LVGL graphics) shows one full-screen view at a
time, navigated with a horizontal swipe: clock, weather, Spotify remote, system
monitor, motivational quote, shutdown.

The core architectural principle is that the ESP32 does no processing: it
receives ready-made data over MQTT and displays it. All the application logic
(publish scheduling, external API calls, data formatting) lives in a Node.js
backend running on a Raspberry Pi 5, containerized with Docker Compose
alongside the MQTT broker and the persistence services.

### Tech stack

- **Backend**: Node.js 20, Express, Mongoose (MongoDB), official Redis client,
  MQTT.js, sharp (image conversion)
- **Firmware**: C/C++ via PlatformIO, LVGL 8.4.0, `256dpi/MQTT` 2.5.3,
  ArduinoJson
- **Message broker**: Eclipse Mosquitto 2, authentication (password file) and
  ACL
- **Persistence**: MongoDB 7 (motivational quotes), Redis 7 with AOF (TTL
  cache, deduplication)
- **Containerization**: Docker + Docker Compose
- **System startup**: systemd (Docker stack, shutdown listener)
- **CI/CD**: GitHub Actions (lint, test, server and firmware build checks,
  security audit, image build/push, firmware build/release)

### Hardware requirements

- Raspberry Pi 5, with an external 1TB hard disk mounted at `/mnt/wd1tb`, used
  for MongoDB and Redis persistence instead of the SD card
- ESP32-S3 Freenove CYD 3.5", QSPI touch display (ST77922 controller), 8MB
  PSRAM, 16MB flash

### Architecture

```
ESP32-S3 (LVGL, WiFi)
        |
        | MQTT (Mosquitto, host port 1884)
        v
+-------------------------------------------------------+
| Raspberry Pi 5 (Docker Compose)                       |
|                                                       |
| Mosquitto <--MQTT--> Node.js server (host port 3001)  |
|                          |              |             |
|                      MongoDB          Redis           |
|                  (quotes, config)  (TTL cache, dedup) |
+-------------------------------------------------------+
        ^                             |
        | MQTT (same broker,          | HTTP
        | display-server credentials) v
        |                    Open-Meteo, Spotify Web API,
ops/shutdown_listener.sh     GitHub Releases API (OTA)
(systemd, invokes
shutdown.sh via sudo)
```

The backend never subscribes/unsubscribes dynamically: it publishes the data
on the `data/*` topics itself, at the right rate for the currently active
screen (seen from `screen/current`), and stops when the ESP32 switches
screens.

The shutdown listener runs separately, outside Docker: the Node backend has no
access to `sudo` (it's containerized), so actually powering off the Raspberry
Pi is delegated to `ops/scripts/shutdown_listener.sh`, a process that
subscribes to the same MQTT topic and invokes `shutdown.sh` with granular
privileges. Details in [`ops/README.md`](ops/README.md).

### The six screens

| Screen | Publish frequency | Content |
|---|---|---|
| Clock | Every 60s | Current time, HH:mm format |
| Weather | Every 30 minutes | Condition, temperature, humidity, wind, precipitation probability, 5-day forecast |
| Spotify | On-change | Cover art (separate HTTP call), title, album, artist, playback controls |
| System monitor | Every 15s (deduplicated) | CPU, memory, disk, temperature, service status |
| Motivational quote | Every hour | Quote text, from a MongoDB archive in Italian |
| Shutdown | Events only | Turn off display (local), shut down the Raspberry Pi (with confirmation) |

### Repository structure

```
iot-display-hub/
├── server/      Node.js backend, see server/README.md
├── firmware/    ESP32-S3 firmware (PlatformIO), see firmware/README.md
├── mosquitto/   MQTT broker configuration and ACL, see mosquitto/README.md
├── ops/         system scripts (shutdown, systemd), see ops/README.md
├── .github/     GitHub Actions workflows (CI/CD)
├── docker-compose.yml
├── manage.sh
└── .env.example
```

Detailed documentation for each directory:

- [`server/README.md`](server/README.md)
- [`firmware/README.md`](firmware/README.md)
- [`mosquitto/README.md`](mosquitto/README.md)
- [`ops/README.md`](ops/README.md)

### Quickstart

Assumes a Raspberry Pi 5 with Docker and Docker Compose already installed, the
external HDD mounted at `/mnt/wd1tb`, and a Freenove CYD ESP32-S3 ready to be
flashed over USB (see [`firmware/README.md`](firmware/README.md) for flashing
details).

1. **Clone the repository**:
   ```bash
   git clone https://github.com/FraPanca/iot-display-hub.git
   cd iot-display-hub
   ```

2. **Generate the MQTT broker credentials** (see
   [`mosquitto/README.md`](mosquitto/README.md) for the full detail):
   ```bash
   docker run --rm -v "$(pwd)/mosquitto/config:/config" eclipse-mosquitto:2 \
     mosquitto_passwd -c /config/passwordfile display-esp32
   docker run --rm -v "$(pwd)/mosquitto/config:/config" eclipse-mosquitto:2 \
     mosquitto_passwd /config/passwordfile display-server
   ```

3. **Get the Spotify credentials**: register an app on
   developer.spotify.com with a loopback redirect URI
   (`http://127.0.0.1:3001/api/spotify/callback`), authorize the app from your
   Spotify account, exchange the returned code for a refresh token through
   Spotify's token endpoint, and save it as `SPOTIFY_REFRESH_TOKEN`.

4. **Create the `.env` file** in the project root from `.env.example`, filling
   in the MQTT credentials (the same ones generated for `display-server` in
   step 2), MongoDB credentials, Open-Meteo coordinates, and the Spotify
   credentials obtained in step 3.

5. **Start the stack**:
   ```bash
   docker compose up -d --build
   curl http://localhost:3001/api/health
   ```

6. **Configure and flash the firmware**: copy
   `firmware/src/secrets.h.example` to `firmware/src/secrets.h`, fill in the
   WiFi SSID/password, the broker host/port (host port, `1884`), the
   `display-esp32` credentials, and the backend host/port, then build and
   upload the firmware with PlatformIO (`freenove_cyd35` environment) with the
   ESP32 connected over USB. Details in
   [`firmware/README.md`](firmware/README.md).

7. **Enable automatic startup** by copying the units from `ops/systemd/` to
   `/etc/systemd/system/`, the sudoers entry from `ops/sudoers.d/` to
   `/etc/sudoers.d/`, then:
   ```bash
   sudo systemctl enable --now iot-display-hub-docker.service
   sudo systemctl enable --now iot-display-hub-shutdown-listener.service
   ```
   From here on, manage the stack with `./manage.sh {start|stop|restart|status}`.

### CI/CD

Two GitHub Actions workflows:

- **CI** (`.github/workflows/ci.yml`), on push/PR to `main`: server lint and
  test, production dependency security audit, firmware build check
  (PlatformIO, `freenove_cyd35` environment), Docker build of the server image
  without pushing
- **CD** (`.github/workflows/cd.yml`), on push of a `v*.*.*` tag: verifies that
  `FIRMWARE_VERSION` in `firmware/src/config.h` matches the tag, builds the
  firmware and publishes `firmware.bin` as a GitHub Release asset, builds and
  publishes the server image to GHCR (natively in arm64)

### License

MIT, see [`LICENSE`](LICENSE).