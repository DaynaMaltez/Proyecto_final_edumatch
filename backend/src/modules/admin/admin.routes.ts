import { Router } from 'express';
import mongoose from 'mongoose';
import { notifyChat } from '../chat/chat.socket.js';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { User } from '../users/user.model.js';

export const adminRouter = Router();
adminRouter.use(authenticateRequest, requireRole('admin'));
adminRouter.get('/tutors', async (req, res) => {
  const status = req.query.status ?? 'pending'; const page = Number(req.query.page ?? 1);
  if (!['pending', 'verified', 'rejected'].includes(status as string) || !Number.isSafeInteger(page) || page < 1 || page > 10000) { res.status(400).json({ error: 'Filtro inválido.' }); return; }
  try {
    const filter = { role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': status };
    const [data, total] = await Promise.all([User.find(filter).select('fullName email tutorProfile createdAt').sort({ createdAt: 1 }).skip((page - 1) * 20).limit(20).lean(), User.countDocuments(filter)]);
    res.json({ data, total, totalPages: Math.ceil(total / 20) });
  } catch { res.status(500).json({ error: 'No se pudieron consultar los catedráticos.' }); }
});
adminRouter.patch('/tutors/:id/review', async (req, res) => {
  const { status, note } = req.body ?? {};
  if (!mongoose.isValidObjectId(req.params.id) || !['verified', 'rejected'].includes(status) || (note !== undefined && (typeof note !== 'string' || note.length > 1000)) || (status === 'rejected' && (typeof note !== 'string' || !note.trim()))) { res.status(400).json({ error: 'Selecciona una decisión válida. Para rechazar, indica el motivo (máximo 1000 caracteres).' }); return; }
  try {
    const user = await User.findOneAndUpdate({ _id: req.params.id, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'pending' }, { $set: { 'tutorProfile.verificationStatus': status, 'tutorProfile.reviewNote': typeof note === 'string' ? note.trim() : '', 'tutorProfile.reviewedAt': new Date() }, $inc: { __v: 1 } }, { new: true, runValidators: true }).select('fullName tutorProfile.verificationStatus tutorProfile.reviewNote tutorProfile.reviewedAt');
    if (!user) { res.status(409).json({ error: 'La solicitud ya fue revisada o no está disponible.' }); return; }
    await notifyChat([String(user._id)], 'profile:reviewed', { status, reviewNote: user.tutorProfile?.reviewNote, reviewedAt: user.tutorProfile?.reviewedAt }).catch(() => {});
    res.json({ data: user });
  } catch { res.status(500).json({ error: 'No se pudo guardar la revisión.' }); }
});
