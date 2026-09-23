# ST77922 driver (vendorizzato)

Origine: repository ufficiale Freenove, `Freenove/Freenove_ESP32_S3_Display`,
file `Libraries/FNK0104N/TFT_eSPI_v2.5.43.zip`.

Questi 4 file sono self-contained (non dipendono dalla classe TFT_eSPI base,
usano solo chiamate dirette ESP-IDF per SPI e I2C), quindi vendorizzati da
soli invece dell'intera libreria patchata TFT_eSPI.

Licenza: MIT (stessa licenza della libreria TFT_eSPI da cui provengono,
vedi license.txt nel repository Freenove).

Non modificare questi file direttamente: eventuali fix vanno prima verificati
contro l'origine, poi riportati qui.