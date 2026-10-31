import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../users/user.model.js';
import { TutoringService } from '../services/service.model.js';
import { Availability } from './availability.model.js';
import { BookingRecord } from './booking.model.js';
import { calendarConflict, expandDates, sessionTotal, todayGuatemala, legacyIntervals, hasClassEnded } from './calendar.helpers.js';

class CalendarError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
const active = ['pending', 'confirmed'];
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
function readTimes(body: Record<string, unknown>) {
  const pattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof body.startTime !== 'string' || typeof body.endTime !== 'string' || !pattern.test(body.startTime) || !pattern.test(body.endTime) || body.startTime >= body.endTime) throw new CalendarError('Indica un intervalo de horas válido.', 400);
  return { startTime: body.startTime, endTime: body.endTime };
}
function future(date: string, time: string) {
  const timestamp = new Date(`${date}T${time}:00-06:00`).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw new CalendarError('No puedes publicar o reservar horarios pasados o inválidos.', 400);
}
function datesFor(date: string, recurrence: unknown) {
  try { return expandDates(date, recurrence); }
  catch (error) { throw new CalendarError(error instanceof Error ? error.message : 'Repetición inválida.', 400); }
}
function fail(res: Response, error: unknown) {
  res.status(error instanceof CalendarError ? error.status : 500).json({ error: error instanceof CalendarError ? error.message : 'No se pudo completar la operación del calendario.' });
}
async function lockUsers(ids: string[], session: mongoose.ClientSession) {
  for (const id of [...new Set(ids)].sort()) {
    const result = await User.updateOne({ _id: id, accountStatus: 'active' }, { $inc: { bookingRevision: 1 } }, { session });
    if (result.matchedCount !== 1) throw new CalendarError('Una de las cuentas ya no está disponible.');
  }
}

export async function listSlots(req: Request, res: Response) {
  if ((req.query.tutorId !== undefined && !validId(req.query.tutorId)) || (req.query.serviceId !== undefined && !validId(req.query.serviceId))) { res.status(400).json({ error: 'Curso o catedrático inválido.' }); return; }
  try {
    const filter = { date: { $gte: todayGuatemala() }, ...(req.query.tutorId ? { tutorId: req.query.tutorId } : {}), ...(req.query.serviceId ? { serviceId: req.query.serviceId } : {}) };
    const slots = await Availability.find(filter).sort({ date: 1, startTime: 1 }).limit(1000).lean();
    const services = await TutoringService.find({ _id: { $in: slots.map((slot) => slot.serviceId).filter(Boolean) } }).select('_id').lean();
    const serviceIds = new Set(services.map((service) => String(service._id)));
    const tutorIds = slots.map((slot) => slot.tutorId);
    const tutors = await User.find({ _id: { $in: tutorIds }, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified' }).select('_id bookings').lean();
    const enabled = new Set(tutors.map((tutor) => String(tutor._id)));
    const reservations = await BookingRecord.find({ tutorId: { $in: tutorIds }, status: { $in: active } }).lean();
    const legacy = tutors.flatMap((tutor) => legacyIntervals(tutor.bookings).map((booking) => ({ ...booking, tutorId: tutor._id })));
    const data = slots.filter((slot) => enabled.has(String(slot.tutorId)) && slot.serviceId && serviceIds.has(String(slot.serviceId)) && new Date(`${slot.date}T${slot.startTime}:00-06:00`).getTime() > Date.now()).map((slot) => ({ ...slot, available: ![...reservations, ...legacy].some((booking) => String(booking.tutorId) === String(slot.tutorId) && calendarConflict(slot, booking, true)) }));
    res.json({ data });
  } catch (error) { fail(res, error); }
}

export async function publishSlots(req: Request, res: Response) {
  const session = await mongoose.startSession();
  try {
    const body = req.body ?? {};
    if (!validId(body.serviceId)) throw new CalendarError('Selecciona uno de tus cursos.', 400);
    const times = readTimes(body);
    const dates = datesFor(body.date, body.recurrence);
    for (const date of dates) future(date, times.startTime);
    const buffer = body.bufferMinutes ?? 30;
    if (!Number.isInteger(buffer) || buffer < 0 || buffer > 180) throw new CalendarError('El margen de traslado debe ser de 0 a 180 minutos.', 400);
    let saved: unknown[] = [];
    await session.withTransaction(async () => {
      await lockUsers([req.authUser!.id], session);
      const service = await TutoringService.findOne({ _id: body.serviceId, tutorId: req.authUser!.id }).session(session).lean();
      const approved = await User.exists({ _id: req.authUser!.id, 'tutorProfile.verificationStatus': 'verified' }).session(session);
      if (!approved) throw new CalendarError('El administrador debe aprobar tu perfil antes de publicar horarios.', 403);
      if (!service) throw new CalendarError('El curso no pertenece a tu cuenta.', 403);
      await TutoringService.updateOne({ _id: service._id }, { $inc: { bookingRevision: 1 } }, { session, timestamps: false });
      const seriesId = dates.length > 1 ? new mongoose.Types.ObjectId().toString() : undefined;
      const records = dates.map((date) => ({ ...times, date, tutorId: req.authUser!.id, serviceId: service._id, serviceTitle: service.title, modality: service.modality, bufferMinutes: service.modality === 'at_student' ? buffer : 0, seriesId }));
      const existing = await Availability.find({ tutorId: req.authUser!.id }).session(session).lean();
      const booked = await BookingRecord.find({ tutorId: req.authUser!.id, status: { $in: active } }).session(session).lean();
      const owner = await User.findById(req.authUser!.id).select('bookings').session(session).lean();
      for (const record of records) {
        if (existing.some((slot) => calendarConflict(record, slot)) || [...booked, ...legacyIntervals(owner?.bookings)].some((slot) => calendarConflict(record, slot, true))) throw new CalendarError(`Hay un traslape el ${record.date}. No se publicó ningún horario de la serie.`);
      }
      saved = await Availability.insertMany(records, { session });
    });
    res.status(201).json({ data: saved });
  } catch (error) { if (error instanceof Error && !(error instanceof CalendarError) && /repetición|sesiones|Fecha|días/.test(error.message)) fail(res, new CalendarError(error.message, 400)); else fail(res, error); }
  finally { await session.endSession(); }
}

export async function removeSlot(req: Request, res: Response) {
  if (!validId(req.params.id)) { res.status(400).json({ error: 'Horario inválido.' }); return; }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await lockUsers([req.authUser!.id], session);
      const slot = await Availability.findOne({ _id: req.params.id, tutorId: req.authUser!.id }).session(session).lean();
      if (!slot) throw new CalendarError('Horario no encontrado.', 404);
      const bookings = await BookingRecord.find({ tutorId: req.authUser!.id, status: { $in: active } }).session(session).lean();
      if (bookings.some((booking) => calendarConflict(slot, booking))) throw new CalendarError('Cancela las reservas de este horario antes de eliminarlo.');
      await Availability.deleteOne({ _id: slot._id }, { session });
    });
    res.json({ message: 'Horario eliminado.' });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
}

async function prepareBooking(req: Request) {
  const body = req.body ?? {};
  if (!validId(body.slotId)) throw new CalendarError('Selecciona un horario del curso.', 400);
  const slot = await Availability.findById(body.slotId).lean();
  if (!slot?.serviceId) throw new CalendarError('El horario ya no está disponible.', 404);
  const service = await TutoringService.findById(slot.serviceId).lean();
  const tutor = await User.findOne({ _id: slot.tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified' }).select('fullName tutorProfile').lean();
  if (!service || !tutor) throw new CalendarError('El curso ya no está disponible.', 404);
  const dates = datesFor(slot.date, body.recurrence);
  for (const date of dates) future(date, slot.startTime);
  let travelCost = service.modality === 'at_student' ? service.travelCost : 0;
  if (service.modality === 'at_student' && tutor.tutorProfile?.travelRatePerKm !== undefined) {
    const origin = tutor.tutorProfile.location?.coordinates;
    const { latitude, longitude } = body;
    if (!origin || typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new CalendarError('Para calcular la movilización se necesitan las coordenadas del catedrático y del lugar de la clase.', 400);
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${longitude},${latitude}?overview=false`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new CalendarError('No se pudo calcular el traslado. Intenta nuevamente.', 503);
    const payload = await response.json() as { code: string; routes?: Array<{ distance: number }> };
    const distance = payload.routes?.[0]?.distance;
    if (payload.code !== 'Ok' || distance === undefined || !Number.isFinite(distance)) throw new CalendarError('No se encontró una ruta al lugar de la clase.', 422);
    travelCost = Math.round(distance / 1000 * tutor.tutorProfile.travelRatePerKm * 100) / 100;
  }
  const total = sessionTotal(slot.startTime, slot.endTime, service.hourlyRate, travelCost);
  return { slot, service, tutor, dates, travelCost, total };
}

export async function previewBooking(req: Request, res: Response) {
  try { const { dates, total, travelCost, service } = await prepareBooking(req); res.json({ dates, sessionTotal: total, total: Math.round(total * dates.length * 100) / 100, hourlyRate: service.hourlyRate, travelCost }); }
  catch (error) { fail(res, error); }
}

export async function reserveSessions(req: Request, res: Response) {
  const session = await mongoose.startSession();
  try {
    const prepared = await prepareBooking(req);
    const { slot, service, tutor, dates, travelCost, total } = prepared;
    if (typeof req.body.expectedTotal !== 'number' || !Number.isFinite(req.body.expectedTotal) || Math.abs(req.body.expectedTotal - Math.round(total * dates.length * 100) / 100) > 0.001) throw new CalendarError('El precio cambió o falta la cotización. Revisa el precio antes de confirmar.');
    const seriesId = dates.length > 1 ? new mongoose.Types.ObjectId().toString() : undefined;
    const destination = service.modality === 'at_student' && typeof req.body.latitude === 'number' && Number.isFinite(req.body.latitude) && Math.abs(req.body.latitude) <= 90 && typeof req.body.longitude === 'number' && Number.isFinite(req.body.longitude) && Math.abs(req.body.longitude) <= 180 ? { latitude: req.body.latitude, longitude: req.body.longitude } : undefined;
    if (service.modality === 'at_student' && !destination) throw new CalendarError('Indica las coordenadas donde recibirás la clase.', 400);
    const records = dates.map((date) => ({ date, startTime: slot.startTime, endTime: slot.endTime, modality: service.modality, serviceId: service._id, serviceTitle: service.title, category: service.category, tutorId: slot.tutorId, studentId: req.authUser!.id, studentName: req.authUser!.fullName, tutorName: tutor.fullName, status: 'pending', seriesId, bufferMinutes: slot.bufferMinutes ?? 0, hourlyRate: service.hourlyRate, travelCost, total, destination }));
    let saved: unknown[] = [];
    await session.withTransaction(async () => {
      await lockUsers([req.authUser!.id, String(slot.tutorId)], session);
      await TutoringService.updateOne({ _id: service._id }, { $inc: { bookingRevision: 1 } }, { session, timestamps: false });
      const currentService = await TutoringService.findById(service._id).session(session).lean();
      const currentTutor = await User.findById(slot.tutorId).session(session).lean();
      if (currentTutor?.tutorProfile?.verificationStatus !== 'verified') throw new CalendarError('El catedrático no está aprobado para recibir reservas.', 403);
      const currentStudent = await User.findById(req.authUser!.id).select('role').session(session).lean();
      if (currentStudent?.role !== 'student') throw new CalendarError('Esta cuenta ya no puede reservar como estudiante.', 403);
      if (JSON.stringify(currentTutor?.tutorProfile?.location?.coordinates) !== JSON.stringify(tutor.tutorProfile?.location?.coordinates)) throw new CalendarError('La ubicación del catedrático cambió. Revisa el precio nuevamente.');
      if (!currentService || currentService.updatedAt.getTime() !== service.updatedAt.getTime() || currentTutor?.role !== 'tutor' || currentTutor.tutorProfile?.travelRatePerKm !== tutor.tutorProfile?.travelRatePerKm) throw new CalendarError('El curso o la tarifa cambió. Calcula el precio nuevamente.');
      const existing = await BookingRecord.find({ status: { $in: active }, $or: [{ tutorId: slot.tutorId }, { studentId: req.authUser!.id }] }).session(session).lean();
      const participants = await User.find({ _id: { $in: [slot.tutorId, req.authUser!.id] } }).select('bookings').session(session).lean();
      for (const record of records) {
        const published = await Availability.findOne({ serviceId: service._id, tutorId: slot.tutorId, date: record.date, startTime: record.startTime, endTime: record.endTime, modality: service.modality }).session(session).lean();
        if (!published) throw new CalendarError(`No existe disponibilidad del curso el ${record.date}. No se reservó ninguna sesión.`);
        record.bufferMinutes = service.modality === 'at_student' ? published.bufferMinutes ?? 30 : 0;
        if (existing.some((booking) => calendarConflict(record, booking, String(booking.tutorId) === String(slot.tutorId))) || records.some((other) => other !== record && calendarConflict(record, other, true))) throw new CalendarError(`Hay una reserva o margen de traslado que se cruza el ${record.date}. No se reservó ninguna sesión.`);
        // Existing embedded bookings remain blocked during transition to the calendar collection.
        for (const participant of participants) for (const legacy of participant.bookings ?? []) {
          if (legacy.status !== 'cancelled' && legacy.status !== 'rejected' && typeof legacy.date === 'string' && typeof legacy.startTime === 'string' && typeof legacy.endTime === 'string' && calendarConflict(record, legacy as { date: string; startTime: string; endTime: string }, String(participant._id) === String(slot.tutorId))) throw new CalendarError(`El ${record.date} se cruza con una reserva anterior.`);
        }
      }
      saved = await BookingRecord.insertMany(records, { session });
    });
    res.status(201).json({ data: saved });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
}

export async function myCalendar(req: Request, res: Response) {
  try {
    const data = await BookingRecord.find({ $or: [{ tutorId: req.authUser!.id }, { studentId: req.authUser!.id }] }).sort({ date: 1, startTime: 1 }).lean();
    const user = await User.findById(req.authUser!.id).select('bookings').lean();
    res.json({ data: [...data, ...(user?.bookings ?? []).map((booking) => ({ ...booking, legacy: true, serviceTitle: 'Reserva anterior' }))] });
  } catch (error) { fail(res, error); }
}

export async function changeBooking(req: Request, res: Response) {
  if (!validId(req.params.id) || !['confirm', 'reject', 'cancel', 'complete'].includes(req.body?.action) || (req.body.entireSeries !== undefined && typeof req.body.entireSeries !== 'boolean')) { res.status(400).json({ error: 'Acción o reserva inválida.' }); return; }
  const session = await mongoose.startSession();
  try {
    const booking = await BookingRecord.findById(req.params.id).lean();
    if (!booking || ![String(booking.tutorId), String(booking.studentId)].includes(req.authUser!.id)) throw new CalendarError('Reserva no encontrada.', 404);
    const { action, entireSeries } = req.body;
    if (action === 'complete') {
      if (req.authUser!.role !== 'tutor' || String(booking.tutorId) !== req.authUser!.id) throw new CalendarError('Solo el catedrático puede marcar la clase como completada.', 403);
      if (entireSeries === true) throw new CalendarError('Completa cada clase de la serie por separado.', 400);
      if (!hasClassEnded(booking.date, booking.endTime)) throw new CalendarError('La clase debe haber terminado antes de marcarla como completada.');
      const updated = await BookingRecord.findOneAndUpdate({ _id: booking._id, tutorId: req.authUser!.id, status: 'confirmed' }, { $set: { status: 'completed', completedAt: new Date() } }, { new: true });
      if (!updated) throw new CalendarError('Solo se pueden completar clases confirmadas.');
      res.json({ message: 'Clase completada. El estudiante ya puede escribir su reseña.' }); return;
    }
    future(booking.date, booking.startTime);
    if (action !== 'cancel' && String(booking.tutorId) !== req.authUser!.id) throw new CalendarError('Solo el catedrático puede aceptar o rechazar.', 403);
    const status = action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'cancelled';
    await session.withTransaction(async () => {
      await lockUsers([String(booking.tutorId), String(booking.studentId)], session);
      const today = todayGuatemala();
      const nowTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const filter = entireSeries === true && booking.seriesId ? { seriesId: booking.seriesId, studentId: booking.studentId, tutorId: booking.tutorId, $or: [{ date: { $gt: today } }, { date: today, startTime: { $gt: nowTime } }] } : { _id: booking._id };
      const result = await BookingRecord.updateMany({ ...filter, status: { $in: action === 'cancel' ? active : ['pending'] } }, { $set: { status } }, { session });
      if (!result.modifiedCount) throw new CalendarError('La reserva ya cambió de estado. Actualiza el calendario.');
    });
    res.json({ message: 'Calendario actualizado.' });
  } catch (error) { fail(res, error); } finally { await session.endSession(); }
}
