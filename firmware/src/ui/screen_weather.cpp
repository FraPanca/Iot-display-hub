#include "screen_weather.h"
#include "../network/mqtt_manager.h"
#include "../assets/icons/weather_icons.h"
#include "../assets/fonts/fonts_it.h"
#include "theme.h"
#include <ArduinoJson.h>

namespace screen_weather {

namespace {

lv_obj_t* iconObj = nullptr;
lv_obj_t* tempLabel = nullptr;
lv_obj_t* humidityLabel = nullptr;
lv_obj_t* windLabel = nullptr;
lv_obj_t* precipLabel = nullptr;
lv_obj_t* dayButtons[5] = { nullptr };

DynamicJsonDocument weatherDoc(2048);

const lv_img_dsc_t* iconForCondition(const char* condition) {
    if (strcmp(condition, "clear") == 0) return &icon_clear;
    if (strcmp(condition, "partly_cloudy") == 0) return &icon_partly_cloudy;
    if (strcmp(condition, "cloudy") == 0) return &icon_cloudy;
    if (strcmp(condition, "rain") == 0) return &icon_rain;
    if (strcmp(condition, "thunderstorm") == 0) return &icon_thunderstorm;
    if (strcmp(condition, "snow") == 0) return &icon_snow;
    if (strcmp(condition, "fog") == 0) return &icon_fog;
    return &icon_cloudy;
}

void showDay(JsonObject day) {
    const char* condition = day["condition"];
    double tempMin = day["temp_min"];
    double tempMax = day["temp_max"];
    int precipProb = day["precip_prob"];

    lv_img_set_src(iconObj, iconForCondition(condition));

    char buf[32];
    snprintf(buf, sizeof(buf), "%.0f / %.0f°C", tempMin, tempMax);
    lv_label_set_text(tempLabel, buf);
    snprintf(buf, sizeof(buf), "Pioggia %d%%", precipProb);
    lv_label_set_text(precipLabel, buf);
}

void showCurrent(JsonObject current) {
    const char* condition = current["condition"];
    double temp = current["temp"];
    int humidity = current["humidity"];
    double wind = current["wind_speed"];
    int precipProb = current["precip_prob"];

    lv_img_set_src(iconObj, iconForCondition(condition));

    char buf[32];
    snprintf(buf, sizeof(buf), "%.1f°C", temp);
    lv_label_set_text(tempLabel, buf);
    snprintf(buf, sizeof(buf), "Umidità %d%%", humidity);
    lv_label_set_text(humidityLabel, buf);
    snprintf(buf, sizeof(buf), "Vento %.0f km/h", wind);
    lv_label_set_text(windLabel, buf);
    snprintf(buf, sizeof(buf), "Pioggia %d%%", precipProb);
    lv_label_set_text(precipLabel, buf);
}

void dayButtonEventCb(lv_event_t* e) {
    int dayIndex = (int)(intptr_t)lv_event_get_user_data(e);

    for (int i = 0; i < 5; i++) {
        if (i == dayIndex) {
            lv_obj_add_state(dayButtons[i], LV_STATE_CHECKED);
        } else {
            lv_obj_clear_state(dayButtons[i], LV_STATE_CHECKED);
        }
    }

    JsonArray forecast = weatherDoc["forecast"].as<JsonArray>();
    if (dayIndex >= 0 && dayIndex < (int)forecast.size()) {
        showDay(forecast[dayIndex]);
    }

    mqtt_manager::publishWeatherDaySelect(dayIndex);
}

}

void create(lv_obj_t* parent) {
    lv_obj_set_flex_flow(parent, LV_FLEX_FLOW_COLUMN);

    lv_obj_t* topArea = lv_obj_create(parent);
    lv_obj_set_size(topArea, LV_PCT(100), LV_PCT(60));
    lv_obj_set_style_border_width(topArea, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(topArea, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_flex_flow(topArea, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(topArea, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    iconObj = lv_img_create(topArea);
    lv_obj_set_size(iconObj, LV_PCT(35), LV_PCT(90));

    lv_obj_t* infoCol = lv_obj_create(topArea);
    lv_obj_set_size(infoCol, LV_PCT(60), LV_PCT(90));
    lv_obj_set_style_border_width(infoCol, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(infoCol, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_clear_flag(infoCol, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_set_flex_flow(infoCol, LV_FLEX_FLOW_COLUMN);

    tempLabel = lv_label_create(infoCol);
    lv_obj_set_style_text_font(tempLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    theme::stylePrimaryText(tempLabel);
    humidityLabel = lv_label_create(infoCol);
    lv_obj_set_style_text_font(humidityLabel, &font_body_it, LV_PART_MAIN);
    theme::styleSecondaryText(humidityLabel);
    windLabel = lv_label_create(infoCol);
    lv_obj_set_style_text_font(windLabel, &font_body_it, LV_PART_MAIN);
    theme::styleSecondaryText(windLabel);
    precipLabel = lv_label_create(infoCol);
    lv_obj_set_style_text_font(precipLabel, &font_body_it, LV_PART_MAIN);
    theme::styleSecondaryText(precipLabel);

    lv_obj_t* divider = lv_obj_create(parent);
    lv_obj_set_size(divider, LV_PCT(95), 2);
    lv_obj_set_style_bg_color(divider, theme::dividerColor(), LV_PART_MAIN);
    lv_obj_set_style_border_width(divider, 0, LV_PART_MAIN);

    lv_obj_t* bottomArea = lv_obj_create(parent);
    lv_obj_set_size(bottomArea, LV_PCT(100), LV_PCT(40));
    lv_obj_set_style_border_width(bottomArea, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(bottomArea, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_flex_flow(bottomArea, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(bottomArea, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    static const char* dayPlaceholders[5] = { "Oggi", "+1", "+2", "+3", "+4" };
    for (int i = 0; i < 5; i++) {
        lv_obj_t* btn = lv_btn_create(bottomArea);
        theme::styleButton(btn);
        lv_obj_set_size(btn, LV_PCT(17), LV_PCT(80));
        lv_obj_add_flag(btn, LV_OBJ_FLAG_CHECKABLE);
        lv_obj_add_event_cb(btn, dayButtonEventCb, LV_EVENT_CLICKED, (void*)(intptr_t)i);

        lv_obj_t* label = lv_label_create(btn);
        lv_label_set_text(label, dayPlaceholders[i]);
        lv_obj_center(label);

        dayButtons[i] = btn;
    }

    lv_obj_add_state(dayButtons[0], LV_STATE_CHECKED);
}

void update(const String& payload) {
    DeserializationError err = deserializeJson(weatherDoc, payload);
    if (err) {
        Serial.print("[screen_weather] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    JsonArray forecast = weatherDoc["forecast"].as<JsonArray>();
    for (int i = 0; i < 5 && i < (int)forecast.size(); i++) {
        const char* dayName = forecast[i]["day"];
        if (dayName != nullptr) {
            lv_obj_t* label = lv_obj_get_child(dayButtons[i], 0);
            lv_label_set_text(label, dayName);
        }
    }

    showCurrent(weatherDoc["current"].as<JsonObject>());

    for (int i = 0; i < 5; i++) {
        lv_obj_clear_state(dayButtons[i], LV_STATE_CHECKED);
    }
    lv_obj_add_state(dayButtons[0], LV_STATE_CHECKED);
}

}