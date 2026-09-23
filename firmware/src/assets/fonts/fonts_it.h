#pragma once

#include "lvgl.h"

// Font custom con supporto Latin-1 Supplement e punteggiatura tipografica.
// I Montserrat integrati in LVGL coprono solo ASCII base: le lettere
// accentate italiane (a, e, i, o, u accentate) apparivano come un quadratino.
// Generati con lv_font_conv da Montserrat-Regular.ttf, fonte
// github.com/JulietaUla/Montserrat (licenza SIL Open Font License),
// range 0x20-0x7E,0xA0-0xFF,0x2013-0x2014,0x2018-0x201F.

LV_FONT_DECLARE(font_body_it);   // 14px, corpo testo (frasi, sottotitoli)
LV_FONT_DECLARE(font_title_it);  // 24px, titoli (titolo traccia Spotify)