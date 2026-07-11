import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from './user.model';
import { PartnerApplication } from './partner-application.model';
import { Report } from './report.model';
import { redis } from '../../config/redis';
import { Types } from 'mongoose';
import { Room } from '../rooms/room.model';
import { RoomService } from '../rooms/room.service';

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const user = await User.findById(userId);
  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const updates = request.body as any;

  // Flatten the object for $set so nested properties don't overwrite the whole object
  const flatUpdates: Record<string, any> = {};
  function flatten(obj: any, prefix = '') {
    for (const key in obj) {
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        flatten(obj[key], `${prefix}${key}.`);
      } else {
        flatUpdates[`${prefix}${key}`] = obj[key];
      }
    }
  }
  flatten(updates);

  // Security: prevent users from making themselves listeners or verified
  delete flatUpdates['settings.isListener'];
  delete flatUpdates['settings.isVerified'];

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: flatUpdates },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function getUserProfile(request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) {
  const { username } = request.params;
  
  let query: any = { username };
  if (Types.ObjectId.isValid(username)) {
    query = { $or: [{ username }, { _id: username }] };
  }

  // B-6: Exclude pushToken so we don't leak it to public clients
  const user = await User.findOne(query).select('-pushToken');
  if (!user) return reply.status(404).send({ error: 'User not found' });
  
  return reply.send(user);
}

export async function updateAvailability(request: FastifyRequest<{ Body: { isAvailable: boolean, videoEnabled?: boolean } }>, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const { isAvailable, videoEnabled } = request.body;

  const updates: any = { 'settings.isAvailable': isAvailable };
  if (videoEnabled !== undefined) {
    updates['settings.videoEnabled'] = videoEnabled;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  
  await redis.del('discovery:listeners');
  return reply.send(user);
}

export async function applyPartner(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const user = await User.findById(userId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  if (user.settings.isVerified) {
    return reply.status(400).send({ error: 'You are already a verified partner.' });
  }

  const { languages, gender, dob, bio, description, interests, name: realName, avatarUrl } = request.body as any;

  if (!languages || !gender || !dob || !bio || !description || !realName || !avatarUrl) {
    return reply.status(400).send({ error: 'Missing required fields, including description and profile photo' });
  }

  // Create pending application
  const application = await PartnerApplication.create({
    userId: user._id,
    realName,
    languages,
    gender,
    dob,
    bio,
    description,
    avatarUrl,
    interests: interests || [],
    status: 'pending',
  });

  return reply.send({ success: true, application });
}

export async function savePushToken(
  request: FastifyRequest<{ Body: { pushToken: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const { pushToken } = request.body as any;

  if (!pushToken) {
    return reply.status(400).send({ error: 'pushToken is required' });
  }

  await User.findByIdAndUpdate(userId, { $set: { pushToken } });
  return reply.send({ success: true });
}

export async function reportUser(
  request: FastifyRequest<{ Params: { id: string }, Body: { reason: string, description?: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const reporter = await User.findById(userId);
  if (!reporter) return reply.status(404).send({ error: 'User not found' });

  const { id: reportedId } = request.params;
  const { reason, description } = request.body;

  if (!reason) {
    return reply.status(400).send({ error: 'Reason is required' });
  }

  const reportedUser = await User.findById(reportedId);
  if (!reportedUser) {
    return reply.status(404).send({ error: 'Target user not found' });
  }

  const report = await Report.create({
    reporterId: reporter._id,
    reportedId: reportedUser._id,
    reason,
    description
  });

  // End any active room between the two users
  const activeRoom = await Room.findOne({
    'participants.userId': { $all: [reporter._id, reportedUser._id] },
    status: { $in: ['waiting', 'active'] }
  });

  if (activeRoom) {
    try {
      await RoomService.endRoom(activeRoom._id.toString());
    } catch (e) {
      console.error('Failed to end room during report', e);
    }
  }

  return reply.send({ success: true, reportId: report._id });
}

export async function blockUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const userId = (request as any).auth.userId;
  const caller = await User.findById(userId);
  if (!caller) return reply.status(404).send({ error: 'User not found' });

  const { id: targetId } = request.params;
  const targetUser = await User.findById(targetId);
  if (!targetUser) return reply.status(404).send({ error: 'Target user not found' });

  // Add to blockedUsers
  await User.findByIdAndUpdate(userId, { $addToSet: { blockedUsers: targetUser._id } });

  // End any active room between the two users
  const activeRoom = await Room.findOne({
    'participants.userId': { $all: [caller._id, targetUser._id] },
    status: { $in: ['waiting', 'active'] }
  });

  if (activeRoom) {
    try {
      await RoomService.endRoom(activeRoom._id.toString());
    } catch (e) {
      console.error('Failed to end room during block', e);
    }
  }

  return reply.send({ success: true });
}

export async function deleteAccount(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).auth.userId;
  const user = await User.findById(userId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  await User.findByIdAndDelete(userId);
  await redis.del('discovery:listeners');

  return reply.send({ success: true, message: 'Account deleted successfully' });
}
