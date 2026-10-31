import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { getJwtSecret, env } from '../../config/env.js';
import { verifyAccessToken } from '../auth/jwt.js';
import { User } from '../users/user.model.js';
import { isTokenRevoked, RevokedToken, tokenDigest } from '../auth/revoked-token.model.js';

let io: Server | undefined;
export function disconnectAccount(id: string) { io?.in(`user:${id}`).disconnectSockets(true); }
export async function disconnectSession(digest: string) {
  if (!io) return;
  const sockets = await io.fetchSockets();
  for (const socket of sockets) if (socket.data.tokenDigest === digest) socket.disconnect(true);
}
export function attachChat(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.frontendUrl }, maxHttpBufferSize: 16384 });
  io.use(async (socket, next) => {
    try {
      if (typeof socket.handshake.auth.token !== 'string') throw new Error();
      const claims = verifyAccessToken(socket.handshake.auth.token, getJwtSecret());
      if (await isTokenRevoked(socket.handshake.auth.token)) throw new Error();
      if (!/^[a-f\d]{24}$/i.test(claims.sub)) throw new Error();
      const account = await User.findOne({ _id: claims.sub, accountStatus: 'active', role: { $in: ['student', 'tutor'] } }).select('_id').lean();
      if (!account) throw new Error();
      socket.data.userId = claims.sub; socket.data.exp = claims.exp;
      socket.data.tokenDigest = tokenDigest(socket.handshake.auth.token);
      next();
    } catch { next(new Error('Inicia sesión nuevamente para usar el chat.')); }
  });
  io.on('connection', (socket) => {
    void socket.join(`user:${socket.data.userId}`);
    const timer = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.exp * 1000 - Date.now()));
    socket.on('disconnect', () => clearTimeout(timer));
  });
  return io;
}

export async function notifyChat(ids: string[], event: string, payload: unknown) {
  if (!io) return;
  for (const id of [...new Set(ids)]) {
    const enabled = await User.exists({ _id: id, accountStatus: 'active', role: { $in: ['student', 'tutor'] } });
    const sockets = await io.in(`user:${id}`).fetchSockets();
    for (const socket of sockets) {
      if (!enabled || socket.data.exp * 1000 <= Date.now() || await RevokedToken.exists({ _id: socket.data.tokenDigest })) socket.disconnect(true);
      else socket.emit(event, payload);
    }
  }
}
