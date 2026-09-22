#pragma once

#include <Arduino.h>

namespace cover_fetcher {

// Scarica la copertina per il track_id indicato da GET /api/spotify/cover.
// Il bitmap arriva gia in formato RGB565, pronto per l'oggetto immagine LVGL.
// Il buffer restituito e allocato in PSRAM, va liberato con freeCover() dal chiamante
bool fetchCover(const String& trackId, uint8_t** outBuffer, size_t* outSize);

void freeCover(uint8_t* buffer);

}