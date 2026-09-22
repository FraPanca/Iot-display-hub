#include "mqtt_manager.h"
#include "../config.h"
#include "../secrets.h"
#include "../ota/ota_manager.h"
#include <MQTT.h>
#include <WiFi.h>
#include <ArduinoJson.h>

namespace mqtt_manager {

namespace {
    WiFiClient wifiClient;
    MQTTClient client(1024, 256);
    ScreenDataCallback screenDataCallback = nullptr;

    unsigned long lastAttemptMs = 0;
    unsigned long backoffMs = 1000;
    const unsigned long BACKOFF_MAX_MS = 30000;

    String statusTopic;
    String dataWildcardTopic;
    String dataFirmwareTopic;

    void onMessage(String &topic, String &payload) {
        // Eccezione al dispatch generico: data/firmware va a ota_manager, non a ui_manager
        if (topic == dataFirmwareTopic) {
            ota_manager::handleFirmwarePayload(payload);
            return;
        }

        if (screenDataCallback != nullptr) {
            screenDataCallback(topic, payload);
        }
    }

    bool connectOnce() {
        Serial.println("[mqtt] tentativo di connessione al broker");

        bool ok = client.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD);

        if (ok) {
            Serial.println("[mqtt] connesso");
            client.publish(statusTopic.c_str(), "online", true, 1);
            client.subscribe(dataWildcardTopic.c_str(), 1);
            backoffMs = 1000;
        } else {
            Serial.println("[mqtt] connessione fallita");
        }

        return ok;
    }
}

void begin() {
    statusTopic = String(TOPIC_PREFIX) + "/status";
    dataWildcardTopic = String(TOPIC_PREFIX) + "/data/#";
    dataFirmwareTopic = String(TOPIC_PREFIX) + "/data/firmware";

    client.begin(MQTT_HOST, MQTT_PORT, wifiClient);
    client.onMessage(onMessage);

    // Il will va impostato prima di connect(), resta valido anche sui reconnect successivi
    client.setWill(statusTopic.c_str(), "offline", true, 1);

    if (WiFi.status() == WL_CONNECTED) {
        connectOnce();
    }

    lastAttemptMs = millis();
}

void loop() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    client.loop();

    if (!client.connected()) {
        unsigned long now = millis();
        if (now - lastAttemptMs >= backoffMs) {
            lastAttemptMs = now;
            if (!connectOnce()) {
                backoffMs = (backoffMs * 2 < BACKOFF_MAX_MS) ? backoffMs * 2 : BACKOFF_MAX_MS;
            }
        }
    }
}

bool isConnected() {
    return client.connected();
}

void setScreenDataCallback(ScreenDataCallback callback) {
    screenDataCallback = callback;
}

void publishScreenCurrent(const char* screenId) {
    String topic = String(TOPIC_PREFIX) + "/screen/current";
    client.publish(topic.c_str(), screenId, true, 1);
}

void publishWeatherDaySelect(int dayIndex) {
    StaticJsonDocument<64> doc;
    doc["day_index"] = dayIndex;

    char buffer[64];
    serializeJson(doc, buffer);

    String topic = String(TOPIC_PREFIX) + "/event/weather/day_select";
    client.publish(topic.c_str(), buffer, false, 1);
}

void publishSpotifyControl(const char* action) {
    StaticJsonDocument<64> doc;
    doc["action"] = action;

    char buffer[64];
    serializeJson(doc, buffer);

    String topic = String(TOPIC_PREFIX) + "/event/spotify/control";
    client.publish(topic.c_str(), buffer, false, 1);
}

void publishShutdownRequest() {
    String topic = String(TOPIC_PREFIX) + "/event/system/shutdown";
    client.publish(topic.c_str(), "{\"target\":\"pi\"}", false, 1);
}

void publishOtaResult(const char* status, const char* version, const char* error) {
    StaticJsonDocument<128> doc;
    doc["status"] = status;
    doc["version"] = version;
    if (error != nullptr) {
        doc["error"] = error;
    }

    char buffer[128];
    serializeJson(doc, buffer);

    String topic = String(TOPIC_PREFIX) + "/event/system/ota_result";
    client.publish(topic.c_str(), buffer, false, 1);
}

}