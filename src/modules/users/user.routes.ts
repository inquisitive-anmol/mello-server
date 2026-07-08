import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getMe, updateMe, updateAvailability, applyPartner, getUserProfile, savePushToken, reportUser, blockUser } from './user.controller';
import { uploadAvatar } from './upload.controller';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);

  app.get('/me', getMe);
  app.patch('/me', updateMe);
  app.get('/:username', getUserProfile);
  app.patch('/me/availability', updateAvailability);
  
  // Partner / Listener Application
  app.post('/partner/apply', applyPartner);

  // Avatar Upload
  app.post('/upload-avatar', uploadAvatar);

  // Push notification token registration
  app.post('/push-token', savePushToken);

  // User Reporting & Blocking
  app.post('/:id/report', reportUser);
  app.post('/:id/block', blockUser);
}
