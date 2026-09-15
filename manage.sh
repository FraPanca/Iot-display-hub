#!/bin/bash
set -euo pipefail

SERVICE="iot-display-hub-docker.service"

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
    ;;
  stop)
    sudo systemctl stop "$SERVICE"
    ;;
  restart)
    sudo systemctl restart "$SERVICE"
    ;;
  status)
    systemctl status "$SERVICE"
    ;;
  *)
    usage
    ;;
esac