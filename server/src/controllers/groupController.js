const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { CONVERSATION_TYPES, ROLES, MESSAGE_TYPES, SOCKET_EVENTS } = require('../config/constants');
const { isValidObjectId } = require('../validators/chatValidators');
const { getIO } = require('../services/socketService');

const createGroup = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name, description, avatar, members } = req.body;

    const allMemberIds = Array.from(new Set([userId.toString(), ...members]));

    // Construct participantRoles
    const participantRoles = allMemberIds.map((id) => ({
      user: id,
      role: id === userId.toString() ? ROLES.ADMIN : ROLES.MEMBER,
      joinedAt: new Date()
    }));

    const groupConversation = await Conversation.create({
      type: CONVERSATION_TYPES.GROUP,
      participants: allMemberIds,
      participantRoles,
      groupMeta: {
        name: name.trim(),
        description: description ? description.trim() : '',
        avatar: avatar || '',
        createdBy: userId
      },
      lastActivityAt: new Date()
    });

    // Create system message
    const systemMessage = await Message.create({
      conversationId: groupConversation._id,
      senderId: userId,
      clientMessageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: MESSAGE_TYPES.SYSTEM,
      content: `${req.user.displayName} created group "${name.trim()}"`
    });

    groupConversation.lastMessage = systemMessage._id;
    await groupConversation.save();

    const populated = await Conversation.findById(groupConversation._id)
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('participantRoles.user', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    const io = getIO();
    if (io) {
      allMemberIds.forEach((mId) => {
        io.to(`user:${mId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
          conversationId: groupConversation._id,
          conversation: populated
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: { group: populated }
    });
  } catch (error) {
    next(error);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user._id;
    const { name, description, avatar } = req.body;

    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID' });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: CONVERSATION_TYPES.GROUP,
      participants: userId
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    // Check admin role
    const userRole = group.participantRoles.find(
      (pr) => pr.user.toString() === userId.toString()
    );

    if (!userRole || userRole.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can edit group settings'
      });
    }

    let changeNotice = [];
    if (name && name.trim() !== group.groupMeta.name) {
      changeNotice.push(`name to "${name.trim()}"`);
      group.groupMeta.name = name.trim();
    }
    if (description !== undefined) {
      group.groupMeta.description = description.trim();
    }
    if (avatar !== undefined) {
      group.groupMeta.avatar = avatar;
    }

    await group.save();

    if (changeNotice.length > 0) {
      const sysMsg = await Message.create({
        conversationId: group._id,
        senderId: userId,
        clientMessageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        type: MESSAGE_TYPES.SYSTEM,
        content: `${req.user.displayName} changed group ${changeNotice.join(', ')}`
      });
      group.lastMessage = sysMsg._id;
      group.lastActivityAt = new Date();
      await group.save();
    }

    const populated = await Conversation.findById(groupId)
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('participantRoles.user', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    const io = getIO();
    if (io) {
      io.to(`conversation:${groupId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
        conversationId: groupId,
        conversation: populated
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: { group: populated }
    });
  } catch (error) {
    next(error);
  }
};

const addMembers = async (req, res, next) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user._id;
    const { members } = req.body;

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: 'Members array is required' });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: CONVERSATION_TYPES.GROUP,
      participants: userId
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const userRole = group.participantRoles.find(
      (pr) => pr.user.toString() === userId.toString()
    );

    if (!userRole || userRole.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can add members'
      });
    }

    const newMembersAdded = [];
    for (const memberId of members) {
      if (!isValidObjectId(memberId)) continue;
      const alreadyIn = group.participants.some((p) => p.toString() === memberId.toString());
      if (!alreadyIn) {
        group.participants.push(memberId);
        group.participantRoles.push({
          user: memberId,
          role: ROLES.MEMBER,
          joinedAt: new Date()
        });
        newMembersAdded.push(memberId);
      }
    }

    if (newMembersAdded.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All specified users are already in the group'
      });
    }

    const addedUsers = await User.find({ _id: { $in: newMembersAdded } });
    const addedNames = addedUsers.map((u) => u.displayName).join(', ');

    const sysMsg = await Message.create({
      conversationId: group._id,
      senderId: userId,
      clientMessageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: MESSAGE_TYPES.SYSTEM,
      content: `${req.user.displayName} added ${addedNames}`
    });

    group.lastMessage = sysMsg._id;
    group.lastActivityAt = new Date();
    await group.save();

    const populated = await Conversation.findById(groupId)
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('participantRoles.user', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    const io = getIO();
    if (io) {
      io.to(`conversation:${groupId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
        conversationId: groupId,
        conversation: populated
      });
      newMembersAdded.forEach((mId) => {
        io.to(`user:${mId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
          conversationId: groupId,
          conversation: populated
        });
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Members added successfully',
      data: { group: populated }
    });
  } catch (error) {
    next(error);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { id: groupId, userId: targetUserId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(groupId) || !isValidObjectId(targetUserId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID supplied' });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: CONVERSATION_TYPES.GROUP,
      participants: userId
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const userRole = group.participantRoles.find(
      (pr) => pr.user.toString() === userId.toString()
    );

    if (!userRole || userRole.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can remove members'
      });
    }

    const targetUser = await User.findById(targetUserId);
    const targetName = targetUser ? targetUser.displayName : 'a member';

    group.participants = group.participants.filter(
      (p) => p.toString() !== targetUserId.toString()
    );
    group.participantRoles = group.participantRoles.filter(
      (pr) => pr.user.toString() !== targetUserId.toString()
    );

    const sysMsg = await Message.create({
      conversationId: group._id,
      senderId: userId,
      clientMessageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: MESSAGE_TYPES.SYSTEM,
      content: `${req.user.displayName} removed ${targetName}`
    });

    group.lastMessage = sysMsg._id;
    group.lastActivityAt = new Date();
    await group.save();

    const populated = await Conversation.findById(groupId)
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('participantRoles.user', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    const io = getIO();
    if (io) {
      io.to(`conversation:${groupId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
        conversationId: groupId,
        conversation: populated
      });
      io.to(`user:${targetUserId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
        conversationId: groupId,
        removed: true
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: { group: populated }
    });
  } catch (error) {
    next(error);
  }
};

const leaveGroup = async (req, res, next) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user._id;

    if (!isValidObjectId(groupId)) {
      return res.status(400).json({ success: false, message: 'Invalid group ID' });
    }

    const group = await Conversation.findOne({
      _id: groupId,
      type: CONVERSATION_TYPES.GROUP,
      participants: userId
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const wasAdmin = group.participantRoles.some(
      (pr) => pr.user.toString() === userId.toString() && pr.role === ROLES.ADMIN
    );

    group.participants = group.participants.filter(
      (p) => p.toString() !== userId.toString()
    );
    group.participantRoles = group.participantRoles.filter(
      (pr) => pr.user.toString() !== userId.toString()
    );

    // If leaving user was admin, and there are still members, ensure at least one admin exists
    if (wasAdmin && group.participantRoles.length > 0) {
      const hasOtherAdmin = group.participantRoles.some((pr) => pr.role === ROLES.ADMIN);
      if (!hasOtherAdmin) {
        group.participantRoles[0].role = ROLES.ADMIN;
      }
    }

    const sysMsg = await Message.create({
      conversationId: group._id,
      senderId: userId,
      clientMessageId: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: MESSAGE_TYPES.SYSTEM,
      content: `${req.user.displayName} left the group`
    });

    group.lastMessage = sysMsg._id;
    group.lastActivityAt = new Date();
    await group.save();

    const populated = await Conversation.findById(groupId)
      .populate('participants', 'displayName username avatar isOnline lastSeen about')
      .populate('participantRoles.user', 'displayName username avatar isOnline lastSeen about')
      .populate('lastMessage');

    const io = getIO();
    if (io) {
      io.to(`conversation:${groupId}`).emit(SOCKET_EVENTS.CONVERSATION_UPDATED, {
        conversationId: groupId,
        conversation: populated
      });
    }

    return res.status(200).json({
      success: true,
      message: 'You left the group'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createGroup,
  updateGroup,
  addMembers,
  removeMember,
  leaveGroup
};
