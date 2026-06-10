import { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
// import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';

export async function uploadAvatar(request: FastifyRequest, reply: FastifyReply) {
  const clerkId = (request as any).auth?.userId || 'dev_user_1';
  if (!clerkId) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: 'No file uploaded' });
  }

  const ext = path.extname(data.filename) || '.jpg';
  const filename = `${clerkId}-${randomUUID()}${ext}`;
  const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
  const filePath = path.join(uploadDir, filename);

  // Ensure directory exists (though we created it manually, good to be safe)
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  await pipeline(data.file, fs.createWriteStream(filePath));

  // Construct public URL
  // If we are relying on EXPO_PUBLIC_API_URL or something, we can use the request host
  const protocol = request.protocol;
  const host = request.headers.host;
  const publicUrl = `${protocol}://${host}/assets/avatars/${filename}`;

  return reply.send({ success: true, url: publicUrl });
}
