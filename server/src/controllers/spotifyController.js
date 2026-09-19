const { getCoverUrl, exchangeCodeForTokens } = require('../integrations/spotifyClient');
const { jpegToRgb565 } = require('../utils/imageConverter');

async function getCover(req, res) {
  const trackId = req.query.track_id;

  if (!trackId) {
    res.status(400).json({ error: 'Parametro track_id mancante' });
    return;
  }

  try {
    const imageUrl = await getCoverUrl(trackId);

    if (!imageUrl) {
      res.status(404).json({ error: 'Copertina non trovata per il track_id indicato' });
      return;
    }

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      res.status(502).json({ error: 'Impossibile scaricare la copertina da Spotify' });
      return;
    }

    const jpegBuffer = Buffer.from(await imageRes.arrayBuffer());
    const { buffer } = await jpegToRgb565(jpegBuffer);

    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('Errore conversione copertina Spotify', err.message);
    res.status(500).json({ error: 'Errore interno nella conversione della copertina' });
  }
}

async function handleCallback(req, res) {
  const { code } = req.query;

  if (!code) {
    res.status(400).json({ error: 'Parametro code mancante o non valido' });
    return;
  }

  try {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/spotify/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    console.log('Scambio OAuth completato. Salvare questo refresh_token in SPOTIFY_REFRESH_TOKEN (.env):');
    console.log(tokens.refresh_token);

    res.status(200).send('Autorizzazione completata. Controlla i log del server per il refresh token da salvare in .env.');
  } catch (err) {
    console.error('Errore scambio codice OAuth Spotify', err.message);
    res.status(400).json({ error: 'Scambio codice OAuth fallito' });
  }
}

module.exports = { getCover, handleCallback };
