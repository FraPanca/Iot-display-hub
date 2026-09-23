#include <Arduino.h>
#include "config.h"
#include "network/wifi_manager.h"
#include "network/mqtt_manager.h"
#include "ota/ota_manager.h"
#include "ui/ui_manager.h"
#include <ST77922.h>
#include <ST77922_Touch.h>
#include "lvgl.h"

namespace {

bool bootConfirmed = false;

ST77922 tft;
ST77922_TOUCH touch;

lv_disp_draw_buf_t drawBuf;
lv_color_t* dispBuf = nullptr;
lv_disp_drv_t dispDrv;
lv_indev_drv_t indevDrv;

void dispFlush(lv_disp_drv_t* drv, const lv_area_t* area, lv_color_t* colorP) {
    uint16_t w = area->x2 - area->x1 + 1;
    uint16_t h = area->y2 - area->y1 + 1;
    tft.Fill_Colors(area->x1, area->y1, w, h, (uint16_t*)colorP);
    lv_disp_flush_ready(drv);
}

// Arrotonda le aree di refresh a multipli di 4 pixel, requisito specifico
// del controller ST77922 per evitare corruzione grafica sui refresh parziali
void dispRounder(lv_disp_drv_t* drv, lv_area_t* area) {
    area->x1 = area->x1 & ~0x3;
    area->y1 = area->y1 & ~0x3;
    area->x2 = (area->x2 & ~0x3) + 3;
    area->y2 = (area->y2 & ~0x3) + 3;
}

void touchpadRead(lv_indev_drv_t* drv, lv_indev_data_t* data) {
    if (touch.Get_Touch()) {
        data->state = LV_INDEV_STATE_PRESSED;
        data->point.x = touch.touch.x[0];
        data->point.y = touch.touch.y[0];
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

void initDisplay() {
    // Il pannello e' fisicamente 320x480 (verticale). Rotazione 1 applica
    // la rotazione software della libreria per ottenere 480x320 orizzontale,
    // coerente con SCREEN_WIDTH/SCREEN_HEIGHT in config.h.
    tft.Set_Rotation(1);
    touch.init();
    touch.Set_Rotation(1);

    lv_init();

    // Buffer parziale (40 righe) in PSRAM. Un solo buffer, non doppio:
    // Fill_Colors trasmette in modo sincrono via spi_device_polling_transmit,
    // quindi un secondo buffer non porterebbe benefici di overlap reali.
    const uint32_t bufPixels = SCREEN_WIDTH * 40;
    dispBuf = (lv_color_t*)ps_malloc(bufPixels * sizeof(lv_color_t));
    lv_disp_draw_buf_init(&drawBuf, dispBuf, nullptr, bufPixels);

    lv_disp_drv_init(&dispDrv);
    dispDrv.hor_res = SCREEN_WIDTH;
    dispDrv.ver_res = SCREEN_HEIGHT;
    dispDrv.flush_cb = dispFlush;
    dispDrv.rounder_cb = dispRounder;
    dispDrv.draw_buf = &drawBuf;
    lv_disp_drv_register(&dispDrv);

    lv_indev_drv_init(&indevDrv);
    indevDrv.type = LV_INDEV_TYPE_POINTER;
    indevDrv.read_cb = touchpadRead;
    lv_indev_drv_register(&indevDrv);
}

}

void setup() {
    Serial.begin(115200);

    initDisplay();

    wifi_manager::begin();
    mqtt_manager::setScreenDataCallback(ui_manager::dispatch);
    mqtt_manager::begin();

    ui_manager::init();
}

void loop() {
    wifi_manager::loop();
    mqtt_manager::loop();

    if (!bootConfirmed && wifi_manager::isConnected() && mqtt_manager::isConnected()) {
        ota_manager::confirmBootIfPending();
        bootConfirmed = true;
    }

    // ui_manager::loop() chiama lv_timer_handler() internamente
    ui_manager::loop();
}