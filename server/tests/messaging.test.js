const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const TEST_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_clone_test';

const ts = Date.now();
let user1Cookie, user2Cookie;
let user1Id, user2Id;
let conversationId;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
  }

  // Register user 1
  const res1 = await request(app).post('/api/v1/auth/register').send({
    displayName: 'Alice User',
    username: `msg_alice_${ts}`,
    password: 'password123'
  });
  user1Cookie = res1.headers['set-cookie'];
  user1Id = res1.body.data.user._id;

  // Register user 2
  const res2 = await request(app).post('/api/v1/auth/register').send({
    displayName: 'Bob User',
    username: `msg_bob_${ts}`,
    password: 'password123'
  });
  user2Cookie = res2.headers['set-cookie'];
  user2Id = res2.body.data.user._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({ username: { $regex: /^msg_/ } });
    await Conversation.deleteMany({});
    await Message.deleteMany({});
  }
});

describe('1-to-1 Messaging and Persistence Tests', () => {
  it('should create or fetch a direct conversation between Alice and Bob', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Cookie', user1Cookie)
      .send({ recipientId: user2Id });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.conversation).toBeDefined();
    conversationId = res.body.data.conversation._id;
  });

  it('should send a text message and persist to database', async () => {
    const clientMessageId = `cid_${Date.now()}`;
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', user1Cookie)
      .send({
        content: 'Hello Bob! This is Alice.',
        type: 'text',
        clientMessageId
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message.content).toBe('Hello Bob! This is Alice.');
    expect(res.body.data.message.senderId._id.toString()).toBe(user1Id);

    const saved = await Message.findById(res.body.data.message._id);
    expect(saved).not.toBeNull();
    expect(saved.content).toBe('Hello Bob! This is Alice.');
  });

  it('should enforce idempotency for duplicate clientMessageId', async () => {
    const clientMessageId = `cid_idempotent_${ts}`;

    const res1 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', user1Cookie)
      .send({
        content: 'Original Message',
        clientMessageId
      });

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', user1Cookie)
      .send({
        content: 'Original Message',
        clientMessageId
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.message._id).toBe(res1.body.data.message._id);
  });

  it('should allow Bob to fetch messages in conversation', async () => {
    const res = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', user2Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('should allow Bob to mark messages as read', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set('Cookie', user2Cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should prevent non-participant from reading messages', async () => {
    const resEve = await request(app).post('/api/v1/auth/register').send({
      displayName: 'Eve Intruder',
      username: `msg_eve_${ts}`,
      password: 'password123'
    });
    const eveCookie = resEve.headers['set-cookie'];

    const res = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', eveCookie);

    expect(res.status).toBe(404);
  });
});
