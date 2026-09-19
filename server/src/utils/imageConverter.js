const sharp = require('sharp');

// Dimensione lato in pixel dell'area copertina sulla schermata Spotify.
const COVER_SIZE = 160;

async function jpegToRgb565(jpegBuffer, size = COVER_SIZE) {
  const { data, info } = await sharp(jpegBuffer)
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const rgb565 = Buffer.alloc(pixelCount * 2);

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * info.channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];

    const value = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    rgb565.writeUInt16LE(value, i * 2);
  }

  return { buffer: rgb565, width: info.width, height: info.height };
}

module.exports = { jpegToRgb565, COVER_SIZE };
