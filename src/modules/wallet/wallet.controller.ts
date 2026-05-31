import { FastifyRequest, FastifyReply } from 'fastify';
import { getAuth } from '@clerk/fastify';
import { WalletService } from './wallet.service';
import { WalletLedger } from './wallet-ledger.model';
import { User } from '../users/user.model';
import { RazorpayService } from './razorpay.service';

export async function getBalance(request: FastifyRequest, reply: FastifyReply) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const balance = await WalletService.getBalance(user._id.toString());
  return reply.send({ balance });
}

export async function adminCredit(
  request: FastifyRequest<{ Body: { amount: number; targetUserId: string } }>,
  reply: FastifyReply
) {
  // MVP: Manual topup endpoint. 
  // Should ideally have an admin role check or server-to-server auth.
  const { amount, targetUserId } = request.body;
  if (!amount || amount <= 0) {
    return reply.status(400).send({ error: 'Invalid amount' });
  }

  try {
    const result = await WalletService.credit(targetUserId, amount, 'admin_credit');
    return reply.send(result);
  } catch (err: any) {
    return reply.status(500).send({ error: err.message });
  }
}

export async function getLedgerHistory(
  request: FastifyRequest<{ Querystring: { cursor?: string; limit?: number } }>,
  reply: FastifyReply
) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const limit = Number(request.query.limit) || 20;
  const cursor = request.query.cursor;

  const query: any = { userId: user._id };
  if (cursor) {
    query._id = { $lt: cursor };
  }

  const history = await WalletLedger.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1);

  let nextCursor = null;
  if (history.length > limit) {
    const nextItem = history.pop();
    nextCursor = nextItem?._id;
  }

  return reply.send({
    data: history,
    meta: {
      nextCursor,
      limit,
    },
  });
}

export async function createTopupOrder(
  request: FastifyRequest<{ Body: { amount: number; packageId?: string } }>,
  reply: FastifyReply
) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const { amount } = request.body;
  if (!amount || amount <= 0) {
    return reply.status(400).send({ error: 'Invalid amount' });
  }

  try {
    const receipt = `topup_${user._id.toString()}_${Date.now()}`;
    // Assuming 1 INR = 1 coin for simplicity, or some fixed rate.
    // If amount is coins, you might want a conversion rate. 
    // We will assume amount in body is INR.
    const order = await RazorpayService.createOrder(amount, receipt);
    
    return reply.send({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to create payment order' });
  }
}

export async function verifyTopupOrder(
  request: FastifyRequest<{ Body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; coins: number } }>,
  reply: FastifyReply
) {
  const { userId: clerkId } = getAuth(request);
  const user = await User.findOne({ clerkId });
  if (!user) return reply.status(404).send({ error: 'User not found' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, coins } = request.body;
  
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !coins) {
    return reply.status(400).send({ error: 'Missing payment details' });
  }

  const isValid = RazorpayService.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

  if (!isValid) {
    return reply.status(400).send({ error: 'Invalid payment signature' });
  }

  try {
    // Credit the wallet
    const result = await WalletService.credit(
      user._id.toString(), 
      coins, 
      'topup', 
      razorpay_payment_id, 
      { order_id: razorpay_order_id }
    );

    return reply.send(result);
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ error: 'Failed to credit wallet after payment' });
  }
}
