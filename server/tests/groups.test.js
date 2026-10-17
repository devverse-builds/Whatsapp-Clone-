const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const TEST_MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_clone_test';

const ts = Date.now();
let adminCookie, memberCookie, outsiderCookie;
let adminId, memberId, outsiderId;
let groupId;

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI);
  }

  // Admin user
  const resA = await request(app).post('/api/v1/auth/register').send({
    displayName: 'Group Admin',
    username: `grp_admin_${ts}`,
    password: 'password123'
  });
  adminCookie = resA.headers['set-cookie'];
  adminId = resA.body.data.user._id;

  // Normal Member
  const resM = await request(app).post('/api/v1/auth/register').send({
    displayName: 'Group Member',
    username: `grp_member_${ts}`,
    password: 'password123'
  });
  memberCookie = resM.headers['set-cookie'];
  memberId = resM.body.data.user._id;

  // Outsider
  const resO = await request(app).post('/api/v1/auth/register').send({
    displayName: 'Outsider',
    username: `grp_out_${ts}`,
    password: 'password123'
  });
  outsiderCookie = resO.headers['set-cookie'];
  outsiderId = resO.body.data.user._id;
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({ username: { $regex: /^grp_/ } });
    await Conversation.deleteMany({});
    await Message.deleteMany({});
  }
});

describe('Group Messaging and Admin Permissions Tests', () => {
  it('should allow user to create a group', async () => {
    const res = await request(app)
      .post('/api/v1/groups')
      .set('Cookie', adminCookie)
      .send({
        name: 'Project Dev Team',
        description: 'Coordination group',
        members: [memberId]
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.group.groupMeta.name).toBe('Project Dev Team');
    expect(res.body.data.group.participants.length).toBe(2);
    groupId = res.body.data.group._id;
  });

  it('should prevent non-admin from modifying group settings', async () => {
    const res = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set('Cookie', memberCookie)
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should allow admin to add a new member', async () => {
    const res = await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set('Cookie', adminCookie)
      .send({ members: [outsiderId] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.group.participants.length).toBe(3);
  });

  it('should allow admin to remove a member', async () => {
    const res = await request(app)
      .delete(`/api/v1/groups/${groupId}/members/${outsiderId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should allow a member to leave group', async () => {
    const res = await request(app)
      .post(`/api/v1/groups/${groupId}/leave`)
      .set('Cookie', memberCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
