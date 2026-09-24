#!/bin/bash
set -euo pipefail

# Test di verifica per ops/scripts/shutdown.sh e shutdown_listener.sh
# Non esegue mai un poweroff reale: usa sempre DRY_RUN=1 o comandi systemctl finti
# Test end-to-end reale (poweroff vero) resta volutamente fuori da questo script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SHUTDOWN_SH="$OPS_DIR/scripts/shutdown.sh"
LISTENER_SH="$OPS_DIR/scripts/shutdown_listener.sh"
SUDOERS_FILE="$OPS_DIR/sudoers.d/iot-display-hub"
UNIT_FILE="$OPS_DIR/systemd/iot-display-hub-shutdown-listener.service"

PASS=0
FAIL=0

section() {
  echo
  echo "=== $1 ==="
}

pass() {
  echo "OK: $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "FALLITO: $1"
  FAIL=$((FAIL + 1))
}

# 1. Verifica statica
section "Verifica statica (shellcheck)"
if command -v shellcheck >/dev/null 2>&1; then
  if shellcheck -S error "$SHUTDOWN_SH" "$LISTENER_SH"; then
    pass "shellcheck senza errori (SC1090 su source dinamico e un warning noto, ignorato)"
  else
    fail "shellcheck ha segnalato errori (vedi sopra)"
  fi
else
  echo "shellcheck non installato, salto questo controllo (apt install shellcheck)"
fi

# 2. Sequenza dry-run, ordine corretto
section "Sequenza dry-run"
output="$(DRY_RUN=1 "$SHUTDOWN_SH")"
echo "$output"
idx_stop1=$(echo "$output" | grep -n "iot-display-hub-docker.service" | head -1 | cut -d: -f1 || echo 0)
idx_stop2=$(echo "$output" | grep -n "iot-energy-docker.service" | head -1 | cut -d: -f1 || echo 0)
idx_poweroff=$(echo "$output" | grep -n "systemctl poweroff" | head -1 | cut -d: -f1 || echo 0)
if [ "$idx_stop1" -gt 0 ] && [ "$idx_stop1" -lt "$idx_stop2" ] && [ "$idx_stop2" -lt "$idx_poweroff" ]; then
  pass "ordine stop progetto, stop tesi, poweroff rispettato"
else
  fail "ordine delle operazioni non rispettato"
fi

# 3. Regressione: il poweroff deve avvenire anche se uno stop fallisce
section "Resilienza a uno stop fallito (regressione)"
FAKE_BIN="$(mktemp -d)"
cat > "$FAKE_BIN/systemctl" << 'EOF'
#!/bin/bash
if [[ "$1" == "stop" && "$2" == "iot-energy-docker.service" ]]; then
  echo "systemctl: Unit iot-energy-docker.service not found." >&2
  exit 5
fi
exit 0
EOF
chmod +x "$FAKE_BIN/systemctl"
fail_output="$(PATH="$FAKE_BIN:$PATH" "$SHUTDOWN_SH" 2>&1)" && fail_exit=0 || fail_exit=$?
rm -rf "$FAKE_BIN"
if [ "$fail_exit" -eq 0 ] && echo "$fail_output" | grep -q "\[shutdown.sh\] poweroff"; then
  pass "poweroff raggiunto anche con uno stop fallito"
else
  fail "poweroff non raggiunto dopo uno stop fallito"
fi

# 4. Sudoers, verifica di sintassi
section "Sudoers (verifica di sintassi)"
if [ -f "$SUDOERS_FILE" ]; then
  if command -v visudo >/dev/null 2>&1; then
    if visudo -cf "$SUDOERS_FILE"; then
      pass "sintassi sudoers valida"
    else
      fail "sintassi sudoers non valida"
    fi
  else
    echo "visudo non trovato, salto il controllo di sintassi"
  fi
else
  echo "file $SUDOERS_FILE non trovato, salto il controllo"
fi
echo "Promemoria, verifica manuale reale sul Pi con l'utente listener:"
echo "  sudo -l        deve mostrare solo shutdown.sh in NOPASSWD"
echo "  sudo whoami    deve chiedere la password, non essere NOPASSWD"

# 5. Unit systemd del listener
section "Unit systemd del listener"
if [ -f "$UNIT_FILE" ]; then
  if grep -q "^Requires=.*docker" "$UNIT_FILE"; then
    fail "la unit usa ancora Requires= sul servizio Docker, rischio stop a cascata durante lo shutdown"
  else
    pass "nessun Requires= pericoloso sul servizio Docker"
  fi
  if grep -q "^Restart=always" "$UNIT_FILE"; then
    pass "Restart=always presente, riconnessione automatica dopo caduta del broker"
  else
    fail "manca Restart=always nella unit"
  fi
else
  echo "file $UNIT_FILE non trovato, salto il controllo"
fi

# 6. Listener, parsing del payload
section "Listener: parsing del payload"
# shellcheck disable=SC1090
source "$LISTENER_SH"

assert_trigger() {
  if payload_targets_pi "$1"; then
    pass "payload valido riconosciuto: $1"
  else
    fail "payload valido NON riconosciuto: $1"
  fi
}

assert_ignore() {
  if payload_targets_pi "$1"; then
    fail "payload da ignorare ha invece attivato il trigger: $1"
  else
    pass "payload correttamente ignorato: $1"
  fi
}

assert_trigger '{"target": "pi"}'
assert_trigger '{"target":"pi"}'
assert_ignore '{"target": "laptop"}'
assert_ignore '{}'
assert_ignore 'ciao mondo'
assert_ignore '{"target": "pi2"}'

echo "Nota, limite noto non risolto: un JSON malformato che contiene comunque"
echo "la sottostringa \"target\":\"pi\" (es. virgola in eccesso) attiva il trigger"
echo "lo stesso, e un campo target annidato in un altro oggetto lo attiva a torto."
echo "Il controllo e un grep, non un parser JSON. Non incluso come test perche"
echo "non ancora corretto nel codice, vedi 03-test-ops.md per il dettaglio."

# 7. Test live opzionale contro il broker reale
if [ "${1:-}" = "--live" ]; then
  section "Listener: test live contro il broker reale (porta 1884)"
  if ! command -v mosquitto_pub >/dev/null 2>&1; then
    echo "mosquitto_pub non trovato, impossibile eseguire il test live"
  else
    : "${MQTT_SERVER_PASS:?imposta MQTT_SERVER_PASS con la password di display-server}"
    TOPIC="display/cyd-01/event/system/shutdown"
    echo "Pubblico un payload con target diverso da pi, non deve attivare nulla"
    mosquitto_pub -h localhost -p 1884 -u display-server -P "$MQTT_SERVER_PASS" -t "$TOPIC" -m '{"target":"laptop"}'
    echo "Fatto. Verifica a mano che il listener non abbia invocato shutdown.sh (log del servizio)."
    echo "Il payload valido target=pi non viene mai pubblicato da questo script:"
    echo "farebbe spegnere davvero il Pi. Va fatto a mano solo nel test end-to-end finale."
  fi
else
  echo
  echo "Per il test live contro il broker reale (richiede il Pi con lo stack attivo):"
  echo "  MQTT_SERVER_PASS=... $0 --live"
fi

section "Riepilogo"
echo "Passati: $PASS"
echo "Falliti: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi