#!/usr/bin/env bash
# Verifica manuale di autenticazione, ACL, LWT e retain su Mosquitto
# Uso: MQTT_ESP32_PASS=xxx MQTT_SERVER_PASS=yyy bash acl_check.sh

set -u

MQTT_HOST="${MQTT_HOST:-localhost}"
MQTT_PORT="${MQTT_PORT:-1883}"
DEVICE_ID="${DEVICE_ID:-cyd-01}"

ESP32_USER="display-esp32"
SERVER_USER="display-server"
ESP32_PASS="${MQTT_ESP32_PASS:-}"
SERVER_PASS="${MQTT_SERVER_PASS:-}"

if [ -z "$ESP32_PASS" ] || [ -z "$SERVER_PASS" ]; then
    echo "Imposta MQTT_ESP32_PASS e MQTT_SERVER_PASS prima di lanciare lo script"
    exit 1
fi

PASS_COUNT=0
FAIL_COUNT=0

check() {
    local label="$1"
    local expected="$2"
    local actual="$3"
    if [ "$expected" = "$actual" ]; then
        echo "[PASS] $label"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "[FAIL] $label (atteso: $expected, ottenuto: $actual)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# Pubblica un payload univoco e verifica se un lettore lo riceve davvero.
# Ritorna "delivered" o "not_delivered", non un codice di uscita.
test_delivery() {
    local sub_user="$1" sub_pass="$2" topic_sub="$3"
    local pub_user="$4" pub_pass="$5" topic_pub="$6" payload="$7"
    local outfile
    outfile=$(mktemp)

    mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$sub_user" -P "$sub_pass" \
        -t "$topic_sub" -C 1 -W 3 > "$outfile" 2>/dev/null &
    local sub_pid=$!

    sleep 1
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$pub_user" -P "$pub_pass" \
        -t "$topic_pub" -m "$payload" -q 1 >/dev/null 2>&1

    wait "$sub_pid" 2>/dev/null
    local received
    received=$(cat "$outfile" 2>/dev/null)
    rm -f "$outfile"

    if [ "$received" = "$payload" ]; then
        echo "delivered"
    else
        echo "not_delivered"
    fi
}

clear_retained() {
    local user="$1" pass="$2" topic="$3"
    mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$user" -P "$pass" -t "$topic" -r -n -q 1 >/dev/null 2>&1
}

echo "Pulizia retained residui da esecuzioni precedenti..."
clear_retained "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/screen/current"
clear_retained "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/status"
clear_retained "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/event/weather/day_select"
clear_retained "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/event/spotify/control"
clear_retained "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/data/clock"
sleep 1
echo ""

echo "=== Autenticazione ==="

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -t "display/$DEVICE_ID/status" -m "test" -q 1 >/dev/null 2>&1
check "Connessione anonima rifiutata" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "password-sbagliata" \
    -t "display/$DEVICE_ID/status" -m "test" -q 1 >/dev/null 2>&1
check "Credenziali errate rifiutate" "1" "$([ $? -ne 0 ] && echo 1 || echo 0)"

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" \
    -t "display/$DEVICE_ID/status" -m "test" -q 1 >/dev/null 2>&1
check "display-esp32 con credenziali corrette" "0" "$?"

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$SERVER_USER" -P "$SERVER_PASS" \
    -t "display/$DEVICE_ID/data/clock" -m '{"time":"00:00"}' -q 1 >/dev/null 2>&1
check "display-server con credenziali corrette" "0" "$?"

echo ""
echo "=== ACL display-esp32 (scrittura) ==="

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/screen/current" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/screen/current" "check-screen-$$")
check "esp32 puo scrivere su screen/current" "delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/event/#" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/event/weather/day_select" "check-event-$$")
check "esp32 puo scrivere su event/#" "delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/status" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/status" "check-status-$$")
check "esp32 puo scrivere su status" "delivered" "$result"

result=$(test_delivery "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/data/#" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/data/clock" "check-data-esp32-$$")
check "esp32 NON puo scrivere su data/#" "not_delivered" "$result"

echo ""
echo "=== ACL display-esp32 (lettura) ==="

result=$(test_delivery "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/data/#" \
    "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/data/clock" "check-data-read-$$")
check "esp32 puo leggere data/#" "delivered" "$result"

echo ""
echo "=== ACL display-server (scrittura) ==="

result=$(test_delivery "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/data/#" \
    "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/data/clock" "check-data-write-$$")
check "server puo scrivere su data/#" "delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/event/#" \
    "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/event/spotify/control" "check-event-deny-$$")
check "server NON puo scrivere su event/#" "not_delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/screen/current" \
    "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/screen/current" "check-screen-deny-$$")
check "server NON puo scrivere su screen/current" "not_delivered" "$result"

echo ""
echo "=== ACL display-server (lettura) ==="

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/screen/current" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/screen/current" "check-screen-read-$$")
check "server puo leggere screen/current" "delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/event/#" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/event/weather/day_select" "check-event-read-$$")
check "server puo leggere event/#" "delivered" "$result"

result=$(test_delivery "$SERVER_USER" "$SERVER_PASS" "display/$DEVICE_ID/status" \
    "$ESP32_USER" "$ESP32_PASS" "display/$DEVICE_ID/status" "check-status-read-$$")
check "server puo leggere status" "delivered" "$result"

echo ""
echo "=== Last Will and Testament ==="
echo "Client esp32 tenuto vivo da una subscribe in attesa, poi terminato con kill -9"

mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$SERVER_USER" -P "$SERVER_PASS" \
    -t "display/$DEVICE_ID/status" -C 1 -W 10 > /tmp/lwt_result.txt 2>/dev/null &
MON_PID=$!

sleep 1

mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" \
    --will-topic "display/$DEVICE_ID/status" --will-payload "offline" --will-qos 1 --will-retain \
    -t "display/$DEVICE_ID/data/#" -C 1 -W 30 >/dev/null 2>&1 &
CLIENT_PID=$!

sleep 1
kill -9 "$CLIENT_PID" 2>/dev/null

wait "$MON_PID" 2>/dev/null
lwt_payload=$(cat /tmp/lwt_result.txt 2>/dev/null)
check "LWT pubblica offline dopo disconnessione anomala" "offline" "$lwt_payload"
rm -f /tmp/lwt_result.txt

echo ""
echo "=== Retain ==="

mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$ESP32_USER" -P "$ESP32_PASS" \
    -t "display/$DEVICE_ID/screen/current" -m '"weather"' -r -q 1 >/dev/null 2>&1

retain_payload=$(mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" -u "$SERVER_USER" -P "$SERVER_PASS" \
    -t "display/$DEVICE_ID/screen/current" -C 1 -W 3 2>/dev/null)
check "Nuovo subscriber riceve subito il valore retained" '"weather"' "$retain_payload"

echo ""
echo "=== Riepilogo ==="
echo "Passati: $PASS_COUNT"
echo "Falliti: $FAIL_COUNT"

[ "$FAIL_COUNT" -eq 0 ]