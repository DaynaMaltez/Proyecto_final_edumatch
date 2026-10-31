import { Router } from 'express';
import { User } from '../users/user.model.js';
import { notifyChat } from '../chat/chat.socket.js';
import { authenticateRequest } from '../auth/auth.middleware.js';
import {
  getMyProfile,
  updateMyProfile,
  completeOnboarding,
} from './profile.controller.js';
export const profileRouter = Router();

profileRouter.use(authenticateRequest); //Aqui se exige el uso del JWT
profileRouter.post('/resubmit', async (req, res) => {
  if (req.authUser?.role !== 'tutor') { res.status(403).json({ error: 'Solo los catedráticos pueden solicitar revisión.' }); return; }
  try {
    const user = await User.findOneAndUpdate({ _id: req.authUser.id, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'rejected' }, { $set: { 'tutorProfile.verificationStatus': 'pending', 'tutorProfile.reviewNote': '' }, $inc: { __v: 1 } });
    if (!user) { res.status(409).json({ error: 'El perfil no tiene una solicitud rechazada para reenviar.' }); return; }
    await notifyChat([req.authUser.id], 'profile:reviewed', { status: 'pending' }).catch(() => {});
    res.json({ message: 'Perfil enviado nuevamente a revisión.' });
  } catch { res.status(500).json({ error: 'No se pudo solicitar la revisión.' }); }
});
profileRouter.get('/me', getMyProfile);
profileRouter.put('/me', updateMyProfile);
profileRouter.post('/onboarding', completeOnboarding);
