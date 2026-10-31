import { Router } from 'express';
import mongoose, { Schema } from 'mongoose';
import { authenticateRequest, requireRole } from '../auth/auth.middleware.js';
import { TutoringService, serviceCategories } from '../services/service.model.js';

const schema = new Schema({ name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80, unique: true }, revision: { type: Number, default: 0 }, subcategories: { type: [String], default: [] } }, { timestamps: true, collection: 'categorias' });
export const AcademicCategory = mongoose.model('AcademicCategory', schema);
// Only initialize the catalog once. Deleting a default category must not recreate it.
const settings = mongoose.model('CatalogSetting', new Schema({ _id: String, initialized: Boolean }, { collection: 'catalog_settings' }));
export async function ensureCategories() {
  await mongoose.connection.transaction(async (session) => {
    if (await settings.exists({ _id: 'categories' }).session(session)) return;
    for (const name of serviceCategories) await AcademicCategory.updateOne({ name }, { $setOnInsert: { name, subcategories: [] } }, { upsert: true, session });
    await settings.create([{ _id: 'categories', initialized: true }], { session });
  });
}
export async function categoryNames() { return (await AcademicCategory.find().select('name').lean()).map((item) => item.name); }
export function validCategory(body: unknown): body is { name: string; subcategories: string[] } {
  if (!body || typeof body !== 'object') return false;
  const { name, subcategories } = body as { name?: unknown; subcategories?: unknown };
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 80 && Array.isArray(subcategories) && subcategories.length <= 30 && subcategories.every((value) => typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80) && new Set(subcategories.map((value: string) => value.trim().toLocaleLowerCase())).size === subcategories.length;
}
export const categoryRouter = Router();
categoryRouter.get('/', async (_req, res) => { res.json({ data: await AcademicCategory.find().sort({ name: 1 }).lean() }); });
categoryRouter.use(authenticateRequest, requireRole('admin'));
categoryRouter.post('/', async (req, res) => {
  if (!validCategory(req.body)) { res.status(400).json({ error: 'Indica nombre y hasta 30 subcategorías únicas de 2 a 80 caracteres.' }); return; }
  try { res.status(201).json({ data: await AcademicCategory.create({ name: req.body.name.trim(), subcategories: req.body.subcategories.map((value: string) => value.trim()) }) }); }
  catch (error) { if ((error as { code?: number }).code === 11000) { res.status(409).json({ error: 'La categoría ya existe.' }); return; } throw error; }
});
categoryRouter.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !validCategory(req.body)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }
  try {
    await mongoose.connection.transaction(async (session) => {
      const category = await AcademicCategory.findByIdAndUpdate(req.params.id, { $inc: { revision: 1 } }, { new: true, session });
      if (!category) throw new Error('NOT_FOUND');
      const previous = category.name;
      category.name = req.body.name.trim(); category.subcategories = req.body.subcategories.map((value: string) => value.trim());
      await category.save({ session });
      await TutoringService.updateMany({ category: previous }, { $set: { category: category.name } }, { session });
    });
    res.json({ ok: true });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) { res.status(409).json({ error: 'La categoría ya existe.' }); return; }
    if ((error as Error).message === 'NOT_FOUND') { res.status(404).json({ error: 'Categoría no encontrada.' }); return; } throw error;
  }
});
categoryRouter.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(400).json({ error: 'Categoría inválida.' }); return; }
  try {
    await mongoose.connection.transaction(async (session) => {
      const category = await AcademicCategory.findByIdAndUpdate(req.params.id, { $inc: { revision: 1 } }, { new: true, session });
      if (!category) throw new Error('NOT_FOUND');
      if (await TutoringService.exists({ category: category.name }).session(session)) throw new Error('IN_USE');
      await category.deleteOne({ session });
    });
    res.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === 'IN_USE') { res.status(409).json({ error: 'La categoría tiene cursos. Reasígnalos antes de eliminarla.' }); return; }
    if ((error as Error).message === 'NOT_FOUND') { res.status(404).json({ error: 'Categoría no encontrada.' }); return; } throw error;
  }
});
