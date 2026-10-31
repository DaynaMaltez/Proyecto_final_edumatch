import { Router } from 'express';
import { AcademicCategory, categoryNames } from '../admin/category.routes.js';
import mongoose from 'mongoose';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { User } from '../users/user.model.js';
import { TutoringService, serviceCategories, serviceModalities } from './service.model.js';
import { validateService } from './service.validation.js';
import { Enrollment } from './enrollment.model.js';
import { requireApprovedTutor } from '../auth/approved-tutor.middleware.js';
import { Availability } from '../scheduling/availability.model.js';
import { todayGuatemala } from '../scheduling/calendar.helpers.js';

export const serviceRouter = Router();

serviceRouter.get('/', async (req, res) => {
  const { category, modality, page = '1' } = req.query;
  if ((category !== undefined && (typeof category !== 'string' || category.length > 80)) ||
      (modality !== undefined && !serviceModalities.includes(modality as typeof serviceModalities[number])) ||
      typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || !Number.isSafeInteger(Number(page)) || Number(page) > 10000) {
    res.status(400).json({ error: 'Los filtros del catálogo no son válidos.' }); return;
  }
  try {
    // Only approved active tutors appear in the public catalog.
    const tutors = await User.find({ role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true } }).select('_id fullName').lean();
    const names = new Map(tutors.map((tutor) => [String(tutor._id), tutor.fullName]));
    const filter = { tutorId: { $in: tutors.map((tutor) => tutor._id) }, ...(category ? { category } : {}), ...(modality ? { modality } : {}) };
    const [services, total] = await Promise.all([
      TutoringService.find(filter).sort({ createdAt: -1, _id: -1 }).skip((Number(page) - 1) * 12).limit(12).lean(),
      TutoringService.countDocuments(filter),
    ]);
    res.json({ data: services.map((service) => ({ ...service, tutorName: names.get(String(service.tutorId)) })), total, page: Number(page), totalPages: Math.ceil(total / 12) });
  } catch { res.status(500).json({ error: 'No se pudo cargar el catálogo.' }); }
});

serviceRouter.get('/tutor/:tutorId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.tutorId)) { res.status(400).json({ error: 'Catedrático inválido.' }); return; }
  try {
    const tutor = await User.exists({ _id: req.params.tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true } });
    if (!tutor) { res.status(404).json({ error: 'Catedrático no encontrado.' }); return; }
    const services = await TutoringService.find({ tutorId: req.params.tutorId }).sort({ createdAt: -1 }).lean();
    res.json({ data: services });
  } catch { res.status(500).json({ error: 'No se pudieron cargar los cursos del catedrático.' }); }
});

serviceRouter.get('/enrollments/me', authenticateRequest, requireRole('student'), async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ studentId: req.authUser!.id }).select('serviceId tutorId status createdAt updatedAt').lean();
    const courses = await TutoringService.find({ _id: { $in: enrollments.map((item) => item.serviceId) } }).select('title').lean();
    const tutors = await User.find({ _id: { $in: enrollments.map((item) => item.tutorId) } }).select('fullName').lean();
    res.json({ data: enrollments.map((item) => ({ ...item, serviceTitle: courses.find((course) => String(course._id) === String(item.serviceId))?.title ?? 'Curso eliminado', tutorName: tutors.find((tutor) => String(tutor._id) === String(item.tutorId))?.fullName ?? 'Catedrático' })) });
  } catch { res.status(500).json({ error: 'No se pudieron cargar tus inscripciones.' }); }
});

serviceRouter.post('/:id/rating', authenticateRequest, requireRole('student'), (_req, res) => { res.status(409).json({ error: 'Publica tu reseña desde una clase completada en Mi calendario.' }); });

serviceRouter.post('/:id/route', authenticateRequest, requireRole('student'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Curso inválido.' }); return; }
  const { latitude, longitude } = req.body ?? {};
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) { res.status(400).json({ error: 'Indica una ubicación válida para la clase.' }); return; }
  try {
    const service = await TutoringService.findById(req.params.id).lean();
    if (!service || service.modality !== 'at_student') { res.status(400).json({ error: 'La ruta solo aplica a clases a domicilio.' }); return; }
    const tutor = await User.findOne({ _id: service.tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified' }).select('tutorProfile.location.coordinates tutorProfile.travelRatePerKm').lean();
    const origin = tutor?.tutorProfile?.location?.coordinates;
    if (!origin) { res.status(422).json({ error: 'El catedrático debe guardar sus coordenadas en Mi perfil para calcular rutas.' }); return; }
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${longitude},${latitude}?overview=full&geometries=geojson`;
    const result = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!result.ok) throw new Error('Routing unavailable');
    const payload = await result.json() as { code: string; routes?: Array<{ distance: number; duration: number; geometry: { coordinates: number[][] } }> };
    const route = payload.routes?.[0];
    if (payload.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) { res.status(422).json({ error: 'No se encontró una ruta por carretera para estas ubicaciones.' }); return; }
    const kilometers = route.distance / 1000;
    const rate = tutor?.tutorProfile?.travelRatePerKm;
    res.json({ distanceKm: kilometers, durationMinutes: route.duration / 60, coordinates: route.geometry.coordinates, travelRatePerKm: rate ?? null, travelCost: rate === undefined ? service.travelCost : Math.round(kilometers * rate * 100) / 100, pricing: rate === undefined ? 'fixed' : 'per_km' });
  } catch { res.status(503).json({ error: 'El servicio de rutas no está disponible. Inténtalo más tarde.' }); }
});

serviceRouter.post('/:id/enroll', authenticateRequest, requireRole('student'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Curso inválido.' }); return; }
  try {
    const service = await TutoringService.findById(req.params.id).lean();
    if (!service) { res.status(404).json({ error: 'Este curso ya no está disponible.' }); return; }
    const tutor = await User.exists({ _id: service.tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true } });
    if (!tutor) { res.status(404).json({ error: 'Este curso ya no está disponible.' }); return; }
    // A unique index and upsert make repeated requests a single enrollment.
    const enrollment = await Enrollment.findOneAndUpdate(
      { studentId: req.authUser!.id, serviceId: service._id },
      { $setOnInsert: { tutorId: service.tutorId } },
      { upsert: true, new: true, runValidators: true },
    );
    res.json({ data: enrollment });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res.json({ message: 'Ya estás inscrito en este curso.' }); return;
    }
    res.status(500).json({ error: 'No se pudo completar la inscripción.' });
  }
});

serviceRouter.use(authenticateRequest, requireRole('tutor'));

serviceRouter.get('/requests/me', async (req, res) => {
  try {
    const requests = await Enrollment.find({ tutorId: req.authUser!.id, $or: [{ status: 'pending' }, { status: { $exists: false } }] }).sort({ createdAt: -1 }).lean();
    const students = await User.find({ _id: { $in: requests.map((item) => item.studentId) } }).select('fullName').lean();
    const courses = await TutoringService.find({ _id: { $in: requests.map((item) => item.serviceId) } }).select('title').lean();
    res.json({ data: requests.map((item) => ({ ...item, studentName: students.find((student) => String(student._id) === String(item.studentId))?.fullName ?? 'Estudiante', serviceTitle: courses.find((course) => String(course._id) === String(item.serviceId))?.title ?? 'Curso eliminado' })) });
  } catch { res.status(500).json({ error: 'No se pudieron cargar las solicitudes.' }); }
});

serviceRouter.patch('/requests/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !['approved', 'rejected'].includes(req.body?.status)) { res.status(400).json({ error: 'Solicitud o estado inválido.' }); return; }
  try {
    if (req.body.status === 'approved') {
      const enrollment = await Enrollment.findOne({ _id: req.params.id, tutorId: req.authUser!.id }).select('serviceId').lean();
      if (!enrollment) { res.status(404).json({ error: 'Solicitud no encontrada.' }); return; }
      if (!await TutoringService.exists({ _id: enrollment.serviceId, tutorId: req.authUser!.id })) { res.status(409).json({ error: 'No puedes aprobar una inscripción a un curso eliminado.' }); return; }
    }
    const result = await Enrollment.findOneAndUpdate({ _id: req.params.id, tutorId: req.authUser!.id, $or: [{ status: 'pending' }, { status: { $exists: false } }] }, { $set: { status: req.body.status } }, { new: true, runValidators: true });
    if (!result) { res.status(404).json({ error: 'La solicitud no está pendiente o no pertenece a tu cuenta.' }); return; }
    res.json({ data: result });
  } catch { res.status(500).json({ error: 'No se pudo actualizar la solicitud.' }); }
});

serviceRouter.get('/me', async (req, res) => {
  try { res.json({ data: await TutoringService.find({ tutorId: req.authUser!.id }).sort({ createdAt: -1 }).lean() }); }
  catch { res.status(500).json({ error: 'No se pudieron cargar tus servicios.' }); }
});

serviceRouter.post('/', requireApprovedTutor, async (req, res) => {
  let data;
  try { data = validateService(req.body, await categoryNames()); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  try {
    const tutor = await User.exists({ _id: req.authUser!.id, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true } });
    if (!tutor) { res.status(403).json({ error: 'Completa tu perfil de catedrático antes de publicar.' }); return; }
    let service;
    await mongoose.connection.transaction(async (session) => {
      const category = await AcademicCategory.findOneAndUpdate({ name: data.category }, { $inc: { revision: 1 } }, { session });
      if (!category) throw new Error('CATEGORY_CHANGED');
      [service] = await TutoringService.create([{ ...data, tutorId: req.authUser!.id }], { session });
    });
    res.status(201).json({ data: service });
  } catch (error) {
    if ((error as Error).message === 'CATEGORY_CHANGED') { res.status(409).json({ error: 'La categoría cambió. Actualiza el catálogo e inténtalo de nuevo.' }); return; }
    res.status(500).json({ error: 'No se pudo publicar el servicio.' });
  }
});

serviceRouter.put('/:id', requireApprovedTutor, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Servicio inválido.' }); return; }
  let data;
  try { data = validateService(req.body, await categoryNames()); }
  catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
  const session = await mongoose.startSession();
  try {
    let service;
    await session.withTransaction(async () => {
      if (!await AcademicCategory.findOneAndUpdate({ name: data.category }, { $inc: { revision: 1 } }, { session })) throw new Error('CATEGORY_CHANGED');
      const current = await TutoringService.findOne({ _id: req.params.id, tutorId: req.authUser!.id }).session(session).lean();
      if (!current) throw new Error('NOT_FOUND');
      service = await TutoringService.findOneAndUpdate({ _id: current._id }, { $set: data }, { new: true, runValidators: true, session });
      if (current.modality !== data.modality && await Availability.exists({ serviceId: current._id, date: { $gte: todayGuatemala() } }).session(session)) throw new Error('MODALITY_CONFLICT');
    });
    res.json({ data: service });
  } catch (error) {
    if (error instanceof Error && error.message === 'CATEGORY_CHANGED') { res.status(409).json({ error: 'La categoría cambió. Actualiza el catálogo e inténtalo de nuevo.' }); return; }
    if (error instanceof Error && error.message === 'NOT_FOUND') { res.status(404).json({ error: 'Servicio no encontrado.' }); return; }
    if (error instanceof Error && error.message === 'MODALITY_CONFLICT') { res.status(409).json({ error: 'Elimina primero los horarios futuros de este curso antes de cambiar su modalidad.' }); return; }
    res.status(500).json({ error: 'No se pudo actualizar el servicio.' });
  } finally { await session.endSession(); }
});

serviceRouter.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Servicio inválido.' }); return; }
  try {
    const service = await TutoringService.findOneAndDelete({ _id: req.params.id, tutorId: req.authUser!.id });
    if (!service) { res.status(404).json({ error: 'Servicio no encontrado.' }); return; }
    res.json({ message: 'Servicio eliminado.' });
  } catch { res.status(500).json({ error: 'No se pudo eliminar el servicio.' }); }
});
