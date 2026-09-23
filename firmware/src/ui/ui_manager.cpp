#include "ui_manager.h"
#include "../config.h"
#include "../network/mqtt_manager.h"
#include "screen_clock.h"
#include "screen_weather.h"
#include "screen_spotify.h"
#include "screen_sysmon.h"
#include "screen_quote.h"
#include "screen_power.h"
#include "theme.h"
#include "lvgl.h"

namespace ui_manager {

namespace {

// Le sei schermate navigabili col tileview. SCREEN_OFF non compare qui:
// non ha una tile propria, è un valore pubblicato da screen_power.
const int SCREEN_COUNT = 6;

typedef void (*CreateFn)(lv_obj_t*);
typedef void (*UpdateFn)(const String&);

struct ScreenEntry {
    ScreenId id;
    CreateFn create;
    UpdateFn update;
};

const ScreenEntry SCREENS[SCREEN_COUNT] = {
    { SCREEN_CLOCK,   screen_clock::create,   screen_clock::update },
    { SCREEN_WEATHER, screen_weather::create, screen_weather::update },
    { SCREEN_SPOTIFY, screen_spotify::create, screen_spotify::update },
    { SCREEN_SYSMON,  screen_sysmon::create,  screen_sysmon::update },
    { SCREEN_QUOTE,   screen_quote::create,   screen_quote::update },
    { SCREEN_POWER,   screen_power::create,   screen_power::update },
};

lv_obj_t* tileview = nullptr;
int activeIndex = 0;

void tileviewEventCb(lv_event_t* e) {
    lv_obj_t* tv = lv_event_get_target(e);
    lv_obj_t* activeTile = lv_tileview_get_tile_act(tv);

    for (int i = 0; i < SCREEN_COUNT; i++) {
        if (lv_obj_get_user_data(activeTile) == (void*)(intptr_t)i) {
            if (i != activeIndex) {
                activeIndex = i;
                mqtt_manager::publishScreenCurrent(SCREEN_ID_STRINGS[SCREENS[i].id]);
            }
            return;
        }
    }
}

}

void init() {
    tileview = lv_tileview_create(lv_scr_act());
    lv_obj_set_size(tileview, LV_PCT(100), LV_PCT(100));

    for (int i = 0; i < SCREEN_COUNT; i++) {
        lv_obj_t* tile = lv_tileview_add_tile(tileview, i, 0, LV_DIR_HOR);
        lv_obj_set_user_data(tile, (void*)(intptr_t)i);
        theme::styleTile(tile);
        SCREENS[i].create(tile);
    }

    lv_obj_add_event_cb(tileview, tileviewEventCb, LV_EVENT_SCROLL_END, nullptr);

    // Pubblica subito la schermata iniziale (prima tile, clock), cosi il
    // server comincia a pubblicare dati senza aspettare il primo swipe.
    mqtt_manager::publishScreenCurrent(SCREEN_ID_STRINGS[SCREENS[0].id]);
}

void loop() {
    lv_timer_handler();
}

void dispatch(const String& topic, const String& payload) {
    for (int i = 0; i < SCREEN_COUNT; i++) {
        String suffix = String("data/") + SCREEN_ID_STRINGS[SCREENS[i].id];
        if (topic.endsWith(suffix)) {
            SCREENS[i].update(payload);
            return;
        }
    }

    // data/system aggiorna la schermata power (ack di shutdown): non ha una
    // entry propria dato che non e' un valore valido per screen/current
    if (topic.endsWith("data/system")) {
        screen_power::update(payload);
        return;
    }

    // data/firmware non arriva qui: mqtt_manager la instrada direttamente
    // a ota_manager prima di chiamare questo dispatch
}

const char* activeScreenId() {
    return SCREEN_ID_STRINGS[SCREENS[activeIndex].id];
}

}