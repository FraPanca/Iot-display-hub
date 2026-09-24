# Font Montserrat (italiano)

Origine: Montserrat, https://github.com/JulietaUla/Montserrat
Licenza: SIL Open Font License (OFL).

Generati con lv_font_conv da un TTF Montserrat reale, in due dimensioni:
font_body_it (14px) e font_title_it (24px). Range di caratteri:
0x20-0x7E, 0xA0-0xFF, 0x2013-0x2014, 0x2018-0x201F (ASCII base, blocco
Latin-1 Supplement per le lettere accentate italiane, trattini lunghi e
virgolette tipografiche).

Note per rigenerare i font in futuro:

- serve l'opzione --lv-include lvgl.h, altrimenti il file generato
  include "lvgl/lvgl.h", un path sbagliato per la struttura di questo
  progetto
- usare sempre --no-compress --no-kerning: la variante con compressione
  RLE piu kerning ha causato testo completamente invisibile su hardware
  reale (causa non confermata con certezza)

La licenza SIL OFL richiede la presenza di questo file di attribuzione
insieme ai font distribuiti; non modifica i requisiti di licenza del
resto del firmware.