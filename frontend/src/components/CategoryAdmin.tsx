import { useEffect, useState } from 'react';
import { listCategories, saveCategory, deleteCategory, type AcademicCategory } from '../lib/api';
export default function CategoryAdmin() {
  const [items, setItems] = useState<AcademicCategory[]>([]); const [id, setId] = useState<string>();
  const [name, setName] = useState(''); const [subcategories, setSubcategories] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; listCategories().then((result) => { if (active) setItems(result.data); }).catch((cause) => { if (active) setError(cause.message); }); return () => { active = false; }; }, []);
  async function run(operation: () => Promise<unknown>) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setItems((await listCategories()).data); setId(undefined); setName(''); setSubcategories(''); setMessage('Catálogo actualizado.'); window.dispatchEvent(new Event('categories-updated')); }
    catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <div><h3>Categorías y subcategorías</h3><form className="moderation-form" onSubmit={(event) => { event.preventDefault(); void run(() => saveCategory({ name, subcategories: subcategories.split('\n').map((value) => value.trim()).filter(Boolean) }, id)); }}><label>Nombre de categoría<input required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Subcategorías (una por línea, máximo 30)<textarea maxLength={2500} value={subcategories} onChange={(event) => setSubcategories(event.target.value)} /></label><button disabled={busy}>{id ? 'Guardar cambios' : 'Crear categoría'}</button>{id && <button type="button" onClick={() => { setId(undefined); setName(''); setSubcategories(''); }}>Cancelar edición</button>}</form>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}<div className="service-grid">{items.map((item) => <article className="service-card" key={item._id}><h4>{item.name}</h4><ul>{item.subcategories.map((value) => <li key={value}>{value}</li>)}</ul><button disabled={busy} onClick={() => { setId(item._id); setName(item.name); setSubcategories(item.subcategories.join('\n')); }}>Editar</button><button disabled={busy} onClick={() => void run(() => deleteCategory(item._id))}>Eliminar categoría</button></article>)}</div></div>;
}
