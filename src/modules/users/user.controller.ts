import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from './user.model';
import { PartnerApplication } from './partner-application.model';
import { redis } from '../../config/redis';

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth.userId;
  const user = await User.findById(clerkId);
  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth.userId;
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
    clerkId,
    { $set: flatUpdates },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send(user);
}

export async function getUserProfile(request: FastifyRequest<{ Params: { username: string } }>, reply: FastifyReply) {
  const { username } = request.params;
  const user = await User.findOne({ username });
  if (!user) return reply.status(404).send({ error: 'User not found' });
  
  return reply.send(user);
}

export async function updateAvailability(request: FastifyRequest<{ Body: { isAvailable: boolean, videoEnabled?: boolean } }>, reply: FastifyReply) {
  const clerkId = (request as any).auth.userId;
  const { isAvailable, videoEnabled } = request.body;

  const updates: any = { 'settings.isAvailable': isAvailable };
  if (videoEnabled !== undefined) {
    updates['settings.videoEnabled'] = videoEnabled;
  }

  const user = await User.findByIdAndUpdate(
    clerkId,
    { $set: updates },
    { new: true }
  );

  if (!user) return reply.status(404).send({ error: 'User not found' });
  
  await redis.del('discovery:listeners');
  return reply.send(user);
}

export async function applyPartner(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  const user = await User.findById(clerkId);
  if (!user) return reply.status(404).send({ error: 'User not found' });

  if (user.settings.isVerified) {
    return reply.status(400).send({ error: 'You are already a verified partner.' });
  }

  const { languages, gender, dob, bio, name: realName, avatarUrl } = request.body as any;

  if (!languages || !gender || !dob || !bio || !realName || !avatarUrl) {
    return reply.status(400).send({ error: 'Missing required fields, including profile photo' });
  }

  // Auto approve logic for MVP
  const application = await PartnerApplication.create({
    userId: user._id,
    realName,
    languages,
    gender,
    dob,
    bio,
    status: 'approved',
  });

  // Update user profile
  user.settings.isListener = true;
  user.settings.isVerified = true;
  user.profile.languages = languages;
  user.profile.bio = bio;
  if (!user.settings.callRate || user.settings.callRate === 0) {
    user.settings.callRate = 8;
  }
  if (avatarUrl) {
    user.profile.avatarUrl = avatarUrl;
  }
  
  await user.save();
  await redis.del('discovery:listeners');

  return reply.send({ success: true, application });
}
