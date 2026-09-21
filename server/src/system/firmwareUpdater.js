const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { TOPICS } = require('../config/mqtt');
const { publish } = require('../mqtt/client');
const { getLatestFirmwareRelease } = require('../integrations/githubReleasesClient');
const { withRetry } = require('../utils/retry');

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Directory di cache locale nel container, non serve un bind mount dedicato.
const FIRMWARE_DIR = path.join(__dirname, '..', '..', 'firmware-cache');
const FIRMWARE_PATH = path.join(FIRMWARE_DIR, 'firmware.bin');

let currentVersion = null;

function getCachedFirmwarePath() {
  return FIRMWARE_PATH;
}

function getCurrentVersion() {
  return currentVersion;
}

async function downloadFirmware(url) {
  const res = await withRetry(async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download firmware fallito: ${response.status}`);
    }
    return response;
  });

  const buffer = Buffer.from(await res.arrayBuffer());

  if (!fs.existsSync(FIRMWARE_DIR)) {
    fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
  }

  fs.writeFileSync(FIRMWARE_PATH, buffer);

  return buffer;
}

function computeMd5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

async function checkForUpdate() {
  try {
    const { version, downloadUrl } = await getLatestFirmwareRelease();

    if (version === currentVersion) {
      return;
    }

    const buffer = await downloadFirmware(downloadUrl);
    const checksumMd5 = computeMd5(buffer);

    await publish(
      TOPICS.dataFirmware,
      { version, checksum_md5: checksumMd5 },
      { qos: 1, retain: true },
    );

    currentVersion = version;

    console.log(`Nuova versione firmware rilevata e pubblicata: ${currentVersion}`);
  } catch (err) {
    console.error('Errore nel controllo aggiornamento firmware', err.message);
  }
}

function startFirmwareUpdater() {
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

module.exports = { startFirmwareUpdater, getCachedFirmwarePath, getCurrentVersion };
