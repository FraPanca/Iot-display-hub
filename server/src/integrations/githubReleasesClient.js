const { withRetry } = require('../utils/retry');

const RELEASES_URL = 'https://api.github.com/repos/FraPanca/iot-display-hub/releases/latest';
const FIRMWARE_ASSET_NAME = 'firmware.bin';

async function getLatestFirmwareRelease() {
  const data = await withRetry(async () => {
    const res = await fetch(RELEASES_URL, {
      headers: { 'User-Agent': 'iot-display-hub-server' },
    });

    if (!res.ok) {
      throw new Error(`GitHub Releases risposta non ok: ${res.status}`);
    }

    return res.json();
  });

  const asset = (data.assets || []).find((item) => item.name === FIRMWARE_ASSET_NAME);

  if (!asset) {
    throw new Error(`Nessun asset ${FIRMWARE_ASSET_NAME} trovato nella release piu recente`);
  }

  return {
    version: data.tag_name,
    downloadUrl: asset.browser_download_url,
  };
}

module.exports = { getLatestFirmwareRelease };
