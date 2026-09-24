#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/francesco/iot-display-hub"
ENV_FILE="$PROJECT_ROOT/.env"
SHUTDOWN_SCRIPT="$PROJECT_ROOT/ops/scripts/shutdown.sh"
TOPIC="display/cyd-01/event/system/shutdown"

# Vero se il payload chiede lo spegnimento del Pi. Isolata cosi da poter
# essere testata da ops/tests/shutdown_test.sh senza avviare il listener reale
payload_targets_pi() {
  echo "$1" | grep -q '"target"[[:space:]]*:[[:space:]]*"pi"'
}

main() {
  # Riusa MQTT_USER e MQTT_PASSWORD gia definiti in .env per display-server
  set -a
  source "$ENV_FILE"
  set +a

  mosquitto_sub -h localhost -p 1884 -u "$MQTT_USER" -P "$MQTT_PASSWORD" -i shutdown-listener -t "$TOPIC" | while read -r payload; do
    if payload_targets_pi "$payload"; then
      echo "shutdown_listener: comando shutdown ricevuto, esecuzione in corso"
      sudo "$SHUTDOWN_SCRIPT"
    fi
  done
}

# Esegue main solo se lo script e lanciato direttamente, non se sourced per i test
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi