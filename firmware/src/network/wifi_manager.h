#pragma once

#include <Arduino.h>

namespace wifi_manager {

// Avvia la connessione WiFi, da chiamare una volta in setup()
void begin();

// Da chiamare ad ogni giro di loop(), gestisce riconnessione con backoff
void loop();

bool isConnected();

}