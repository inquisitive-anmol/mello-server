import { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.middleware';
import { getBalance, getLedgerHistory, adminCredit, createTopupOrder, verifyTopupOrder } from './wallet.controller';

export async function walletRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth as any);

  app.get('/balance', getBalance);
  app.get('/transactions', getLedgerHistory);
  
  // MVP Manual topup endpoint
  app.post('/topup/manual', adminCredit);

  // Razorpay integration
  app.post('/topup/order', createTopupOrder);
  app.post('/topup/verify', verifyTopupOrder);
}
