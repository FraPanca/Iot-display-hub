#pragma once

#include "lvgl.h"

// Design system condiviso da tutte le schermate: palette scura moderata
// con un solo colore d'accento (invece del blu/rosso di default del tema
// LVGL), pulsanti piatti arrotondati, gerarchia testo primario/secondario.
namespace theme {

constexpr uint32_t BG = 0x14171C;
constexpr uint32_t SURFACE = 0x1E222A;
constexpr uint32_t TEXT_PRIMARY = 0xEDEBE6;
constexpr uint32_t TEXT_SECONDARY = 0x8B93A1;
constexpr uint32_t ACCENT = 0x6FBFAE;
constexpr uint32_t ACCENT_BLUE = 0x5B8DEF;
constexpr uint32_t DIVIDER = 0x2A2F3A;

// Sfondo scuro + testo primario chiaro, da applicare ad ogni tile del
// tileview (non allo screen di base, coperto interamente dalla tile attiva).
void styleTile(lv_obj_t* tile);

// Pulsante piatto arrotondato: superficie scura a riposo, colore accento
// in stato checked o premuto. Da chiamare su ogni lv_btn_create() usato
// nelle schermate, al posto dello stile di default di LVGL.
void styleButton(lv_obj_t* btn);

// Variante di styleButton per pulsanti che riflettono uno stato on/off
// controllato dal server (es. shuffle/loop Spotify), azzurro invece del
// verde salvia usato per gli stati "selezionato" generici.
void styleToggleButton(lv_obj_t* btn);

lv_color_t dividerColor();

// Colore testo primario esplicito. Da preferire all'eredita dalla tile per
// le label che sembrano prendere il colore di default del tema LVGL invece
// di quello ereditato (es. sysmon, spotify).
void stylePrimaryText(lv_obj_t* label);

// Colore testo secondario, per sottotitoli o valori meno rilevanti del
// contenuto principale di una schermata (es. nome album sotto al titolo)
void styleSecondaryText(lv_obj_t* label);

}