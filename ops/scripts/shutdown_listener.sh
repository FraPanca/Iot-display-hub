#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/home/francesco/iot-display-hub"
ENV_FILE="$PROJECT_ROOT/.env"
SHUTDOWN_SCRIPT="$PROJECT_ROOT/ops/scripts/shutdown.sh"
TOPIC="display/cyd-01/event/system/shutdown"

# Riusa MQTT_USER e MQTT_PASSWORD gia definiti in .env per display-server
set -a
source "$ENV_FILE"
set +a

mosquitto_sub -h localhost -p 1883 -u "$MQTT_USER" -P "$MQTT_PASSWORD" -i shutdown-listener -t "$TOPIC" | while read -r payload; do
  if echo "$payload" | grep -q '"target"[[:space:]]*:[[:space:]]*"pi"'; then
    log_line="shutdown_listener: comando shutdown ricevuto, esecuzione in corso"
    echo "$log_line"
    sudo "$SHUTDOWN_SCRIPT"
  fi
done