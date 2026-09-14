#!/bin/bash
set -euo pipefail

# Eseguito con privilegi root tramite sudo
# Path assoluto vincolato nella entry sudoers, non spostare o rinominare senza aggiornarla

DRY_RUN="${DRY_RUN:-0}"

log() {
  echo "[shutdown.sh] $1"
}

run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY_RUN: $*"
  else
    "$@"
  fi
}

log "stop stack IoT Display Hub"
run systemctl stop iot-display-hub-docker.service

log "stop stack IoT Energy Monitor (progetto di tesi)"
run systemctl stop iot-energy-docker.service

log "poweroff"
run systemctl poweroff