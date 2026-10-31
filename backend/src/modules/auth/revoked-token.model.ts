import { createHash } from 'node:crypto';
import mongoose, { Schema } from 'mongoose';

// Store only the token digest. TTL cleanup is storage maintenance; expiration
// remains enforced independently by JWT validation on every protected request.
export const RevokedToken = mongoose.model('RevokedToken', new Schema({
  _id: String,
  expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: 'sesiones_revocadas' }));
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export const isTokenRevoked = async (token: string) => Boolean(await RevokedToken.exists({ _id: tokenDigest(token) }));
