import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { User } from '../users/user.model.js';
import { Conversation, ChatMessage } from './chat.models.js';
import { notifyChat } from './chat.socket.js';

export const chatRouter = Router();
chatRouter.use(authenticateRequest, requireRole('student', 'tutor'));
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
async function ownConversation(id: unknown, userId: string) {
  if (!validId(id)) return null;
  return Conversation.findOne({ _id: id, $or: [{ studentId: userId }, { tutorId: userId }] }).lean();
}

chatRouter.get('/', async (req, res) => {
  try {
    const conversations = await Conversation.find({ $or: [{ studentId: req.authUser!.id }, { tutorId: req.authUser!.id }] }).sort({ updatedAt: -1 }).lean();
    const data = await Promise.all(conversations.map(async (conversation) => {
      const peerId = String(conversation.studentId) === req.authUser!.id ? conversation.tutorId : conversation.studentId;
      const [peer, lastMessage, unread] = await Promise.all([
        User.findById(peerId).select('fullName').lean(),
        ChatMessage.findOne({ conversationId: conversation._id }).sort({ _id: -1 }).lean(),
        ChatMessage.countDocuments({ conversationId: conversation._id, senderId: { $ne: req.authUser!.id }, readAt: null }),
      ]);
      return { _id: conversation._id, peerId, peerName: peer?.fullName ?? 'Usuario', lastMessage, unread };
    }));
    res.json({ data });
  } catch { res.status(500).json({ error: 'No se pudieron cargar las conversaciones.' }); }
});

chatRouter.post('/', async (req, res) => {
  if (!validId(req.body?.peerId)) { res.status(400).json({ error: 'Selecciona un usuario válido.' }); return; }
  try {
    const oppositeRole = req.authUser!.role === 'student' ? 'tutor' : 'student';
    const peer = await User.findOne({ _id: req.body.peerId, role: oppositeRole, accountStatus: 'active' }).select('fullName').lean();
    if (!peer) { res.status(404).json({ error: 'No se encontró un estudiante o catedrático disponible para esta conversación.' }); return; }
    const pair = req.authUser!.role === 'student' ? { studentId: req.authUser!.id, tutorId: peer._id } : { studentId: peer._id, tutorId: req.authUser!.id };
    const conversation = await Conversation.findOneAndUpdate(pair, { $setOnInsert: pair }, { upsert: true, new: true, runValidators: true });
    res.json({ data: { _id: conversation!._id, peerId: peer._id, peerName: peer.fullName, unread: 0 } });
  } catch { res.status(500).json({ error: 'No se pudo abrir la conversación.' }); }
});

chatRouter.get('/:id/messages', async (req, res) => {
  if (req.query.before !== undefined && !validId(req.query.before)) { res.status(400).json({ error: 'Página de mensajes inválida.' }); return; }
  try {
    const conversation = await ownConversation(req.params.id, req.authUser!.id);
    if (!conversation) { res.status(404).json({ error: 'Conversación no encontrada.' }); return; }
    const messages = await ChatMessage.find({ conversationId: conversation._id, ...(req.query.before ? { _id: { $lt: req.query.before } } : {}) }).sort({ _id: -1 }).limit(51).lean();
    res.json({ data: messages.slice(0, 50).reverse(), hasMore: messages.length > 50 });
  } catch { res.status(500).json({ error: 'No se pudieron cargar los mensajes.' }); }
});

chatRouter.post('/:id/messages', async (req, res) => {
  const { text, clientId } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 2000 || typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientId)) { res.status(400).json({ error: 'Escribe un mensaje de 1 a 2000 caracteres.' }); return; }
  try {
    const conversation = await ownConversation(req.params.id, req.authUser!.id);
    if (!conversation) { res.status(404).json({ error: 'Conversación no encontrada.' }); return; }
    const ids = [String(conversation.studentId), String(conversation.tutorId)];
    if (await User.countDocuments({ _id: { $in: ids }, accountStatus: 'active', role: { $in: ['student', 'tutor'] } }) !== 2) { res.status(403).json({ error: 'Uno de los participantes no está disponible.' }); return; }
    const message = await ChatMessage.findOneAndUpdate({ conversationId: conversation._id, senderId: req.authUser!.id, clientId }, { $setOnInsert: { text: text.trim() } }, { upsert: true, new: true, runValidators: true });
    await Conversation.updateOne({ _id: conversation._id }, { $set: { updatedAt: new Date() } });
    // Persisted history remains available even if the realtime connection drops.
    await notifyChat(ids, 'chat:message', message).catch(() => {});
    res.status(201).json({ data: message });
  } catch { res.status(500).json({ error: 'No se pudo enviar el mensaje. Puedes reintentar.' }); }
});

chatRouter.post('/:id/read', async (req, res) => {
  const ids: unknown = req.body?.messageIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || !ids.every(validId)) { res.status(400).json({ error: 'Mensajes inválidos.' }); return; }
  try {
    const conversation = await ownConversation(req.params.id, req.authUser!.id);
    if (!conversation) { res.status(404).json({ error: 'Conversación no encontrada.' }); return; }
    const filter = { _id: { $in: ids }, conversationId: conversation._id, senderId: { $ne: req.authUser!.id } };
    const readAt = new Date();
    await ChatMessage.updateMany({ ...filter, readAt: null }, { $set: { readAt } });
    const messages = await ChatMessage.find(filter).select('_id readAt').lean();
    const receipt = { conversationId: String(conversation._id), messages };
    await notifyChat([String(conversation.studentId), String(conversation.tutorId)], 'chat:read', receipt).catch(() => {});
    res.json(receipt);
  } catch { res.status(500).json({ error: 'No se pudo actualizar la lectura.' }); }
});
