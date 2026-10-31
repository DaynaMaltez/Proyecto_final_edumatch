import { Router } from 'express';
import { getPublicTutor, listPublicTutors } from './tutor.controller.js';

export const tutorRouter = Router();

tutorRouter.get('/', listPublicTutors);
tutorRouter.get('/:id', getPublicTutor);
