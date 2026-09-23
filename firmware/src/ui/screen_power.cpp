#include "screen_power.h"
#include "../network/mqtt_manager.h"
#include "../ota/ota_manager.h"
#include "ui_manager.h"
#include <ArduinoJson.h>

namespace screen_power {

namespace {

const int LCD_BL_PIN = 41;

lv_obj_t* updateFwBtn = nullptr;
lv_obj_t* statusLabel = nullptr;

bool backlightOff = false;
bool shutdownInProgress = false;

void setBacklight(bool on) {
    digitalWrite(LCD_BL_PIN, on ? HIGH : LOW);
    backlightOff = !on;
}

// Un tocco mentre il backlight e' spento serve solo a riaccenderlo, non deve
// anche attivare il bottone sottostante alla stessa pressione.
void tilePressedCb(lv_event_t* e) {
    if (!backlightOff) return;

    setBacklight(true);
    lv_indev_wait_release(lv_indev_get_act());

    mqtt_manager::publishScreenCurrent(ui_manager::activeScreenId());
}

void turnOffDisplayCb(lv_event_t* e) {
    mqtt_manager::publishScreenCurrent("off");
    setBacklight(false);
}

void shutdownPiCb(lv_event_t* e) {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    mqtt_manager::publishShutdownRequest();
    lv_label_set_text(statusLabel, "Richiesta di spegnimento inviata...");
}

void updateFwCb(lv_event_t* e) {
    lv_label_set_text(statusLabel, "Aggiornamento in corso...");
    // startUpdate() e' bloccante (download e flash sincroni): il display
    // resta fermo sull'ultimo frame disegnato finche' non riavvia da solo
    // o la chiamata ritorna false. Nessuna barra di progresso live possibile
    // senza rendere ota_manager cooperativo con lv_timer_handler().
    if (!ota_manager::startUpdate()) {
        lv_label_set_text(statusLabel, "Aggiornamento fallito, vedi log seriale");
    }
}

void otaCheckTimerCb(lv_timer_t* timer) {
    if (ota_manager::isUpdateAvailable()) {
        lv_obj_clear_flag(updateFwBtn, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(updateFwBtn, LV_OBJ_FLAG_HIDDEN);
    }
}

}

void create(lv_obj_t* parent) {
    pinMode(LCD_BL_PIN, OUTPUT);
    digitalWrite(LCD_BL_PIN, HIGH);

    // Tempo di pressione prolungata (2s) impostato in main.cpp sul driver
    // indev prima della registrazione, vale per tutte le schermate ma solo
    // qui si ascolta LV_EVENT_LONG_PRESSED.

    lv_obj_add_flag(parent, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(parent, tilePressedCb, LV_EVENT_PRESSED, nullptr);

    lv_obj_set_flex_flow(parent, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(parent, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    lv_obj_t* displayBtn = lv_btn_create(parent);
    lv_obj_add_flag(displayBtn, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(displayBtn, turnOffDisplayCb, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* displayLabel = lv_label_create(displayBtn);
    lv_label_set_text(displayLabel, "Spegni display");

    lv_obj_t* shutdownPiBtn = lv_btn_create(parent);
    lv_obj_add_flag(shutdownPiBtn, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(shutdownPiBtn, shutdownPiCb, LV_EVENT_LONG_PRESSED, nullptr);
    lv_obj_t* shutdownLabel = lv_label_create(shutdownPiBtn);
    lv_label_set_text(shutdownLabel, "Tieni premuto: spegni Raspberry Pi");

    updateFwBtn = lv_btn_create(parent);
    lv_obj_add_flag(updateFwBtn, LV_OBJ_FLAG_EVENT_BUBBLE);
    lv_obj_add_event_cb(updateFwBtn, updateFwCb, LV_EVENT_LONG_PRESSED, nullptr);
    lv_obj_t* updateLabel = lv_label_create(updateFwBtn);
    lv_label_set_text(updateLabel, "Tieni premuto: aggiorna firmware");
    lv_obj_add_flag(updateFwBtn, LV_OBJ_FLAG_HIDDEN);

    statusLabel = lv_label_create(parent);
    lv_label_set_text(statusLabel, "");

    lv_timer_create(otaCheckTimerCb, 5000, nullptr);
}

void update(const String& payload) {
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.print("[screen_power] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    const char* state = doc["state"];
    if (state != nullptr && strcmp(state, "shutting_down") == 0) {
        lv_label_set_text(statusLabel, "Spegnimento in corso...");
    }
}

}