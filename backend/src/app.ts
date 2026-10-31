import cors from 'cors';
import helmet from 'helmet';
import { categoryRouter } from './modules/admin/category.routes.js';
import { moderationRouter } from './modules/admin/moderation.routes.js';
import { analyticsRouter } from './modules/admin/analytics.routes.js';
import { reviewRouter } from './modules/services/review.routes.js';
import type { ErrorRequestHandler } from 'express';
import { adminRouter } from './modules/admin/admin.routes.js';
import { chatRouter } from './modules/chat/chat.routes.js';
import { serviceRouter } from './modules/services/service.routes.js';
import express from 'express';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { tutorRouter } from './modules/tutors/tutor.routes.js';
import { profileRouter } from './modules/profiles/profile.routes.js';
import { scheduleRouter, bookingRouter } from './modules/scheduling/scheduling.routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json({ limit: '64kb' }));
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/tutors', tutorRouter);
app.use('/api/services', serviceRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/reviews', reviewRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/availability', scheduleRouter);
app.use('/api/bookings', bookingRouter);
app.use((_req, res) => { res.status(404).json({ error: 'La ruta solicitada no existe.' }); });
const apiErrorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (status === 400 || status === 413) {
    res.status(status).json({ error: status === 413 ? 'La solicitud es demasiado grande.' : 'El cuerpo de la solicitud no contiene JSON válido.' }); return;
  }
  res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
};
app.use(apiErrorHandler);
