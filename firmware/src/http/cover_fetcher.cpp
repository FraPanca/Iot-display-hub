#include "cover_fetcher.h"
#include "../secrets.h"
#include <HTTPClient.h>
#include <WiFi.h>

namespace cover_fetcher {

bool fetchCover(const String& trackId, uint8_t** outBuffer, size_t* outSize) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[cover_fetcher] WiFi non connesso, fetch annullato");
        return false;
    }

    HTTPClient http;
    String url = String("http://") + SERVER_HOST + ":" + String(SERVER_PORT) +
                 "/api/spotify/cover?track_id=" + trackId;

    http.begin(url);
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[cover_fetcher] richiesta fallita, codice %d\n", httpCode);
        http.end();
        return false;
    }

    int len = http.getSize();
    if (len <= 0) {
        Serial.println("[cover_fetcher] risposta senza contenuto");
        http.end();
        return false;
    }

    uint8_t* buffer = (uint8_t*)ps_malloc(len);
    if (buffer == nullptr) {
        Serial.println("[cover_fetcher] allocazione PSRAM fallita");
        http.end();
        return false;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t bytesRead = 0;

    while (http.connected() && bytesRead < (size_t)len) {
        size_t available = stream->available();
        if (available > 0) {
            size_t toRead = available < (size_t)(len - bytesRead) ? available : (size_t)(len - bytesRead);
            bytesRead += stream->readBytes(buffer + bytesRead, toRead);
        }
        delay(1);
    }

    http.end();

    if (bytesRead != (size_t)len) {
        Serial.println("[cover_fetcher] lettura incompleta");
        free(buffer);
        return false;
    }

    *outBuffer = buffer;
    *outSize = bytesRead;
    return true;
}

void freeCover(uint8_t* buffer) {
    if (buffer != nullptr) {
        free(buffer);
    }
}

}