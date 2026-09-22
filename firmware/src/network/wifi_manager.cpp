#include "wifi_manager.h"
#include "../secrets.h"
#include <WiFi.h>

namespace wifi_manager {

namespace {
    unsigned long lastAttemptMs = 0;
    unsigned long backoffMs = 1000;
    const unsigned long BACKOFF_MAX_MS = 30000;
    bool wasConnected = false;
}

void begin() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastAttemptMs = millis();
    Serial.println("[wifi] connessione in corso");
}

void loop() {
    bool connected = (WiFi.status() == WL_CONNECTED);

    if (connected && !wasConnected) {
        Serial.print("[wifi] connesso, IP: ");
        Serial.println(WiFi.localIP());
        backoffMs = 1000;
    }

    if (!connected && wasConnected) {
        Serial.println("[wifi] connessione persa");
    }

    if (!connected) {
        unsigned long now = millis();
        if (now - lastAttemptMs >= backoffMs) {
            Serial.println("[wifi] tentativo di riconnessione");
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
            lastAttemptMs = now;
            backoffMs = (backoffMs * 2 < BACKOFF_MAX_MS) ? backoffMs * 2 : BACKOFF_MAX_MS;
        }
    }

    wasConnected = connected;
}

bool isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

}