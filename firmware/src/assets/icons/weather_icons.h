#pragma once

#include "lvgl.h"

// Icone meteo placeholder (quadrati a tinta unita), da sostituire con le
// icone reali convertite tramite l'image converter LVGL una volta pronte
// le immagini sorgente.
// Bastano a rendere il progetto linkabile e testabile nel frattempo.

extern lv_img_dsc_t icon_clear;
extern lv_img_dsc_t icon_partly_cloudy;
extern lv_img_dsc_t icon_cloudy;
extern lv_img_dsc_t icon_rain;
extern lv_img_dsc_t icon_thunderstorm;
extern lv_img_dsc_t icon_snow;
extern lv_img_dsc_t icon_fog;

// Da chiamare una volta prima che una schermata usi queste icone.
void weather_icons_init();