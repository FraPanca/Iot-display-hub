#!/bin/bash
set -euo pipefail

SERVICE="iot-display-hub-docker.service"
SERVICE_LISTENER="iot-display-hub-shutdown-listener.service"

usage() {
  echo "Uso: $0 {start|stop|restart|status}"
  exit 1
}

if [ "${1:-}" = "" ]; then
  usage
fi

case "$1" in
  start)
    sudo systemctl start "$SERVICE"
    sudo systemctl start "$SERVICE_LISTENER"
    ;;
  stop)
    sudo systemctl stop "$SERVICE"
    sudo systemctl stop "$SERVICE_LISTENER"
    ;;
  restart)
    sudo systemctl restart "$SERVICE"
    sudo systemctl restart "$SERVICE_LISTENER"
    ;;
  status)
    systemctl status "$SERVICE"
    systemctl status "$SERVICE_LISTENER"
    ;;
  *)
    usage
    ;;
esac