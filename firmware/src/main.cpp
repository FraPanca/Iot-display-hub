#include <Arduino.h>
#include "config.h"
#include "network/wifi_manager.h"
#include "network/mqtt_manager.h"
#include "ota/ota_manager.h"

namespace ui_manager {
    void init();
    void loop();
    void dispatch(const String& topic, const String& payload);
}

namespace {
    bool bootConfirmed = false;
}

void setup() {
    Serial.begin(115200);

    // TODO: init display/touch e LVGL, prima di ui_manager::init()

    wifi_manager::begin();
    mqtt_manager::setScreenDataCallback(ui_manager::dispatch);
    mqtt_manager::begin();

    ui_manager::init();
}

void loop() {
    wifi_manager::loop();
    mqtt_manager::loop();

    if (!bootConfirmed && wifi_manager::isConnected() && mqtt_manager::isConnected()) {
        ota_manager::confirmBootIfPending();
        bootConfirmed = true;
    }

    // ui_manager::loop() chiamera lv_timer_handler() internamente
    ui_manager::loop();
}