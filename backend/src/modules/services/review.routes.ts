import { Router } from 'express';
import mongoose from 'mongoose';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { BookingRecord } from '../scheduling/booking.model.js';
import { User } from '../users/user.model.js';
import { Review } from './review.model.js';
import { hasClassEnded } from '../scheduling/calendar.helpers.js';

export const reviewRouter = Router();
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
export async function tutorRating(tutorId: mongoose.Types.ObjectId) {
  const [summary] = await Review.aggregate<{ averageRating: number; reviewCount: number }>([{ $match: { tutorId } }, { $group: { _id: '$tutorId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } }]);
  return { averageRating: summary?.averageRating ?? null, reviewCount: summary?.reviewCount ?? 0 };
}
reviewRouter.get('/tutor/:id', async (req, res) => {
  if (!validId(req.params.id)) { res.status(400).json({ error: 'Catedrático inválido.' }); return; }
  const page = Number(req.query.page ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) { res.status(400).json({ error: 'Página inválida.' }); return; }
  try {
    const tutorId = new mongoose.Types.ObjectId(req.params.id);
    if (!await User.exists({ _id: tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified' })) { res.status(404).json({ error: 'Catedrático no disponible.' }); return; }
    const [data, summary] = await Promise.all([
      Review.find({ tutorId }).select('rating comment studentName serviceTitle createdAt').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 10).limit(10).lean(), tutorRating(tutorId),
    ]);
    res.json({ data, ...summary, totalPages: Math.ceil(summary.reviewCount / 10) });
  } catch { res.status(500).json({ error: 'No se pudieron cargar las reseñas.' }); }
});
reviewRouter.get('/me', authenticateRequest, requireRole('student'), async (req, res) => {
  try { res.json({ data: await Review.find({ studentId: req.authUser!.id }).select('bookingId rating comment').lean() }); }
  catch { res.status(500).json({ error: 'No se pudieron cargar tus reseñas.' }); }
});
reviewRouter.post('/', authenticateRequest, requireRole('student'), async (req, res) => {
  const { bookingId, rating, comment } = req.body ?? {};
  if (!validId(bookingId) || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== 'string' || comment.trim().length < 3 || comment.trim().length > 2000) { res.status(400).json({ error: 'Selecciona de 1 a 5 estrellas y escribe un comentario de 3 a 2000 caracteres.' }); return; }
  try {
    const booking = await BookingRecord.findOne({ _id: bookingId, studentId: req.authUser!.id, status: 'completed' }).lean();
    if (!booking || !hasClassEnded(booking.date, booking.endTime)) { res.status(403).json({ error: 'Solo puedes reseñar tus clases completadas y finalizadas.' }); return; }
    const review = await Review.create({ bookingId: booking._id, tutorId: booking.tutorId, studentId: req.authUser!.id, studentName: req.authUser!.fullName.split(/\s+/)[0] || 'Estudiante', serviceTitle: booking.serviceTitle, rating, comment: comment.trim() });
    const summary = await tutorRating(booking.tutorId);
    res.status(201).json({ data: review, ...summary });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) { res.status(409).json({ error: 'Ya publicaste una reseña para esta clase.' }); return; }
    res.status(500).json({ error: 'No se pudo publicar la reseña.' });
  }
});
