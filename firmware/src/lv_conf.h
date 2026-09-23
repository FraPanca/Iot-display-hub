#if 1
#ifndef LV_CONF_H
#define LV_CONF_H

// Profondita colore RGB565, richiesta dal pannello ST77922 su bus QSPI
#define LV_COLOR_DEPTH 16

// Necessario per questo pannello: senza, i colori risultano invertiti sul
// trasferimento QSPI
#define LV_COLOR_16_SWAP 1

// Allocatore standard interno di LVGL, nessun pool custom
#define LV_MEM_CUSTOM 0
#define LV_MEM_SIZE (48U * 1024U)

// Tick di sistema basato su millis(), nessuna chiamata manuale a lv_tick_inc()
#define LV_TICK_CUSTOM 1
#define LV_TICK_CUSTOM_INCLUDE "Arduino.h"
#define LV_TICK_CUSTOM_SYS_TIME_EXPR (millis())

// Font usati dalle schermate: 14 di default sui bottoni, 24 per il titolo
// Spotify, 48 per l'orario
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_MONTSERRAT_48 1

#endif
#endif