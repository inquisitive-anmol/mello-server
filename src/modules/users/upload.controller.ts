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

  let data: any = null;

  // Since we changed the frontend to send a JSON body with Base64 to bypass AdminJS multipart conflicts:
  const body = request.body as any;
  if (body && body.fileBase64 && body.filename) {
    try {
      // fileBase64 is a Data URL: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ..."
      const base64Data = body.fileBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      data = {
        filename: body.filename,
        file: buffer,
        isBuffer: true
      };
    } catch (e) {
      return reply.status(400).send({ error: 'Invalid Base64 payload' });
    }
  }

  // Fallback if still using multipart (for backwards compatibility if needed)
  if (!data) {
    try {
      if (request.isMultipart()) {
        data = await request.file();
      }
    } catch (e) {
      // Ignore
    }
    
    if (!data && body && body.file) {
      const fileField = Array.isArray(body.file) ? body.file[0] : body.file;
      if (fileField) {
        const buffer = fileField.value || fileField.data || fileField._buf || fileField.file;
        if (Buffer.isBuffer(buffer) || (buffer && buffer.length)) {
          data = {
            filename: fileField.filename || `avatar_${clerkId}.jpg`,
            file: buffer,
            isBuffer: true
          };
        }
      }
    }
  }

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

  if (data.isBuffer) {
    await fs.promises.writeFile(filePath, data.file);
  } else {
    await pipeline(data.file, fs.createWriteStream(filePath));
  }

  // Construct public URL
  // We should prefer the BASE_URL env variable to avoid reverse-proxy protocol issues (like http instead of https)
  const baseUrl = process.env.BASE_URL || `${request.protocol}://${request.headers.host}`;
  const publicUrl = `${baseUrl.replace(/\/$/, '')}/assets/avatars/${filename}`;

  return reply.send({ success: true, url: publicUrl });
}
