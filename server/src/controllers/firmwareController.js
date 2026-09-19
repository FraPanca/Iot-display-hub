const fs = require('fs');
const { getCachedFirmwarePath } = require('../system/firmwareUpdater');

function getBinary(req, res) {
  const filePath = getCachedFirmwarePath();

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Nessun binario firmware disponibile al momento' });
    return;
  }

  res.set('Content-Type', 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { getBinary };
