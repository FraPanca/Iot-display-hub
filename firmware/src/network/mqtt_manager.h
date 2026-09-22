#pragma once

#include <Arduino.h>

namespace mqtt_manager {

// Callback verso ui_manager per i topic data/* (esclusa data/firmware,
// gestita internamente da ota_manager). Nessun parsing JSON qui, solo instradamento.
typedef void (*ScreenDataCallback)(const String& topic, const String& payload);

void begin();
void loop();
bool isConnected();

// Va chiamata prima di begin()
void setScreenDataCallback(ScreenDataCallback callback);

// Funzioni di publish, formati e permessi ACL
void publishScreenCurrent(const char* screenId);
void publishWeatherDaySelect(int dayIndex);
void publishSpotifyControl(const char* action);
void publishShutdownRequest();
void publishOtaResult(const char* status, const char* version, const char* error = nullptr);

}