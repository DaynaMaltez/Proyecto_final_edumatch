import type { IPersonalDetails } from '../users/user.types.js';

export function validatePersonalDetails(value: unknown): IPersonalDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Completa los datos personales obligatorios.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['phone', 'gender', 'documentType', 'documentNumber', 'categoryAffinity'].includes(key))) throw new Error('Los datos personales contienen campos no permitidos.');
  if (typeof data.phone !== 'string' || !/^\+?[0-9]{8,15}$/.test(data.phone.trim())) throw new Error('Indica un teléfono/WhatsApp de 8 a 15 dígitos; puedes incluir + y el código de país.');
  if (typeof data.gender !== 'string' || !['female', 'male', 'other', 'prefer_not_to_say'].includes(data.gender)) throw new Error('Selecciona una opción de género.');
  if (typeof data.documentType !== 'string' || !['dpi', 'passport', 'other'].includes(data.documentType)) throw new Error('Selecciona el tipo de documento de identificación.');
  if (typeof data.documentNumber !== 'string' || !/^[\p{L}\p{N} -]{5,40}$/u.test(data.documentNumber.trim())) throw new Error('Indica un documento de 5 a 40 caracteres (letras, números, espacios o guiones).');
  if (!Array.isArray(data.categoryAffinity) || data.categoryAffinity.length < 1 || data.categoryAffinity.length > 30 || !data.categoryAffinity.every((item) => typeof item === 'string' && item.trim().length >= 2 && item.trim().length <= 80)) throw new Error('Indica entre 1 y 30 categorías de interés.');
  return { phone: data.phone.trim(), gender: data.gender as IPersonalDetails['gender'], documentType: data.documentType as IPersonalDetails['documentType'], documentNumber: data.documentNumber.trim(), categoryAffinity: [...new Set(data.categoryAffinity.map((item: string) => item.trim()))] };
}
export function assertRequiredOnboarding(profile: Record<string, unknown>, role: string) {
  const location = profile.location as { city?: unknown; address?: unknown; coordinates?: { latitude?: unknown; longitude?: unknown } } | undefined;
  if (!location || typeof location.city !== 'string' || !location.city.trim() || typeof location.address !== 'string' || !location.address.trim() || !location.coordinates || typeof location.coordinates.latitude !== 'number' || typeof location.coordinates.longitude !== 'number') throw new Error('Completa ciudad, dirección habitual y selecciona tus coordenadas en el mapa.');
  if (role === 'tutor' && (!Array.isArray(profile.credentials) || !profile.credentials.some((credential: unknown) => credential && typeof credential === 'object' && 'evidenceUrl' in credential && typeof credential.evidenceUrl === 'string' && credential.evidenceUrl.startsWith('https://')))) throw new Error('Agrega al menos una credencial con enlace HTTPS a tu hoja de vida, PDF o portafolio.');
}
