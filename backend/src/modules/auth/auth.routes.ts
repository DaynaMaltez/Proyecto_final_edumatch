import { Router } from 'express';
import { authenticateRequest } from './auth.middleware.js';
import { currentSession, googleLogin } from './auth.controller.js';
import { getJwtSecret } from '../../config/env.js';
import { verifyAccessToken } from './jwt.js';
import { RevokedToken, tokenDigest } from './revoked-token.model.js';
import { disconnectSession } from '../chat/chat.socket.js';
import { rateLimit } from 'express-rate-limit';

export const authRouter = Router();

authRouter.post('/google', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Demasiados intentos de inicio de sesión. Inténtalo más tarde.' } }), googleLogin);
authRouter.get('/me', authenticateRequest, currentSession);
authRouter.post('/logout', authenticateRequest, async (req, res) => {
  const token = req.get('authorization')!.trim().split(/\s+/)[1]!;
  const claims = verifyAccessToken(token, getJwtSecret());
  const digest = tokenDigest(token);
  await RevokedToken.updateOne({ _id: digest }, { $set: { expiresAt: new Date(claims.exp * 1000) } }, { upsert: true });
  await disconnectSession(digest);
  res.json({ ok: true });
});
