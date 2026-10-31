import type { RequestHandler } from 'express';
import { User } from '../users/user.model.js';
export const requireApprovedTutor: RequestHandler = async (req, res, next) => {
  try {
    const approved = await User.exists({ _id: req.authUser?.id, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified' });
    if (!approved) { res.status(403).json({ error: 'Tu perfil de catedrático debe ser aprobado por el administrador para publicar tutorías.' }); return; }
    next();
  } catch { res.status(500).json({ error: 'No se pudo comprobar la aprobación del perfil.' }); }
};
