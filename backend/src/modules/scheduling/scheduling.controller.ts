import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Availability } from './availability.model.js';
import { User } from '../users/user.model.js';

type SlotInput = { date: string; startTime: string; endTime: string; modality: 'virtual' | 'in_person' };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function validateSlot(value: unknown): value is SlotInput {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Partial<SlotInput>;
  if (typeof slot.date !== 'string' || !datePattern.test(slot.date)) return false;
  const [year = 0, month = 0, day = 0] = slot.date.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  if (slot.date < new Date().toISOString().slice(0, 10)) return false;
  return typeof slot.startTime === 'string' && typeof slot.endTime === 'string'
    && timePattern.test(slot.startTime) && timePattern.test(slot.endTime) && slot.startTime < slot.endTime
    && (slot.modality === 'virtual' || slot.modality === 'in_person');
}
export function slotsOverlap(a: { date: string; startTime: string; endTime: string }, b: { date: string; startTime: string; endTime: string }) {
  return a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime;
}
function invalid(response: Response) { response.status(400).json({ error: 'Fecha, horario o modalidad inválidos.' }); }

export async function listAvailability(req: Request, res: Response): Promise<void> {
  const tutorId = typeof req.query.tutorId === 'string' ? req.query.tutorId : undefined;
  if (tutorId && !mongoose.Types.ObjectId.isValid(tutorId)) { res.status(400).json({ error: 'Tutor inválido.' }); return; }
  const query: Record<string, unknown> = { date: { $gte: new Date().toISOString().slice(0, 10) } };
  if (tutorId) query.tutorId = tutorId;
  try { res.json({ data: await Availability.find(query).sort({ date: 1, startTime: 1 }).lean().exec() }); }
  catch { res.status(500).json({ error: 'No se pudo consultar la disponibilidad.' }); }
}
export async function createAvailability(req: Request, res: Response): Promise<void> {
  if (!validateSlot(req.body)) { invalid(res); return; }
  try {
    const conflict = await Availability.findOne({ tutorId: req.authUser!.id, date: req.body.date, startTime: { $lt: req.body.endTime }, endTime: { $gt: req.body.startTime } }).exec();
    if (conflict) { res.status(409).json({ error: 'Ese horario se superpone con otro horario publicado.' }); return; }
    res.status(201).json({ data: await Availability.create({ ...req.body, tutorId: req.authUser!.id }) });
  } catch { res.status(500).json({ error: 'No se pudo publicar el horario.' }); }
}
export async function updateAvailability(req: Request, res: Response): Promise<void> {
  if (!validateSlot(req.body)) { invalid(res); return; }
  try {
    const slot = await Availability.findOneAndUpdate({ _id: req.params.id, tutorId: req.authUser!.id }, req.body, { new: true, runValidators: true }).exec();
    if (!slot) { res.status(404).json({ error: 'Horario no encontrado.' }); return; }
    res.json({ data: slot });
  } catch { res.status(500).json({ error: 'No se pudo modificar el horario.' }); }
}
export async function deleteAvailability(req: Request, res: Response): Promise<void> {
  try {
    const slot = await Availability.findOneAndDelete({ _id: req.params.id, tutorId: req.authUser!.id }).exec();
    if (!slot) { res.status(404).json({ error: 'Horario no encontrado.' }); return; }
    res.status(204).end();
  } catch { res.status(500).json({ error: 'No se pudo eliminar el horario.' }); }
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown> & SlotInput & { tutorId?: string };
  if (typeof body.tutorId !== 'string' || !mongoose.Types.ObjectId.isValid(body.tutorId) || !validateSlot(body)) { invalid(res); return; }
  if (body.tutorId === req.authUser!.id) { res.status(400).json({ error: 'No puedes reservar contigo mismo.' }); return; }
  try {
    const tutor = await User.findOne({ _id: body.tutorId, role: 'tutor', accountStatus: 'active' }).exec();
    if (!tutor) { res.status(404).json({ error: 'Tutor no encontrado.' }); return; }
    const published = await Availability.findOne({ tutorId: body.tutorId, date: body.date, startTime: { $lte: body.startTime }, endTime: { $gte: body.endTime }, modality: body.modality }).exec();
    if (!published) { res.status(409).json({ error: 'El tutor no ofrece ese horario y modalidad.' }); return; }
    const booking = { _id: new mongoose.Types.ObjectId(), studentId: req.authUser!.id, tutorId: body.tutorId, date: body.date, startTime: body.startTime, endTime: body.endTime, modality: body.modality, status: 'pending', createdAt: new Date() };
    // Atomically append on the student record so concurrent requests to different tutors
    // cannot both pass the student's overlap check.
    let savedForStudent = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const student = await User.findById(req.authUser!.id).select('bookingRevision bookings').lean().exec() as any;
      if (!student) { res.status(404).json({ error: 'Estudiante no encontrado.' }); return; }
      if ((student.bookings ?? []).some((item: any) => item.status !== 'cancelled' && slotsOverlap(item, booking))) {
        res.status(409).json({ error: 'Ese horario se superpone con otra reserva tuya.' }); return;
      }
      const saved = await User.updateOne({ _id: req.authUser!.id, bookingRevision: student.bookingRevision ?? 0 }, { $inc: { bookingRevision: 1 }, $push: { bookings: booking } }).exec();
      if (saved.modifiedCount === 1) { savedForStudent = true; break; }
    }
    if (!savedForStudent) { res.status(409).json({ error: 'No se pudo confirmar la reserva por concurrencia. Intenta de nuevo.' }); return; }
    // Serialize booking decisions through a conditional update to the tutor document. MongoDB
    // guarantees single-document atomicity; retries re-read all active reservations.
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await User.findById(body.tutorId).select('bookingRevision bookings').lean().exec() as any;
      if (!current) { res.status(404).json({ error: 'Tutor no encontrado.' }); return; }
      const reservations = (current.bookings ?? []) as Array<Record<string, any>>;
      if (reservations.some((item) => item.status !== 'cancelled' && (item.studentId === req.authUser!.id || item.tutorId === body.tutorId) && slotsOverlap(item as any, booking))) {
        await User.updateOne({ _id: req.authUser!.id }, { $pull: { bookings: { _id: booking._id } } }).exec();
        res.status(409).json({ error: 'Ese horario se superpone con una reserva existente.' }); return;
      }
      const update = await User.updateOne({ _id: body.tutorId, bookingRevision: current.bookingRevision ?? 0 }, { $inc: { bookingRevision: 1 }, $push: { bookings: booking } }).exec();
      if (update.modifiedCount === 1) {
        res.status(201).json({ data: booking }); return;
      }
    }
    await User.updateOne({ _id: req.authUser!.id }, { $pull: { bookings: { _id: booking._id } } }).exec();
    res.status(409).json({ error: 'No se pudo confirmar la reserva por concurrencia. Intenta de nuevo.' });
  } catch { res.status(500).json({ error: 'No se pudo crear la reserva.' }); }
}
export async function listBookings(req: Request, res: Response): Promise<void> {
  try {
    const match = { $or: [{ studentId: req.authUser!.id }, { tutorId: req.authUser!.id }] };
    const users = await User.find({ bookings: { $elemMatch: match } }).select('bookings').lean().exec() as any[];
    const unique = new Map<string, any>();
    for (const booking of users.flatMap((user) => user.bookings ?? []).filter((item: any) => item.studentId === req.authUser!.id || item.tutorId === req.authUser!.id)) unique.set(String(booking._id), booking);
    const data = [...unique.values()];
    res.json({ data });
  } catch { res.status(500).json({ error: 'No se pudieron consultar las reservas.' }); }
}
export async function cancelBooking(req: Request, res: Response): Promise<void> {
  if (typeof req.params.id !== 'string' || !/^[a-f\d]{24}$/i.test(req.params.id)) { res.status(400).json({ error: 'Reserva inválida.' }); return; }
  try {
    const bookingIds = [new mongoose.Types.ObjectId(req.params.id), req.params.id];
    const ownerFilter = { $or: [{ 'bookings.studentId': req.authUser!.id }, { 'bookings.tutorId': req.authUser!.id }] };
    const user = await User.findOne({ _id: req.authUser!.id, ...ownerFilter, 'bookings._id': { $in: bookingIds } }).exec();
    const booking = user?.bookings?.find((item: any) => String(item._id) === req.params.id) as any;
    if (!booking) { res.status(404).json({ error: 'Reserva no encontrada.' }); return; }
    if (booking.status !== 'pending') { res.status(409).json({ error: 'Solo se pueden cancelar reservas pendientes.' }); return; }
    const updated = await User.updateMany({ bookings: { $elemMatch: { _id: { $in: bookingIds }, status: 'pending' } } }, { $set: { 'bookings.$.status': 'cancelled' } }).exec();
    if (!updated.modifiedCount) { res.status(409).json({ error: 'La reserva ya fue modificada.' }); return; }
    res.json({ data: { ...booking, status: 'cancelled' } });
  } catch { res.status(500).json({ error: 'No se pudo cancelar la reserva.' }); }
}
