#include "theme.h"

namespace theme {

namespace {

lv_style_t styleBtnMain;
lv_style_t styleBtnChecked;
bool buttonStyleInitialized = false;

lv_style_t styleToggleMain;
lv_style_t styleToggleChecked;
bool toggleStyleInitialized = false;

}

void styleTile(lv_obj_t* tile) {
    lv_obj_set_style_bg_color(tile, lv_color_hex(BG), LV_PART_MAIN);
    lv_obj_set_style_bg_opa(tile, LV_OPA_COVER, LV_PART_MAIN);
    lv_obj_set_style_border_width(tile, 0, LV_PART_MAIN);
    lv_obj_set_style_text_color(tile, lv_color_hex(TEXT_PRIMARY), LV_PART_MAIN);
}

void styleButton(lv_obj_t* btn) {
    if (!buttonStyleInitialized) {
        lv_style_init(&styleBtnMain);
        lv_style_set_bg_color(&styleBtnMain, lv_color_hex(SURFACE));
        lv_style_set_bg_opa(&styleBtnMain, LV_OPA_COVER);
        lv_style_set_border_width(&styleBtnMain, 0);
        lv_style_set_radius(&styleBtnMain, 14);
        lv_style_set_shadow_width(&styleBtnMain, 0);
        lv_style_set_text_color(&styleBtnMain, lv_color_hex(TEXT_PRIMARY));
        lv_style_set_pad_all(&styleBtnMain, 10);

        lv_style_init(&styleBtnChecked);
        lv_style_set_bg_color(&styleBtnChecked, lv_color_hex(ACCENT));
        lv_style_set_bg_opa(&styleBtnChecked, LV_OPA_COVER);
        lv_style_set_text_color(&styleBtnChecked, lv_color_hex(BG));

        buttonStyleInitialized = true;
    }

    lv_obj_add_style(btn, &styleBtnMain, LV_PART_MAIN);
    lv_obj_add_style(btn, &styleBtnChecked, (lv_style_selector_t)(LV_PART_MAIN | LV_STATE_CHECKED));
    lv_obj_add_style(btn, &styleBtnChecked, (lv_style_selector_t)(LV_PART_MAIN | LV_STATE_PRESSED));
}

void styleToggleButton(lv_obj_t* btn) {
    if (!toggleStyleInitialized) {
        lv_style_init(&styleToggleMain);
        lv_style_set_bg_color(&styleToggleMain, lv_color_hex(SURFACE));
        lv_style_set_bg_opa(&styleToggleMain, LV_OPA_COVER);
        lv_style_set_border_width(&styleToggleMain, 0);
        lv_style_set_radius(&styleToggleMain, 14);
        lv_style_set_shadow_width(&styleToggleMain, 0);
        lv_style_set_text_color(&styleToggleMain, lv_color_hex(TEXT_PRIMARY));
        lv_style_set_pad_all(&styleToggleMain, 10);

        lv_style_init(&styleToggleChecked);
        lv_style_set_bg_color(&styleToggleChecked, lv_color_hex(ACCENT_BLUE));
        lv_style_set_bg_opa(&styleToggleChecked, LV_OPA_COVER);
        lv_style_set_text_color(&styleToggleChecked, lv_color_hex(TEXT_PRIMARY));

        toggleStyleInitialized = true;
    }

    lv_obj_add_style(btn, &styleToggleMain, LV_PART_MAIN);
    lv_obj_add_style(btn, &styleToggleChecked, (lv_style_selector_t)(LV_PART_MAIN | LV_STATE_CHECKED));
}

lv_color_t dividerColor() {
    return lv_color_hex(DIVIDER);
}

void stylePrimaryText(lv_obj_t* label) {
    lv_obj_set_style_text_color(label, lv_color_hex(TEXT_PRIMARY), LV_PART_MAIN);
}

void styleSecondaryText(lv_obj_t* label) {
    lv_obj_set_style_text_color(label, lv_color_hex(TEXT_SECONDARY), LV_PART_MAIN);
}

}