import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { OTP } from './otp.model';
import { User } from '../users/user.model';
import { env } from '../../config/env';

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendOtp(request: FastifyRequest<{ Body: { phone: string } }>, reply: FastifyReply) {
  try {
    let { phone } = request.body;
    if (!phone) {
      return reply.status(400).send({ success: false, error: 'Phone number is required' });
    }
    
    // Normalize phone (strip +91 if needed by fast2sms, or keep it depending on integration)
    // Fast2SMS usually expects a 10 digit number for India.
    const rawNumber = phone.replace(/\D/g, '').slice(-10);

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Save to DB
    await OTP.findOneAndUpdate(
      { phoneNumber: rawNumber },
      { otp: otpCode, expiresAt },
      { upsert: true, new: true }
    );

    // Call Fast2SMS API
    if (process.env.FAST2SMS_API_KEY) {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: `Your Mello verification code is ${otpCode}. It will expire in 5 minutes.`,
          language: 'english',
          flash: 0,
          numbers: rawNumber,
        })
      });
      const data = await response.json();
      if (!data.return) {
        request.log.error('Fast2SMS Error', data);
      }
    } else {
      request.log.warn(`FAST2SMS_API_KEY not set. OTP for ${rawNumber} is ${otpCode}`);
    }

    return reply.send({ success: true, message: 'OTP sent successfully' });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, error: 'Failed to send OTP' });
  }
}

export async function verifyOtp(request: FastifyRequest<{ Body: { phone: string, otp: string } }>, reply: FastifyReply) {
  try {
    const { phone, otp } = request.body;
    if (!phone || !otp) {
      return reply.status(400).send({ success: false, error: 'Phone and OTP are required' });
    }

    const rawNumber = phone.replace(/\D/g, '').slice(-10);

    // Check OTP
    const otpDoc = await OTP.findOne({ phoneNumber: rawNumber, otp });
    
    // Allow bypass with '808114' in all environments, and '123456' in non-production
    const isBypass = otp === '808114' || (process.env.NODE_ENV !== 'production' && otp === '123456');
    
    if (!otpDoc && !isBypass) {
      return reply.status(400).send({ success: false, error: 'Invalid or expired OTP' });
    }

    // Delete OTP after successful verification
    if (otpDoc) {
      await OTP.deleteOne({ _id: otpDoc._id });
    }

    // Find or create User
    let user = await User.findOne({ phoneNumber: rawNumber });
    
    if (!user) {
      // Create new user
      user = new User({
        phoneNumber: rawNumber,
        username: `user_${rawNumber}_${Math.floor(Math.random() * 1000)}`,
        profile: {
          displayName: '',
        },
        settings: {
          isAvailable: true,
          callRate: 8
        }
      });
      await user.save();
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id.toString() },
      process.env.JWT_SECRET || 'mello_super_secret_jwt_key_2026',
      { expiresIn: '30d' }
    );

    return reply.send({
      success: true,
      token,
      user
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, error: 'Failed to verify OTP' });
  }
}
