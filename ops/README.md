# ops/

Script di sistema di [IoT Display Hub](../README.md), eseguiti sull'host del
Raspberry Pi, fuori Docker.

## Italiano

### Scopo

Il backend Node gira in un container e non ha accesso a `sudo` sull'host:
questa directory contiene tutto ciò che richiede privilegi di sistema o deve
sopravvivere ai container stessi.

- `scripts/shutdown.sh`: eseguito con privilegi root via `sudo` granulare.
  Ferma lo stack Docker di questo progetto, poi un altro stack eventualmente
  attivo sullo stesso Raspberry Pi, poi esegue `systemctl poweroff`. Continua
  la sequenza (loggando un avviso) anche se uno stop intermedio fallisce,
  così il poweroff finale non resta bloccato da un servizio già fermo o
  assente
- `scripts/shutdown_listener.sh`: processo separato eseguito sull'host, si
  sottoscrive a `event/system/shutdown` con le credenziali `display-server`
  (le stesse già usate dal backend, nessuna nuova credenziale) e invoca
  `shutdown.sh` alla ricezione di un payload valido. Il riconoscimento del
  payload (`payload_targets_pi()`) è isolato in una funzione, per poter
  essere testato senza avviare il listener reale
- `systemd/`: unit per l'avvio automatico dello stack Docker e del listener
- `sudoers.d/iot-display-hub`: `NOPASSWD` limitato esclusivamente
  all'esecuzione di `shutdown.sh` con path assoluto
- `tests/shutdown_test.sh`: verifica statica, dry-run e regressione per gli
  script sopra

### Comandi per lo sviluppo locale

```bash
# verifica completa (statica, dry-run, sudoers, unit, parsing payload)
ops/tests/shutdown_test.sh

# stessa verifica, con anche un test live contro il broker reale
# (richiede la password dell'utente display-server)
MQTT_SERVER_PASS=... ops/tests/shutdown_test.sh --live

# gestione dello stack tramite le unit systemd (mai docker compose a mano,
# così il controllo RequiresMountsFor viene sempre rispettato)
./manage.sh {start|stop|restart|status}
```

`manage.sh` gestisce sia `iot-display-hub-docker.service` sia
`iot-display-hub-shutdown-listener.service`.

### Variabili d'ambiente

Nessuna variabile d'ambiente dedicata in `ops/`: `shutdown_listener.sh` legge
`MQTT_USER`/`MQTT_PASSWORD` direttamente dal `.env` di root, la stessa coppia
di credenziali già usata dal backend per l'utente `display-server`.

### Dipendenza systemd del listener

La unit `iot-display-hub-shutdown-listener.service` usa
`After=network-online.target iot-display-hub-docker.service` e
`Wants=network-online.target iot-display-hub-docker.service`, non
`Requires=`. Scelta deliberata: con `Requires=`, un fallimento dello stack
Docker all'avvio (per esempio l'HDD esterno non ancora montato) impedirebbe
del tutto l'avvio del listener, che resterebbe inattivo fino a un riavvio
manuale anche dopo aver risolto il problema a monte. Con `Wants=`, il
listener parte comunque; se il broker non è raggiungibile il tentativo di
connessione fallisce, ma `Restart=always` lo rimanda su ogni pochi secondi,
riconnettendosi da solo appena lo stack Docker torna disponibile. Proprio
nello scenario in cui qualcosa va storto sul Raspberry Pi, cioè quando la
capacità di spegnimento remoto è più utile, questa scelta è più robusta di
una dipendenza forte che rischierebbe di lasciare il listener giù.

### Percorsi assoluti specifici dell'installazione

Gli script e le unit in questa directory contengono percorsi assoluti legati
all'installazione reale sul Raspberry Pi (utente di sistema, directory del
progetto). Se cambiano utente o percorso di deploy, vanno aggiornati di
conseguenza `ops/scripts/shutdown_listener.sh`,
`ops/sudoers.d/iot-display-hub` e
`ops/systemd/iot-display-hub-shutdown-listener.service`.

---

## English

### Purpose

The Node backend runs in a container and has no access to `sudo` on the host:
this directory holds everything that requires system privileges or has to
outlive the containers themselves.

- `scripts/shutdown.sh`: run with root privileges via granular `sudo`. Stops
  this project's Docker stack, then another stack possibly running on the
  same Raspberry Pi, then runs `systemctl poweroff`. It keeps going (logging
  a warning) even if an intermediate stop fails, so the final poweroff isn't
  blocked by a service that's already stopped or missing
- `scripts/shutdown_listener.sh`: a separate process running on the host,
  subscribing to `event/system/shutdown` with the `display-server`
  credentials (the same ones already used by the backend, no new credential)
  and invoking `shutdown.sh` on a valid payload. Payload recognition
  (`payload_targets_pi()`) is isolated in its own function, so it can be
  tested without starting the real listener
- `systemd/`: units for automatic startup of the Docker stack and the
  listener
- `sudoers.d/iot-display-hub`: `NOPASSWD` limited strictly to running
  `shutdown.sh` with an absolute path
- `tests/shutdown_test.sh`: static, dry-run and regression checks for the
  scripts above

### Local development commands

```bash
# full check (static, dry-run, sudoers, unit, payload parsing)
ops/tests/shutdown_test.sh

# same check, plus a live test against the real broker
# (requires the display-server user's password)
MQTT_SERVER_PASS=... ops/tests/shutdown_test.sh --live

# manage the stack through the systemd units (never docker compose by hand,
# so the RequiresMountsFor guard is always respected)
./manage.sh {start|stop|restart|status}
```

`manage.sh` manages both `iot-display-hub-docker.service` and
`iot-display-hub-shutdown-listener.service`.

### Environment variables

No dedicated environment variables in `ops/`: `shutdown_listener.sh` reads
`MQTT_USER`/`MQTT_PASSWORD` directly from the root `.env`, the same
credential pair already used by the backend for the `display-server` user.

### Listener systemd dependency

The `iot-display-hub-shutdown-listener.service` unit uses
`After=network-online.target iot-display-hub-docker.service` and
`Wants=network-online.target iot-display-hub-docker.service`, not
`Requires=`. This is deliberate: with `Requires=`, a failure of the Docker
stack at boot (for example the external HDD not mounted yet) would prevent
the listener from starting at all, leaving it inactive until a manual
restart even after the underlying issue is fixed. With `Wants=`, the
listener starts regardless; if the broker isn't reachable the connection
attempt fails, but `Restart=always` brings it back every few seconds,
reconnecting on its own as soon as the Docker stack becomes available.
Precisely in the scenario where something has gone wrong on the Raspberry
Pi, i.e. when remote shutdown capability matters most, this choice is more
robust than a hard dependency that could risk leaving the listener down.

### Installation-specific absolute paths

The scripts and units in this directory contain absolute paths tied to the
real Raspberry Pi installation (system user, project directory). If the
deployment user or path changes, update
`ops/scripts/shutdown_listener.sh`, `ops/sudoers.d/iot-display-hub` and
`ops/systemd/iot-display-hub-shutdown-listener.service` accordingly.