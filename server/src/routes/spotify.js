const express = require('express');
const spotifyController = require('../controllers/spotifyController');

const router = express.Router();

router.get('/spotify/cover', spotifyController.getCover);
router.get('/spotify/callback', spotifyController.handleCallback);

module.exports = router;
