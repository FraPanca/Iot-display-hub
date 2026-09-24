# mosquitto/

Configurazione del broker MQTT di [IoT Display Hub](../README.md).

## Italiano

### Scopo

Contiene la configurazione di Eclipse Mosquitto 2: listener, autenticazione
tramite password file, ACL per i due utenti del sistema (`display-esp32`,
`display-server`), persistenza e logging. Gira come servizio Docker Compose,
mappato sulla porta host `1884` (interna al container resta `1883`) per non
entrare in conflitto con il broker già attivo sul Raspberry Pi per un altro
progetto.

### Comandi per lo sviluppo locale

Il file `config/passwordfile` non è versionato con credenziali reali: va
generato una volta con `mosquitto_passwd`, usando l'immagine Docker per non
richiedere Mosquitto installato localmente:

```bash
# crea il file e aggiunge display-esp32 (richiede password interattiva)
docker run --rm -it -v "$(pwd)/config:/config" eclipse-mosquitto:2 \
  mosquitto_passwd -c /config/passwordfile display-esp32

# aggiunge display-server allo stesso file
docker run --rm -it -v "$(pwd)/config:/config" eclipse-mosquitto:2 \
  mosquitto_passwd /config/passwordfile display-server
```

Per testare manualmente ACL e comportamento del broker (autenticazione, Last
Will and Testament, retain) senza passare dal firmware o dal server reali:

```bash
mosquitto/tests/acl_check.sh
```

Script a esecuzione manuale, non integrato in CI.

### Variabili d'ambiente

Nessuna variabile d'ambiente dedicata: le credenziali usate dal server
(`MQTT_USER`, `MQTT_PASSWORD` per l'utente `display-server`) vivono nel `.env`
di root, condiviso con tutto lo stack (vedi
[`../server/README.md`](../server/README.md)). Le credenziali dell'utente
`display-esp32` vivono invece in `firmware/src/secrets.h`, lato firmware.

### ACL

Due utenti, permessi minimi necessari:

```
user display-esp32
topic write display/<id>/screen/current
topic write display/<id>/event/#
topic write display/<id>/status
topic read  display/<id>/data/#

user display-server
topic read  display/<id>/screen/current
topic read  display/<id>/event/#
topic read  display/<id>/status
topic write display/<id>/data/#
```

L'ESP32 non può mai scrivere su `data/#` (impersonare il server), il server
non può mai scrivere su `event/#` o `screen/current` (impersonare il
display).

---

## English

### Purpose

Holds the Eclipse Mosquitto 2 configuration: listener, password-file
authentication, ACL for the system's two users (`display-esp32`,
`display-server`), persistence and logging. Runs as a Docker Compose service,
mapped to host port `1884` (the container's internal port stays `1883`) to
avoid conflicting with a broker already running on the Raspberry Pi for
another project.

### Local development commands

`config/passwordfile` isn't versioned with real credentials: generate it once
with `mosquitto_passwd`, using the Docker image so Mosquitto doesn't need to
be installed locally:

```bash
# creates the file and adds display-esp32 (interactive password prompt)
docker run --rm -it -v "$(pwd)/config:/config" eclipse-mosquitto:2 \
  mosquitto_passwd -c /config/passwordfile display-esp32

# adds display-server to the same file
docker run --rm -it -v "$(pwd)/config:/config" eclipse-mosquitto:2 \
  mosquitto_passwd /config/passwordfile display-server
```

To manually test the ACL and broker behavior (authentication, Last Will and
Testament, retain) without going through the real firmware or server:

```bash
mosquitto/tests/acl_check.sh
```

A manually-run script, not wired into CI.

### Environment variables

No dedicated environment variables: the credentials used by the server
(`MQTT_USER`, `MQTT_PASSWORD` for the `display-server` user) live in the root
`.env`, shared across the whole stack (see
[`../server/README.md`](../server/README.md)). The `display-esp32` user's
credentials instead live in `firmware/src/secrets.h`, on the firmware side.

### ACL

Two users, minimum necessary permissions:

```
user display-esp32
topic write display/<id>/screen/current
topic write display/<id>/event/#
topic write display/<id>/status
topic read  display/<id>/data/#

user display-server
topic read  display/<id>/screen/current
topic read  display/<id>/event/#
topic read  display/<id>/status
topic write display/<id>/data/#
```

The ESP32 can never write to `data/#` (impersonating the server), the server
can never write to `event/#` or `screen/current` (impersonating the display).