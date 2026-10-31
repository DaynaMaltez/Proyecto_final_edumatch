import { serviceCategories, serviceModalities } from './service.model.js';

export function validateService(body: unknown, categories: readonly string[] = serviceCategories) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Envía los datos del servicio.');
  const data = body as Record<string, unknown>;
  const keys = ['title', 'description', 'category', 'modality', 'hourlyRate', 'travelCost'];
  if (Object.keys(data).some((key) => !keys.includes(key))) throw new Error('El servicio contiene campos no permitidos.');
  if (typeof data.title !== 'string' || data.title.trim().length < 5 || data.title.trim().length > 120) throw new Error('El título debe tener entre 5 y 120 caracteres.');
  if (typeof data.description !== 'string' || data.description.trim().length < 20 || data.description.trim().length > 2000) throw new Error('La descripción debe tener entre 20 y 2000 caracteres.');
  if (typeof data.category !== 'string' || !categories.includes(data.category)) throw new Error('Selecciona una categoría válida.');
  if (!serviceModalities.includes(data.modality as typeof serviceModalities[number])) throw new Error('Selecciona una modalidad válida.');
  const money = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
  if (!money(data.hourlyRate)) throw new Error('El precio por hora debe ser un importe válido con hasta dos decimales.');
  const travelCost = data.travelCost ?? 0;
  if (!money(travelCost)) throw new Error('El traslado debe ser un importe válido con hasta dos decimales.');
  if (data.modality !== 'at_student' && travelCost !== 0) throw new Error('El traslado solo corresponde a servicios a domicilio.');
  return {
    title: data.title.trim(), description: data.description.trim(),
    category: data.category as string,
    modality: data.modality as typeof serviceModalities[number],
    hourlyRate: data.hourlyRate, travelCost,
  };
}
