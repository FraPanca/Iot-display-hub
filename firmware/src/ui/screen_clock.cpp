#include "screen_clock.h"
#include "theme.h"
#include <ArduinoJson.h>

namespace screen_clock {

namespace {
    lv_obj_t* timeLabel = nullptr;
}

void create(lv_obj_t* parent) {
    timeLabel = lv_label_create(parent);
    lv_obj_set_style_text_font(timeLabel, &lv_font_montserrat_48, LV_PART_MAIN);
    theme::stylePrimaryText(timeLabel);
    lv_label_set_text(timeLabel, "--:--");
    lv_obj_center(timeLabel);
}

void update(const String& payload) {
    StaticJsonDocument<64> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.print("[screen_clock] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    const char* time = doc["time"];
    if (time == nullptr) {
        Serial.println("[screen_clock] campo time mancante");
        return;
    }

    lv_label_set_text(timeLabel, time);
}

}