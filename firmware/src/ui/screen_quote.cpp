#include "screen_quote.h"
#include "../assets/fonts/fonts_it.h"
#include "theme.h"
#include <ArduinoJson.h>

namespace screen_quote {

namespace {
    lv_obj_t* quoteLabel = nullptr;
}

void create(lv_obj_t* parent) {
    quoteLabel = lv_label_create(parent);
    lv_obj_set_style_text_font(quoteLabel, &font_body_it, LV_PART_MAIN);
    theme::stylePrimaryText(quoteLabel);
    lv_label_set_long_mode(quoteLabel, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(quoteLabel, LV_PCT(80));
    lv_obj_set_style_text_align(quoteLabel, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_label_set_text(quoteLabel, "");
    lv_obj_center(quoteLabel);
}

void update(const String& payload) {
    DynamicJsonDocument doc(512);
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.print("[screen_quote] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    const char* text = doc["text"];
    if (text == nullptr) {
        Serial.println("[screen_quote] campo text mancante");
        return;
    }

    lv_label_set_text(quoteLabel, text);
}

}