import { Router } from 'express';
import { requireApprovedTutor } from '../auth/approved-tutor.middleware.js';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { cancelBooking } from './scheduling.controller.js';
import { changeBooking, listSlots, myCalendar, previewBooking, publishSlots, removeSlot, reserveSessions } from './calendar.controller.js';

export const scheduleRouter = Router();
scheduleRouter.get('/', listSlots);
scheduleRouter.post('/', authenticateRequest, requireRole('tutor'), requireApprovedTutor, publishSlots);
scheduleRouter.delete('/:id', authenticateRequest, requireRole('tutor'), removeSlot);

export const bookingRouter = Router();
bookingRouter.use(authenticateRequest);
bookingRouter.post('/', requireRole('student'), reserveSessions);
bookingRouter.post('/preview', requireRole('student'), previewBooking);
bookingRouter.get('/me', myCalendar);
bookingRouter.patch('/:id/status', changeBooking);
bookingRouter.patch('/:id/cancel', cancelBooking);
