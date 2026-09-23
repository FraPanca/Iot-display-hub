#pragma once

#include <Arduino.h>
#include "lvgl.h"

namespace screen_power {

void create(lv_obj_t* parent);
void update(const String& payload);

}