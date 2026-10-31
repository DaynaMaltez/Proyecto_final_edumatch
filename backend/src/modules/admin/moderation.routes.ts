import { Router } from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { User } from '../users/user.model.js';
import { ConductReport, AccountAppeal } from './moderation.models.js';
import { Review } from '../services/review.model.js';
import { disconnectAccount } from '../chat/chat.socket.js';

export const moderationRouter = Router();
moderationRouter.use(authenticateRequest);
const text = (value: unknown, min: number, max: number): value is string => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const objectId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
export const validReport = (body: { targetId?: unknown; reason?: unknown; evidence?: unknown }) => objectId(body.targetId) && typeof body.reason === 'string' && ['absence', 'conduct', 'charges', 'other'].includes(body.reason) && text(body.evidence, 10, 4000);
export const validAppeal = (value: unknown) => text(value, 20, 4000);

moderationRouter.get('/me', async (req, res) => {
  const account = await User.findById(req.authUser!.id).select('accountStatus suspension').lean();
  const appeals = await AccountAppeal.find({ userId: req.authUser!.id }).sort({ createdAt: -1 }).limit(20).select('-reviewedBy').lean();
  res.json({ accountStatus: account?.accountStatus, suspension: account?.suspension, appeals });
});
moderationRouter.post('/appeals', async (req, res) => {
  if (!validAppeal(req.body?.statement)) { res.status(400).json({ error: 'Expón tu apelación entre 20 y 4000 caracteres.' }); return; }
  const user = await User.findById(req.authUser!.id);
  if (user?.accountStatus !== 'suspended') { res.status(409).json({ error: 'Tu cuenta no está suspendida.' }); return; }
  if (!user.suspension) { res.status(409).json({ error: 'El administrador debe registrar el motivo de esta suspensión antes de que puedas apelar.' }); return; }
  try {
    const data = await AccountAppeal.create({ userId: user._id, caseId: user.suspension.caseId, suspensionReason: user.suspension.reason, statement: req.body.statement.trim() });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) { res.status(409).json({ error: 'Ya enviaste una apelación para esta suspensión. Puedes consultar su resolución aquí.' }); return; }
    throw error;
  }
});
moderationRouter.post('/reports', requireRole('student', 'tutor'), async (req, res) => {
  if (!validReport(req.body ?? {}) || req.body.targetId.toLowerCase() === req.authUser!.id.toLowerCase()) { res.status(400).json({ error: 'Selecciona otro usuario, un motivo y evidencia entre 10 y 4000 caracteres.' }); return; }
  const target = await User.findOne({ _id: req.body.targetId, role: { $in: ['student', 'tutor'] } }).select('_id');
  if (!target) { res.status(404).json({ error: 'El usuario no está disponible.' }); return; }
  try {
    const data = await ConductReport.create({ reporterId: req.authUser!.id, targetId: target._id, reason: req.body.reason, evidence: req.body.evidence.trim() });
    res.status(201).json({ data });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) { res.status(409).json({ error: 'Ya tienes una denuncia abierta contra este usuario.' }); return; }
    throw error;
  }
});
moderationRouter.get('/reports/me', requireRole('student', 'tutor'), async (req, res) => {
  res.json({ data: await ConductReport.find({ reporterId: req.authUser!.id }).populate('targetId', 'fullName').sort({ createdAt: -1 }).limit(100).lean() });
});

moderationRouter.use(requireRole('admin'));
moderationRouter.get('/reviews/:id', async (req, res) => {
  if (!objectId(req.params.id)) { res.status(400).json({ error: 'Catedrático inválido.' }); return; }
  res.json({ data: await Review.find({ tutorId: req.params.id }).select('rating comment studentName serviceTitle createdAt').sort({ createdAt: -1 }).limit(100).lean() });
});
moderationRouter.get('/users', async (req, res) => {
  const query = String(req.query.q ?? '').trim();
  if (query.length < 2 || query.length > 120) { res.status(400).json({ error: 'Busca por nombre o correo (2 a 120 caracteres).' }); return; }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  res.json({ data: await User.find({ role: { $in: ['student', 'tutor'] }, $or: [{ fullName: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }] }).select('fullName email role accountStatus suspension').limit(30).lean() });
});
moderationRouter.get('/reports', async (req, res) => {
  const status = String(req.query.status ?? 'open');
  if (!['open', 'dismissed', 'actioned', 'all'].includes(status) || (req.query.targetId && !objectId(req.query.targetId))) { res.status(400).json({ error: 'Filtro inválido.' }); return; }
  res.json({ data: await ConductReport.find({ ...(status !== 'all' ? { status } : {}), ...(req.query.targetId ? { targetId: req.query.targetId } : {}) }).populate('reporterId targetId', 'fullName email accountStatus').sort({ createdAt: -1 }).limit(100).lean() });
});
moderationRouter.patch('/reports/:id', async (req, res) => {
  if (!objectId(req.params.id) || !['dismissed', 'actioned'].includes(req.body?.status) || !text(req.body?.decision, 10, 2000)) { res.status(400).json({ error: 'Indica una resolución de 10 a 2000 caracteres.' }); return; }
  const data = await ConductReport.findOneAndUpdate({ _id: req.params.id, status: 'open' }, { $set: { status: req.body.status, decision: req.body.decision.trim(), reviewedBy: req.authUser!.id, reviewedAt: new Date() } }, { new: true });
  if (!data) { res.status(409).json({ error: 'La denuncia ya fue resuelta.' }); return; }
  res.json({ data });
});
moderationRouter.patch('/users/:id/suspend', async (req, res) => {
  if (!objectId(req.params.id) || !text(req.body?.reason, 10, 2000)) { res.status(400).json({ error: 'Indica el motivo de suspensión (10 a 2000 caracteres).' }); return; }
  const data = await User.findOneAndUpdate({ _id: req.params.id, role: { $in: ['student', 'tutor'] }, accountStatus: 'active' }, { $set: { accountStatus: 'suspended', suspension: { reason: req.body.reason.trim(), suspendedAt: new Date(), suspendedBy: req.authUser!.id, caseId: randomUUID() } }, $inc: { __v: 1 } }, { new: true }).select('fullName accountStatus suspension');
  if (!data) { res.status(409).json({ error: 'La cuenta ya está suspendida o no se puede moderar.' }); return; }
  disconnectAccount(String(data._id));
  res.json({ data });
});
moderationRouter.get('/appeals', async (req, res) => {
  const status = String(req.query.status ?? 'pending');
  if (!['pending', 'accepted', 'rejected'].includes(status)) { res.status(400).json({ error: 'Estado inválido.' }); return; }
  res.json({ data: await AccountAppeal.find({ status }).populate('userId', 'fullName email accountStatus').sort({ createdAt: 1 }).limit(100).lean() });
});
moderationRouter.patch('/appeals/:id', async (req, res) => {
  if (!objectId(req.params.id) || !['accepted', 'rejected'].includes(req.body?.status) || !text(req.body?.decision, 10, 2000)) { res.status(400).json({ error: 'Indica una decisión y justificación de 10 a 2000 caracteres.' }); return; }
  try {
    await mongoose.connection.transaction(async (session) => {
      const appeal = await AccountAppeal.findOne({ _id: req.params.id, status: req.body.status === 'accepted' ? { $in: ['pending', 'rejected'] } : 'pending' }).session(session);
      if (!appeal) throw new Error('CONFLICT');
      const user = await User.findOne({ _id: appeal.userId, accountStatus: 'suspended', 'suspension.caseId': appeal.caseId }).session(session);
      if (!user) throw new Error('CONFLICT');
      if (req.body.status === 'accepted') {
        await User.updateOne({ _id: user._id, 'suspension.caseId': appeal.caseId }, { $set: { accountStatus: 'active' }, $unset: { suspension: 1 }, $inc: { __v: 1 } }, { session });
      }
      appeal.status = req.body.status; appeal.decision = req.body.decision.trim(); appeal.reviewedBy = new mongoose.Types.ObjectId(req.authUser!.id); appeal.reviewedAt = new Date();
      appeal.set('decisions', [...(appeal.get('decisions') ?? []), { status: appeal.status, decision: appeal.decision, reviewedBy: appeal.reviewedBy, reviewedAt: appeal.reviewedAt }]);
      await appeal.save({ session });
    });
    res.json({ ok: true });
  } catch (error) { if ((error as Error).message === 'CONFLICT') { res.status(409).json({ error: 'La apelación ya fue resuelta o corresponde a otra suspensión.' }); return; } throw error; }
});
