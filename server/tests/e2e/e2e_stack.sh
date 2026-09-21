#!/usr/bin/env bash
# Test end-to-end contro lo stack Docker Compose reale (mosquitto, mongodb, redis, server)
# Uso: MQTT_ESP32_PASS=xxx bash server/tests/e2e/e2e_stack.sh
#
# Simula il display: pubblica screen/current come display-esp32 e verifica che il
# server risponda con i dati attesi. Lo stack deve essere gia in esecuzione (docker compose up -d).
# Non pubblica mai event/system/shutdown: il listener host spegnerebbe davvero il Pi.
# Se il display fisico e acceso, i timer del server seguiranno le schermate simulate qui
# fino al prossimo swipe reale.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$SCRIPT_DIR/../../../docker-compose.yml}"

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1884}"
API_URL="${API_URL:-http://localhost:3001}"
DEVICE_ID="${DEVICE_ID:-cyd-01}"
ESP32_USER="display-esp32"
ESP32_PASS="${MQTT_ESP32_PASS:-}"
PREFIX="display/$DEVICE_ID"

# Attesa massima (secondi) per il primo dato dopo il cambio schermata
WAIT_LOCAL=8
WAIT_EXTERNAL=20

if [ -z "$ESP32_PASS" ]; then
    echo "Imposta MQTT_ESP32_PASS prima di lanciare lo script"
    exit 1
fi

for cmd in docker curl mosquitto_pub mosquitto_sub; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Comando mancante: $cmd"
        exit 1
    fi
done

PASS_COUNT=0
FAIL_COUNT=0

check() {
    local label="$1" expected="$2" actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "[PASS] $label"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "[FAIL] $label (atteso: $expected, ottenuto: $actual)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

mqtt_pub() {
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" -q 1 "$@" >/dev/null 2>&1
}

# Cambia schermata e ritorna il primo messaggio ricevuto sul topic dati, vuoto se scade il timeout
first_message_after_screen() {
    local screen="$1" data_topic="$2" timeout="$3"
    local outfile
    outfile=$(mktemp)

    mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" \
        -t "$PREFIX/data/$data_topic" -C 1 -W "$timeout" > "$outfile" 2>/dev/null &
    local sub_pid=$!

    sleep 1
    mqtt_pub -t "$PREFIX/screen/current" -m "$screen"

    wait "$sub_pid" 2>/dev/null
    cat "$outfile"
    rm -f "$outfile"
}

screen_check() {
    local label="$1" screen="$2" data_topic="$3" pattern="$4" timeout="$5"
    local message
    message=$(first_message_after_screen "$screen" "$data_topic" "$timeout")

    if echo "$message" | grep -q "$pattern"; then
        check "$label" "ok" "ok"
    else
        check "$label" "messaggio con $pattern" "${message:-nessun messaggio entro ${timeout}s}"
    fi
}

echo "=== Stack Docker ==="

RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | sort | tr '\n' ' ')
for service in mongodb mosquitto redis server; do
    if echo "$RUNNING" | grep -qw "$service"; then
        check "servizio $service in esecuzione" "ok" "ok"
    else
        check "servizio $service in esecuzione" "ok" "non in esecuzione"
    fi
done
echo ""

echo "=== Health check del backend ==="

HEALTH_CODE="000"
for _ in $(seq 1 15); do
    HEALTH_CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/health")
    [ "$HEALTH_CODE" = "200" ] && break
    sleep 2
done
check "GET /api/health risponde 200" "200" "$HEALTH_CODE"

HEALTH_BODY=$(curl -s "$API_URL/api/health")
for dependency in mongodb redis mqtt; do
    if echo "$HEALTH_BODY" | grep -q "\"$dependency\":\"ok\""; then
        check "dipendenza $dependency raggiunta dal server" "ok" "ok"
    else
        check "dipendenza $dependency raggiunta dal server" "ok" "errore"
    fi
done
echo ""

echo "=== Cambio schermata, pubblicazione dato ==="

# Senza questo, la deduplica sysmon puo saltare la pubblicazione immediata
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli DEL sysmon:last >/dev/null 2>&1

screen_check "clock: data/clock con orario HH:mm" "clock" "clock" '"time":"[0-9][0-9]:[0-9][0-9]"' "$WAIT_LOCAL"
screen_check "sysmon: data/sysmon con metriche e servizi" "sysmon" "sysmon" '"cpu_percent".*"services"' "$WAIT_LOCAL"
screen_check "quote: data/quote con testo (serve seedQuotes.js eseguito)" "quote" "quote" '"text":"' "$WAIT_LOCAL"
screen_check "weather: data/weather con previsioni (serve rete verso Open-Meteo)" "weather" "weather" '"forecast"' "$WAIT_EXTERNAL"
screen_check "spotify: data/spotify con stato (servono credenziali Spotify)" "spotify" "spotify" '"is_playing"' "$WAIT_EXTERNAL"
echo ""

echo "=== Schermata off ferma i timer ==="

# sysmon ha il timer piu corto (15s): dopo off non deve piu arrivare nulla
mqtt_pub -t "$PREFIX/screen/current" -m "sysmon"
sleep 2
mqtt_pub -t "$PREFIX/screen/current" -m "off"
sleep 1

OFF_OUT=$(mktemp)
mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" \
    -t "$PREFIX/data/sysmon" -C 1 -W 18 > "$OFF_OUT" 2>/dev/null
OFF_RECEIVED=$(cat "$OFF_OUT")
rm -f "$OFF_OUT"
check "nessun data/sysmon per 18s dopo screen/current=off" "" "$OFF_RECEIVED"
echo ""

echo "=== Robustezza ==="

mqtt_pub -t "$PREFIX/event/spotify/control" -m "{non valido"
mqtt_pub -t "$PREFIX/event/weather/day_select" -m "non json"
sleep 2
HEALTH_AFTER=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/api/health")
check "il server resta sano dopo payload malformati" "200" "$HEALTH_AFTER"

mqtt_pub -t "$PREFIX/screen/current" -m "off"
echo ""

echo "Riepilogo: $PASS_COUNT passati, $FAIL_COUNT falliti"
echo "Nota: event/system/shutdown non e testato qui di proposito, va verificato con TEST-OPS."

[ "$FAIL_COUNT" -eq 0 ]
