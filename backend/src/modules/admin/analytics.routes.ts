import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { BookingRecord } from '../scheduling/booking.model.js';
import { Review } from '../services/review.model.js';
import { User } from '../users/user.model.js';
import { ConductReport, AccountAppeal } from './moderation.models.js';

export const analyticsRouter = Router();
analyticsRouter.use(authenticateRequest, requireRole('admin'));
export function monthRange(month: unknown) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 2000 || Number(month.slice(0, 4)) > 2100) return null;
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5));
  return { start: `${month}-01`, end: `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01` };
}
analyticsRouter.get('/', async (req, res) => {
  const month = req.query.month ?? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit' }).format(new Date());
  const range = monthRange(month);
  if (!range) { res.status(400).json({ error: 'Selecciona un mes válido (AAAA-MM).' }); return; }
  const [statuses, demand, ranking, users, openReports, pendingAppeals] = await Promise.all([
    BookingRecord.aggregate([{ $match: { date: { $gte: range.start, $lt: range.end } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    BookingRecord.aggregate([
      { $match: { date: { $gte: range.start, $lt: range.end }, status: { $in: ['confirmed', 'completed'] } } },
      { $lookup: { from: 'tutorias', localField: 'serviceId', foreignField: '_id', as: 'service' } },
      { $set: { category: { $ifNull: ['$category', { $ifNull: [{ $arrayElemAt: ['$service.category', 0] }, 'Curso eliminado / sin categoría'] }] }, start: { $split: ['$startTime', ':'] }, end: { $split: ['$endTime', ':'] } } },
      { $group: { _id: '$category', hours: { $sum: { $divide: [{ $subtract: [{ $add: [{ $multiply: [{ $toInt: { $arrayElemAt: ['$end', 0] } }, 60] }, { $toInt: { $arrayElemAt: ['$end', 1] } }] }, { $add: [{ $multiply: [{ $toInt: { $arrayElemAt: ['$start', 0] } }, 60] }, { $toInt: { $arrayElemAt: ['$start', 1] } }] }] }, 60] } }, sessions: { $sum: 1 } } },
      { $sort: { hours: -1, _id: 1 } },
    ]),
    Review.aggregate([{ $group: { _id: '$tutorId', average: { $avg: '$rating' }, count: { $sum: 1 } } }, { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'tutor' } }, { $unwind: '$tutor' }, { $project: { average: 1, count: 1, fullName: '$tutor.fullName', accountStatus: '$tutor.accountStatus' } }, { $sort: { average: -1, count: -1, _id: 1 } }]),
    User.aggregate([{ $group: { _id: '$accountStatus', count: { $sum: 1 } } }]),
    ConductReport.countDocuments({ status: 'open' }), AccountAppeal.countDocuments({ status: 'pending' }),
  ]);
  res.json({ month, statuses, demand, best: ranking.slice(0, 5), worst: [...ranking].sort((a, b) => a.average - b.average || b.count - a.count).slice(0, 5), users, openReports, pendingAppeals });
});
