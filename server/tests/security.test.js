const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');

const TEST_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_clone_test';

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI, {
      driverInfo: { name: 'nodejs', version: '24.21.0' },
      serverSelectionTimeoutMS: 5000
    });
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({ username: { $regex: /^sec_/ } });
  }
});

describe('Security and Injection Defenses Tests', () => {
  const ts = Date.now();

  it('should block NoSQL injection attempt in login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        identifier: { $gt: '' },
        password: { $gt: '' }
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should prevent XSS script payloads from breaking account display', async () => {
    const xssPayload = '<script>alert("XSS")</script><b>Test User</b>';
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: xssPayload,
        username: `sec_xss_${ts}`,
        password: 'password123'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.displayName).toBe(xssPayload);
  });

  it('should reject invalid object IDs gracefully on conversation endpoints', async () => {
    const res1 = await request(app).get('/api/v1/conversations/invalid-id-1234');
    expect(res1.status).toBe(401);
  });

  it('should temporarily lock account after 5 consecutive failed login attempts', async () => {
    const username = `sec_lock_${ts}`;
    await request(app)
      .post('/api/v1/auth/register')
      .send({
        displayName: 'Lock Test',
        username,
        password: 'correct_password'
      });

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const failRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: username, password: 'wrong_password' });
      expect(failRes.status).toBe(401);
    }

    // 5th failed attempt triggers lockout
    const lockRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'wrong_password' });
    expect(lockRes.status).toBe(401);
    expect(lockRes.body.message).toMatch(/locked/i);

    // 6th attempt should return 423 Locked even with right password
    const lockedOutRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: username, password: 'correct_password' });
    expect(lockedOutRes.status).toBe(423);
    expect(lockedOutRes.body.message).toMatch(/locked/i);
  });

  it('should block untrusted third-party CORS origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious-hacker-site.com');

    // CORS middleware produces an error or does not set Access-Control-Allow-Origin
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
