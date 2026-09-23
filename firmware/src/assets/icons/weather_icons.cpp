#include "weather_icons.h"

namespace {

const int ICON_SIZE = 48;

uint16_t bufClear[ICON_SIZE * ICON_SIZE];
uint16_t bufPartlyCloudy[ICON_SIZE * ICON_SIZE];
uint16_t bufCloudy[ICON_SIZE * ICON_SIZE];
uint16_t bufRain[ICON_SIZE * ICON_SIZE];
uint16_t bufThunderstorm[ICON_SIZE * ICON_SIZE];
uint16_t bufSnow[ICON_SIZE * ICON_SIZE];
uint16_t bufFog[ICON_SIZE * ICON_SIZE];

uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
    return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

// LV_COLOR_16_SWAP e' attivo per questo pannello (vedi lv_conf.h): il byte
// order in memoria va invertito rispetto al normale RGB565 little endian,
// stessa logica gia' usata per la copertina Spotify in screen_spotify.cpp.
uint16_t swap16(uint16_t v) {
    return (uint16_t)((v >> 8) | (v << 8));
}

void fill(uint16_t* buf, uint8_t r, uint8_t g, uint8_t b) {
    uint16_t color = swap16(rgb565(r, g, b));
    for (int i = 0; i < ICON_SIZE * ICON_SIZE; i++) {
        buf[i] = color;
    }
}

void setupDsc(lv_img_dsc_t& dsc, uint16_t* buf) {
    dsc.header.always_zero = 0;
    dsc.header.w = ICON_SIZE;
    dsc.header.h = ICON_SIZE;
    dsc.header.cf = LV_IMG_CF_TRUE_COLOR;
    dsc.data_size = ICON_SIZE * ICON_SIZE * 2;
    dsc.data = (const uint8_t*)buf;
}

}

lv_img_dsc_t icon_clear;
lv_img_dsc_t icon_partly_cloudy;
lv_img_dsc_t icon_cloudy;
lv_img_dsc_t icon_rain;
lv_img_dsc_t icon_thunderstorm;
lv_img_dsc_t icon_snow;
lv_img_dsc_t icon_fog;

void weather_icons_init() {
    fill(bufClear, 255, 200, 0);
    fill(bufPartlyCloudy, 180, 200, 255);
    fill(bufCloudy, 170, 170, 170);
    fill(bufRain, 60, 110, 220);
    fill(bufThunderstorm, 100, 80, 160);
    fill(bufSnow, 230, 230, 240);
    fill(bufFog, 200, 200, 200);

    setupDsc(icon_clear, bufClear);
    setupDsc(icon_partly_cloudy, bufPartlyCloudy);
    setupDsc(icon_cloudy, bufCloudy);
    setupDsc(icon_rain, bufRain);
    setupDsc(icon_thunderstorm, bufThunderstorm);
    setupDsc(icon_snow, bufSnow);
    setupDsc(icon_fog, bufFog);
}