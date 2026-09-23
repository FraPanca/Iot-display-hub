#include "screen_sysmon.h"
#include "theme.h"
#include <ArduinoJson.h>

namespace screen_sysmon {

namespace {

lv_obj_t* cpuLabel = nullptr;
lv_obj_t* memLabel = nullptr;
lv_obj_t* diskLabel = nullptr;
lv_obj_t* tempLabel = nullptr;
lv_obj_t* servicesList = nullptr;

lv_color_t statusColor(const char* status) {
    if (strcmp(status, "ok") == 0) return lv_palette_main(LV_PALETTE_GREEN);
    if (strcmp(status, "warning") == 0) return lv_palette_main(LV_PALETTE_YELLOW);
    return lv_palette_main(LV_PALETTE_RED);
}

}

void create(lv_obj_t* parent) {
    lv_obj_set_flex_flow(parent, LV_FLEX_FLOW_COLUMN);

    lv_obj_t* metricsRow = lv_obj_create(parent);
    lv_obj_set_size(metricsRow, LV_PCT(100), LV_PCT(35));
    lv_obj_set_style_border_width(metricsRow, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(metricsRow, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_flex_flow(metricsRow, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(metricsRow, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    cpuLabel = lv_label_create(metricsRow);
    memLabel = lv_label_create(metricsRow);
    diskLabel = lv_label_create(metricsRow);
    tempLabel = lv_label_create(metricsRow);
    lv_label_set_text(cpuLabel, "CPU --%");
    lv_label_set_text(memLabel, "MEM --%");
    lv_label_set_text(diskLabel, "DISK --%");
    lv_label_set_text(tempLabel, "-- C");

    lv_obj_t* divider = lv_obj_create(parent);
    lv_obj_set_size(divider, LV_PCT(90), 2);
    lv_obj_set_style_bg_color(divider, theme::dividerColor(), LV_PART_MAIN);
    lv_obj_set_style_border_width(divider, 0, LV_PART_MAIN);

    servicesList = lv_obj_create(parent);
    lv_obj_set_size(servicesList, LV_PCT(90), LV_PCT(55));
    lv_obj_set_style_border_width(servicesList, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(servicesList, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_flex_flow(servicesList, LV_FLEX_FLOW_COLUMN);
}

void update(const String& payload) {
    DynamicJsonDocument doc(1024);
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.print("[screen_sysmon] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    char buf[16];
    snprintf(buf, sizeof(buf), "CPU %.0f%%", (double)doc["cpu_percent"]);
    lv_label_set_text(cpuLabel, buf);
    snprintf(buf, sizeof(buf), "MEM %.0f%%", (double)doc["mem_percent"]);
    lv_label_set_text(memLabel, buf);
    snprintf(buf, sizeof(buf), "DISK %.0f%%", (double)doc["disk_percent"]);
    lv_label_set_text(diskLabel, buf);
    snprintf(buf, sizeof(buf), "%.1f C", (double)doc["temp_c"]);
    lv_label_set_text(tempLabel, buf);

    lv_obj_clean(servicesList);
    JsonArray services = doc["services"].as<JsonArray>();
    for (JsonObject svc : services) {
        const char* name = svc["name"];
        const char* status = svc["status"];
        if (name == nullptr || status == nullptr) continue;

        lv_obj_t* row = lv_obj_create(servicesList);
        lv_obj_set_size(row, LV_PCT(100), LV_SIZE_CONTENT);
        lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
        lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, LV_PART_MAIN);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

        lv_obj_t* dot = lv_obj_create(row);
        lv_obj_set_size(dot, 12, 12);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, LV_PART_MAIN);
        lv_obj_set_style_bg_color(dot, statusColor(status), LV_PART_MAIN);
        lv_obj_set_style_border_width(dot, 0, LV_PART_MAIN);

        lv_obj_t* nameLabel = lv_label_create(row);
        lv_label_set_text(nameLabel, name);
    }
}

}