import { FastifyInstance } from 'fastify';
import { sendOtp, verifyOtp } from './auth.controller';

export async function authRoutes(app: FastifyInstance) {
  app.post('/send-otp', sendOtp);
  app.post('/verify-otp', verifyOtp);
}
