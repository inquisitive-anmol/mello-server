import Razorpay from 'razorpay';
import crypto from 'crypto';

export class RazorpayService {
  private static instance: Razorpay;

  private static getInstance() {
    if (!this.instance) {
      const key_id = process.env.RAZORPAY_KEY_ID || 'dummy_key';
      const key_secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
      
      this.instance = new Razorpay({
        key_id,
        key_secret,
      });
    }
    return this.instance;
  }

  static async createOrder(amountInRupees: number, receipt: string): Promise<any> {
    const razorpay = this.getInstance();
    
    // Razorpay expects amount in paise (smallest currency unit)
    const options = {
      amount: amountInRupees * 100,
      currency: 'INR',
      receipt,
    };

    return razorpay.orders.create(options);
  }

  static verifySignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';
    
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  }
}
