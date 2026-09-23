#pragma once

#include <Arduino.h>

namespace ui_manager {

// Costruisce il tileview con le sei schermate e lo stile globale.
// Va chiamata dopo l'inizializzazione di LVGL e del driver display in main.cpp.
void init();

// Da chiamare ad ogni giro di loop(), esegue lv_timer_handler()
void loop();

// Inoltra un payload ricevuto via MQTT al modulo screen corretto.
// Firma allineata a mqtt_manager::ScreenDataCallback
void dispatch(const String& topic, const String& payload);

// Id della schermata attualmente attiva sul tileview (valore da SCREEN_ID_STRINGS).
// Usato da screen_power per ripubblicare l'ultima schermata dopo il risveglio.
const char* activeScreenId();

}