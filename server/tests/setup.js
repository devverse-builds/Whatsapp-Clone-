require('dotenv').config();
const mongoose = require('mongoose');

const TEST_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_clone_test';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  }
});
