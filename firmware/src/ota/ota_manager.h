#pragma once

#include <Arduino.h>

namespace ota_manager {

// Da chiamare da mqtt_manager alla ricezione di data/firmware
void handleFirmwarePayload(const String& payload);

bool isUpdateAvailable();

// Valida solo se isUpdateAvailable() e true
String availableVersion();

// Avvia download e flash, da chiamare solo dopo conferma utente sulla schermata power.
// Ritorna false se non e stato possibile nemmeno avviare l'operazione
bool startUpdate();

// Percentuale 0-100, utile per la barra di avanzamento in screen_power
int progressPercent();

// Da chiamare in setup(), dopo aver confermato connettivita WiFi/MQTT,
// per confermare il boot ed evitare il rollback automatico
void confirmBootIfPending();

}