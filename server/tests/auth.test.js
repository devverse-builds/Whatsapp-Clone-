const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Session = require('../src/models/Session');

const TEST_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_clone_test';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
  }
});

afterAll(async () => {
  await User.deleteMany({ username: { $regex: /^testuser_/ } });
  await Session.deleteMany({});
});

describe('Authentication & Account Management Tests', () => {
  const timestamp = Date.now();
  const testUserData = {
    displayName: 'Test User',
    username: `testuser_${timestamp}`,
    email: `testuser_${timestamp}@example.com`,
    password: 'password123'
  };

  let authCookie = null;

  it('should reject registration with invalid data', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: '',
        username: 'ab',
        password: '123'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should successfully register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUserData);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.username).toBe(testUserData.username);
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    authCookie = cookies;
  });

  it('should prevent duplicate username registration', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send(testUserData);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should successfully login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: testUserData.username,
        password: testUserData.password
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    authCookie = res.headers['set-cookie'];
  });

  it('should reject login with wrong password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: testUserData.username,
        password: 'wrongpassword'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should get current authenticated user with cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(testUserData.username);
  });

  it('should reject unauthenticated request to /auth/me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('should logout and clear cookies', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
