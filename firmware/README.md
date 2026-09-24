# firmware/

Firmware ESP32-S3 di [IoT Display Hub](../README.md), sviluppato con
PlatformIO.

## Italiano

### Scopo

Gira sul display Freenove ESP32-S3 CYD 3.5" (controller QSPI ST77922, touch
capacitivo I2C). Si connette a WiFi e broker MQTT, mostra le sei schermate
tramite LVGL 8.4.0 dentro un `lv_tileview` navigabile a swipe, e non fa alcuna
elaborazione applicativa: riceve payload già pronti dal server e li
visualizza. Gestisce anche l'aggiornamento firmware via rete, scaricando il
binario dal backend dopo conferma sulla schermata di spegnimento.

### Flashing via USB

Il flashing richiede una connessione USB diretta alla scheda: non è possibile
caricare il firmware su una connessione di rete.

### Variabili d'ambiente (`secrets.h`)

`secrets.h` non è versionato; `secrets.h.example` è il file da copiare
e compilare con valori reali:

| Costante | Uso |
|---|---|
| `WIFI_SSID`, `WIFI_PASSWORD` | Credenziali WiFi |
| `MQTT_HOST`, `MQTT_PORT` | Host e **porta host** del broker (`1884`, non `1883`) |
| `MQTT_USER`, `MQTT_PASSWORD` | Credenziali utente `display-esp32` |
| `SERVER_HOST`, `SERVER_PORT` | Backend HTTP, usato per la copertina Spotify e per l'aggiornamento firmware |

### Comandi per lo sviluppo locale

Con PlatformIO installato e la cartella `firmware/` aperta come progetto:

```bash
pio run -e freenove_cyd35              # build
pio run -e freenove_cyd35 -t upload    # upload (porta seriale auto-rilevata)
pio device monitor                     # monitor seriale
pio run -e freenove_cyd35 -t clean     # pulizia build
```

Ambiente PlatformIO: `freenove_cyd35` (definito in `platformio.ini`). Librerie
fissate a versione esatta, non un range: LVGL `8.4.0`, `256dpi/MQTT` `2.5.3`
(non `PubSubClient`, che non supporta realmente QoS 1). Schema di partizioni
`default_16MB.csv`, con due slot applicativi per l'aggiornamento via rete: va
deciso prima della primissima flash via USB, un cambio successivo richiede
comunque un reflash via cavo.

### Struttura interna (sintesi)

```
firmware/
├── platformio.ini
├── src/
│   ├── main.cpp, config.h, lv_conf.h, secrets.h.example
│   ├── network/      wifi_manager, mqtt_manager
│   ├── ui/            ui_manager, theme, screen_*
│   ├── assets/        icone meteo, font italiani (con ATTRIBUTION.md)
│   ├── http/          cover_fetcher (copertina Spotify)
│   └── ota/           ota_manager
├── lib/ST77922/       driver display/touch vendorizzato da Freenove
└── test/              test nativi PlatformIO/Unity, solo logica pura
                        non legata a hardware/LVGL
```

### Note operative

- **Attribuzioni asset**: sia le icone meteo (Tabler Icons, MIT) sia i font
  custom (Montserrat, SIL OFL) hanno un file `ATTRIBUTION.md` dedicato sotto
  `src/assets/icons/` e `src/assets/fonts/`.
- **Byte swap RGB565**: qualunque asset immagine raster scaricato o generato
  dinamicamente (oggi solo la copertina Spotify) richiede lo swap dei byte
  prima di passarlo a LVGL, per via di `LV_COLOR_16_SWAP 1` in `lv_conf.h`.
- **Aggiornamento via rete**: la pipeline di rilascio pubblica `firmware.bin`
  come asset di release ad ogni tag `v*.*.*`; `FIRMWARE_VERSION` in
  `config.h` deve corrispondere esattamente al tag, altrimenti il rilascio
  fallisce prima di compilare.

---

## English

### Purpose

Runs on the Freenove ESP32-S3 CYD 3.5" display (QSPI ST77922 controller, I2C
capacitive touch). Connects to WiFi and the MQTT broker, shows the six screens
through LVGL 8.4.0 inside a swipe-navigable `lv_tileview`, and does no
application-level processing: it receives ready-made payloads from the server
and displays them. It also handles over-the-air firmware updates, downloading
the binary from the backend after confirmation on the shutdown screen.

### Flashing over USB

Flashing requires a direct USB connection to the board: the firmware cannot be
uploaded over a network connection.

### Environment variables (`secrets.h`)

`secrets.h` isn't versioned; `secrets.h.example` is the file to copy
and fill in with real values:

| Constant | Used for |
|---|---|
| `WIFI_SSID`, `WIFI_PASSWORD` | WiFi credentials |
| `MQTT_HOST`, `MQTT_PORT` | Broker host and **host port** (`1884`, not `1883`) |
| `MQTT_USER`, `MQTT_PASSWORD` | `display-esp32` user credentials |
| `SERVER_HOST`, `SERVER_PORT` | Backend HTTP, used for the Spotify cover art and for firmware updates |

### Local development commands

With PlatformIO installed and the `firmware/` folder opened as a project:

```bash
pio run -e freenove_cyd35              # build
pio run -e freenove_cyd35 -t upload    # upload (serial port auto-detected)
pio device monitor                     # serial monitor
pio run -e freenove_cyd35 -t clean     # clean build
```

PlatformIO environment: `freenove_cyd35` (defined in `platformio.ini`).
Libraries pinned to an exact version, not a range: LVGL `8.4.0`,
`256dpi/MQTT` `2.5.3` (not `PubSubClient`, which doesn't really support QoS
1). Partition scheme `default_16MB.csv`, with two application slots for
over-the-air updates: this has to be decided before the very first USB flash,
a later change still requires a reflash over cable.

### Internal structure (summary)

```
firmware/
├── platformio.ini
├── src/
│   ├── main.cpp, config.h, lv_conf.h, secrets.h.example
│   ├── network/      wifi_manager, mqtt_manager
│   ├── ui/            ui_manager, theme, screen_*
│   ├── assets/        weather icons, Italian fonts (with ATTRIBUTION.md)
│   ├── http/          cover_fetcher (Spotify cover art)
│   └── ota/           ota_manager
├── lib/ST77922/       display/touch driver vendored from Freenove
└── test/              native PlatformIO/Unity tests, pure logic only,
                        not tied to hardware/LVGL
```

### Operational notes

- **Asset attributions**: both the weather icons (Tabler Icons, MIT) and the
  custom fonts (Montserrat, SIL OFL) have a dedicated `ATTRIBUTION.md` under
  `src/assets/icons/` and `src/assets/fonts/`.
- **RGB565 byte swap**: any raster image asset downloaded or generated
  dynamically (today only the Spotify cover) needs its bytes swapped before
  being passed to LVGL, because of `LV_COLOR_16_SWAP 1` in `lv_conf.h`.
- **Over-the-air updates**: the release pipeline publishes `firmware.bin` as
  a release asset on every `v*.*.*` tag; `FIRMWARE_VERSION` in `config.h`
  must exactly match the tag, otherwise the release fails before compiling.