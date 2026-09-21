const sharp = require('sharp');
const { jpegToRgb565, COVER_SIZE } = require('../../src/utils/imageConverter');

function solidJpeg(width, height, color) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 100 }).toBuffer();
}

describe('jpegToRgb565', () => {
  it('produce un bitmap quadrato COVER_SIZE x COVER_SIZE a 2 byte per pixel', async () => {
    const jpeg = await solidJpeg(300, 300, { r: 10, g: 20, b: 30 });

    const { buffer, width, height } = await jpegToRgb565(jpeg);

    expect(width).toBe(COVER_SIZE);
    expect(height).toBe(COVER_SIZE);
    expect(buffer.length).toBe(COVER_SIZE * COVER_SIZE * 2);
  });

  it('rispetta una dimensione personalizzata', async () => {
    const jpeg = await solidJpeg(100, 100, { r: 0, g: 0, b: 0 });

    const { buffer, width, height } = await jpegToRgb565(jpeg, 32);

    expect([width, height]).toEqual([32, 32]);
    expect(buffer.length).toBe(32 * 32 * 2);
  });

  it('adatta un\'immagine non quadrata alla dimensione richiesta', async () => {
    const jpeg = await solidJpeg(400, 200, { r: 90, g: 90, b: 90 });

    const { width, height, buffer } = await jpegToRgb565(jpeg, 64);

    expect([width, height]).toEqual([64, 64]);
    expect(buffer.length).toBe(64 * 64 * 2);
  });

  it.each([
    ['rosso', { r: 255, g: 0, b: 0 }, 0xf800],
    ['verde', { r: 0, g: 255, b: 0 }, 0x07e0],
    ['blu', { r: 0, g: 0, b: 255 }, 0x001f],
    ['bianco', { r: 255, g: 255, b: 255 }, 0xffff],
    ['nero', { r: 0, g: 0, b: 0 }, 0x0000],
  ])('codifica il %s in RGB565 little endian', async (_name, color, expected) => {
    const jpeg = await solidJpeg(64, 64, color);

    const { buffer } = await jpegToRgb565(jpeg, 16);

    const center = (8 * 16 + 8) * 2;
    expect(buffer.readUInt16LE(center)).toBe(expected);
  });

  it('rifiuta un buffer che non e un\'immagine valida', async () => {
    await expect(jpegToRgb565(Buffer.from('non sono un jpeg'))).rejects.toThrow();
  });
});
