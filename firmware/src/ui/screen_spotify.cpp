#include "screen_spotify.h"
#include "../http/cover_fetcher.h"
#include "../network/mqtt_manager.h"
#include <ArduinoJson.h>

namespace screen_spotify {

namespace {

// Deve corrispondere a COVER_SIZE in server/src/utils/imageConverter.js
const int COVER_SIZE = 160;

lv_obj_t* coverImg = nullptr;
lv_obj_t* titleLabel = nullptr;
lv_obj_t* albumLabel = nullptr;
lv_obj_t* playPauseLabel = nullptr;

lv_img_dsc_t coverDsc;
uint8_t* coverBuffer = nullptr;
String lastTrackId = "";

void controlEventCb(lv_event_t* e) {
    const char* action = (const char*)lv_event_get_user_data(e);
    mqtt_manager::publishSpotifyControl(action);
}

lv_obj_t* makeControlBtn(lv_obj_t* parent, const char* symbol, const char* action) {
    lv_obj_t* btn = lv_btn_create(parent);
    lv_obj_add_event_cb(btn, controlEventCb, LV_EVENT_CLICKED, (void*)action);

    lv_obj_t* label = lv_label_create(btn);
    lv_label_set_text(label, symbol);
    lv_obj_center(label);

    return btn;
}

void loadCover(const String& trackId) {
    uint8_t* buffer = nullptr;
    size_t size = 0;

    if (!cover_fetcher::fetchCover(trackId, &buffer, &size)) {
        Serial.println("[screen_spotify] fetch copertina fallito");
        return;
    }

    size_t expected = (size_t)COVER_SIZE * COVER_SIZE * 2;
    if (size != expected) {
        Serial.printf("[screen_spotify] dimensione copertina inattesa: %u byte\n", (unsigned)size);
        cover_fetcher::freeCover(buffer);
        return;
    }

    // Il server invia RGB565 little endian standard (imageConverter.js).
    // Questo pannello richiede LV_COLOR_16_SWAP, quindi si scambiano i due
    // byte di ogni pixel prima di darlo in pasto a LVGL.
    for (size_t i = 0; i + 1 < size; i += 2) {
        uint8_t tmp = buffer[i];
        buffer[i] = buffer[i + 1];
        buffer[i + 1] = tmp;
    }

    if (coverBuffer != nullptr) {
        cover_fetcher::freeCover(coverBuffer);
    }
    coverBuffer = buffer;

    coverDsc.header.always_zero = 0;
    coverDsc.header.w = COVER_SIZE;
    coverDsc.header.h = COVER_SIZE;
    coverDsc.header.cf = LV_IMG_CF_TRUE_COLOR;
    coverDsc.data_size = size;
    coverDsc.data = coverBuffer;

    lv_img_set_src(coverImg, &coverDsc);
}

}

void create(lv_obj_t* parent) {
    lv_obj_set_flex_flow(parent, LV_FLEX_FLOW_ROW);

    coverImg = lv_img_create(parent);
    lv_obj_set_size(coverImg, COVER_SIZE, COVER_SIZE);

    lv_obj_t* infoCol = lv_obj_create(parent);
    lv_obj_set_size(infoCol, LV_PCT(55), LV_PCT(90));
    lv_obj_set_style_border_width(infoCol, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(infoCol, LV_FLEX_FLOW_COLUMN);

    titleLabel = lv_label_create(infoCol);
    lv_obj_set_style_text_font(titleLabel, &lv_font_montserrat_24, LV_PART_MAIN);
    lv_label_set_text(titleLabel, "");

    albumLabel = lv_label_create(infoCol);
    lv_label_set_text(albumLabel, "");

    lv_obj_t* controlsRow = lv_obj_create(infoCol);
    lv_obj_set_size(controlsRow, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_style_border_width(controlsRow, 0, LV_PART_MAIN);
    lv_obj_set_flex_flow(controlsRow, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(controlsRow, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

    makeControlBtn(controlsRow, LV_SYMBOL_LOOP, "repeat");
    makeControlBtn(controlsRow, LV_SYMBOL_SHUFFLE, "shuffle");
    makeControlBtn(controlsRow, LV_SYMBOL_PREV, "previous");

    lv_obj_t* playPauseBtn = makeControlBtn(controlsRow, LV_SYMBOL_PLAY, "play_pause");
    playPauseLabel = lv_obj_get_child(playPauseBtn, 0);

    makeControlBtn(controlsRow, LV_SYMBOL_NEXT, "next");
}

void update(const String& payload) {
    StaticJsonDocument<384> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.print("[screen_spotify] payload malformato: ");
        Serial.println(err.c_str());
        return;
    }

    bool isPlaying = doc["is_playing"] | false;
    const char* trackIdC = doc["track_id"] | "";
    const char* title = doc["title"] | "";
    const char* album = doc["album"] | "";
    const char* artist = doc["artist"] | "";

    String trackId(trackIdC);

    if (trackId.length() == 0) {
        lv_label_set_text(titleLabel, "Nessuna riproduzione");
        lv_label_set_text(albumLabel, "");
        lv_label_set_text(playPauseLabel, LV_SYMBOL_PLAY);
        lastTrackId = "";
        return;
    }

    String titleLine = String(title) + " - " + artist;
    lv_label_set_text(titleLabel, titleLine.c_str());
    lv_label_set_text(albumLabel, album);
    lv_label_set_text(playPauseLabel, isPlaying ? LV_SYMBOL_PAUSE : LV_SYMBOL_PLAY);

    if (trackId != lastTrackId) {
        loadCover(trackId);
        lastTrackId = trackId;
    }
}

}