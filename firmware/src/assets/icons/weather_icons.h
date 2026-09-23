#pragma once

#include "lvgl.h"

// Icone meteo reali (Tabler Icons, MIT), rasterizzate 64x64 RGB565 con
// byte swap per LV_COLOR_16_SWAP. Dettagli pipeline in Attribution.md.

extern lv_img_dsc_t icon_clear;
extern lv_img_dsc_t icon_partly_cloudy;
extern lv_img_dsc_t icon_cloudy;
extern lv_img_dsc_t icon_rain;
extern lv_img_dsc_t icon_thunderstorm;
extern lv_img_dsc_t icon_snow;
extern lv_img_dsc_t icon_fog;

// Da chiamare una volta prima che una schermata usi queste icone.
void weather_icons_init();