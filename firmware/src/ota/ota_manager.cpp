#include "ota_manager.h"
#include "../config.h"
#include "../secrets.h"
#include "../network/mqtt_manager.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <WiFi.h>

namespace ota_manager {

namespace {
    bool updateAvailable = false;
    String pendingVersion = "";
    String pendingChecksum = "";
    int currentProgress = 0;
}

void handleFirmwarePayload(const String& payload) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (err) {
        Serial.println("[ota] payload data/firmware malformato, ignorato");
        return;
    }

    const char* version = doc["version"];
    const char* checksum = doc["checksum_md5"];

    if (version == nullptr || checksum == nullptr) {
        Serial.println("[ota] payload data/firmware incompleto, ignorato");
        return;
    }

    if (String(version) == FIRMWARE_VERSION) {
        updateAvailable = false;
        return;
    }

    pendingVersion = String(version);
    pendingChecksum = String(checksum);
    updateAvailable = true;

    Serial.printf("[ota] nuova versione disponibile: %s\n", pendingVersion.c_str());
}

bool isUpdateAvailable() {
    return updateAvailable;
}

String availableVersion() {
    return pendingVersion;
}

int progressPercent() {
    return currentProgress;
}

bool startUpdate() {
    if (!updateAvailable) {
        return false;
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[ota] WiFi non connesso, aggiornamento annullato");
        return false;
    }

    HTTPClient http;
    String url = String("http://") + SERVER_HOST + ":" + String(SERVER_PORT) + "/api/firmware/binary";
    http.begin(url);
    int httpCode = http.GET();

    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("[ota] download fallito, codice %d\n", httpCode);
        http.end();
        mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "download_failed");
        return false;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Serial.println("[ota] dimensione binario sconosciuta");
        http.end();
        mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "download_failed");
        return false;
    }

    if (!Update.begin(contentLength)) {
        Serial.println("[ota] Update.begin fallito, spazio insufficiente");
        http.end();
        mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "download_failed");
        return false;
    }

    Update.setMD5(pendingChecksum.c_str());

    WiFiClient* stream = http.getStreamPtr();
    size_t written = 0;
    uint8_t buffer[1024];
    currentProgress = 0;

    while (http.connected() && written < (size_t)contentLength) {
        size_t available = stream->available();
        if (available > 0) {
            size_t toRead = available < sizeof(buffer) ? available : sizeof(buffer);
            int r = stream->readBytes(buffer, toRead);

            if (Update.write(buffer, r) != (size_t)r) {
                Serial.println("[ota] scrittura fallita durante il flash");
                Update.abort();
                http.end();
                mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "download_failed");
                return false;
            }

            written += r;
            currentProgress = (int)((written * 100) / contentLength);
        }
        delay(1);
    }

    http.end();

    if (written != (size_t)contentLength) {
        Serial.println("[ota] download incompleto");
        Update.abort();
        mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "download_failed");
        return false;
    }

    if (!Update.end(true)) {
        Serial.printf("[ota] verifica finale fallita: %s\n", Update.errorString());
        mqtt_manager::publishOtaResult("error", pendingVersion.c_str(), "checksum_mismatch");
        return false;
    }

    Serial.println("[ota] flash completato, riavvio");
    mqtt_manager::publishOtaResult("success", pendingVersion.c_str(), nullptr);
    delay(500);
    ESP.restart();

    return true;
}

void confirmBootIfPending() {
    const esp_partition_t* running = esp_ota_get_running_partition();
    esp_ota_img_states_t state;

    if (esp_ota_get_state_partition(running, &state) == ESP_OK) {
        if (state == ESP_OTA_IMG_PENDING_VERIFY) {
            esp_ota_mark_app_valid_cancel_rollback();
            Serial.println("[ota] avvio confermato, rollback annullato");
        }
    }
}

}