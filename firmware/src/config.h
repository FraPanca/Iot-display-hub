#pragma once

// Identificativo del display e prefisso topic MQTT
#define DEVICE_ID "cyd-01"
#define TOPIC_PREFIX "display/cyd-01"

// Versione firmware corrente, aggiornata manualmente ad ogni release.
// Confrontata da ota_manager con quella ricevuta via MQTT (data/firmware)
#define FIRMWARE_VERSION "v1.0.0"

// Dimensioni schermo e orientamento (Freenove ESP32-S3 CYD 3.5")
#define SCREEN_WIDTH 480
#define SCREEN_HEIGHT 320
#define SCREEN_ROTATION 0

// Intervalli attesi, utili solo per eventuale logica di timeout/health locale.
// Gli intervalli di pubblicazione reali sono decisi dal server.
#define EXPECTED_CLOCK_INTERVAL_MS 60000
#define EXPECTED_WEATHER_INTERVAL_MS 1800000
#define EXPECTED_SYSMON_INTERVAL_MS 15000
#define EXPECTED_QUOTE_INTERVAL_MS 3600000

// Enum degli screenId, condiviso concettualmente col server
enum ScreenId {
    SCREEN_CLOCK,
    SCREEN_WEATHER,
    SCREEN_SPOTIFY,
    SCREEN_SYSMON,
    SCREEN_QUOTE,
    SCREEN_POWER,
    SCREEN_OFF
};

// Stringhe corrispondenti a ScreenId, stesso ordine dell'enum.
// Sono gli stessi valori pubblicati/attesi su screen/current
static const char* SCREEN_ID_STRINGS[] = {
    "clock",
    "weather",
    "spotify",
    "sysmon",
    "quote",
    "power",
    "off"
};