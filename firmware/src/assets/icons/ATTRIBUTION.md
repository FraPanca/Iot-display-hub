# Icone meteo

Origine: Tabler Icons, https://github.com/tabler/tabler-icons
(icone: sun, cloud, cloud-rain, cloud-storm, cloud-snow, cloud-fog).
Licenza: MIT.

Ricolorate nell'accento del tema (#6FBFAE) e rasterizzate a 64x64 RGB565
su sfondo identico a quello delle tile (#14171C), cosi si integrano senza
bisogno di canale alpha. "Poco nuvoloso" e una composizione di sun.svg
e cloud.svg (Tabler non ha un'icona dedicata sole+nuvola).

Pipeline di conversione: SVG ricolorato -> rasterizzato con cairosvg su
sfondo tile -> convertito in array C RGB565 con swap byte (richiesto da
LV_COLOR_16_SWAP, vedi lv_conf.h). Per cambiare un'icona, ripetere la
pipeline sulla nuova immagine sorgente; non modificare weather_icons.cpp
a mano.