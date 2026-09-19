const mongoose = require('mongoose');

async function connectDb() {
  const { MONGO_ROOT_USER, MONGO_ROOT_PASSWORD, MONGO_DB_NAME } = process.env;
  const uri = `mongodb://${MONGO_ROOT_USER}:${MONGO_ROOT_PASSWORD}@mongodb:27017/${MONGO_DB_NAME}?authSource=admin`;

  await mongoose.connect(uri);
  console.log('MongoDB connesso');

  return mongoose.connection;
}

function getMongoStatus() {
  return mongoose.connection.readyState === 1 ? 'ok' : 'error';
}

module.exports = { connectDb, getMongoStatus };
