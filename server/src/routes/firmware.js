const express = require('express');
const firmwareController = require('../controllers/firmwareController');

const router = express.Router();

router.get('/firmware/binary', firmwareController.getBinary);

module.exports = router;
