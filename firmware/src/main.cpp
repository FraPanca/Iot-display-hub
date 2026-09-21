#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.printf("Flash: %u MB\n", ESP.getFlashChipSize() / 1048576);
  Serial.printf("PSRAM: %u MB\n", ESP.getPsramSize() / 1048576);
}

void loop() {}