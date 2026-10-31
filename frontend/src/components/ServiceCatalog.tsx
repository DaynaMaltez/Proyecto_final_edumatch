import { useEffect, useState, type FormEvent } from 'react';
import TravelRoute from './TravelRoute';
import { Link } from 'react-router-dom';
import { listCategories } from '../lib/api';
import { deleteService, getAccessToken, getMyProfile, listServices, myServices, saveService, serviceCategories, type OwnProfile, type TeachingModality, type TutoringService } from '../lib/api';

const modes: Record<TeachingModality, string> = { virtual: 'Virtual', at_tutor: 'En casa del catedrático', at_student: 'A domicilio' };
const blank = () => ({ title: '', description: '', category: 'Matemáticas', modality: 'virtual' as TeachingModality, hourlyRate: '', travelCost: '' });
const amount = (value: number) => `Q ${value.toFixed(2)}`;

export default function ServiceCatalog({ profileOpen, mode = 'public' }: { profileOpen: boolean; mode?: 'public' | 'manage' }) {
  const [categoryOptions, setCategoryOptions] = useState<string[]>([...serviceCategories]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void listCategories().then(({ data }) => { if (active) setCategoryOptions(data.map((item) => item.name)); }).catch(() => {}); };
    refresh(); window.addEventListener('categories-updated', refresh); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('categories-updated', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  const [account, setAccount] = useState<OwnProfile | null>(null);
  const [services, setServices] = useState<TutoringService[]>([]);
  const [owned, setOwned] = useState<TutoringService[]>([]);
  const [category, setCategory] = useState('');
  const [modality, setModality] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('profile-review-updated', refresh);
    return () => window.removeEventListener('profile-review-updated', refresh);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (mode === 'manage') { setLoading(false); return; }
    listServices(category, modality, page).then((result) => {
      if (!active) return;
      if (page > 1 && page > result.totalPages) { setPage(Math.max(1, result.totalPages)); return; }
      setServices(result.data); setPages(result.totalPages); setTotal(result.total);
    }).catch((cause: unknown) => { if (active) { setServices([]); setError(cause instanceof Error ? cause.message : 'No se pudo cargar el catálogo.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [category, modality, page, revision, mode]);

  useEffect(() => {
    let active = true;
    setAccount(null); setOwned([]);
    if (!getAccessToken()) return;
    getMyProfile().then(async ({ user }) => {
      if (!active) return;
      setAccount(user);
      if (user.role === 'tutor') {
        const result = await myServices();
        if (active) setOwned(result.data);
      }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar tu cuenta.'); });
    return () => { active = false; };
  }, [profileOpen, revision]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await saveService({ ...form, hourlyRate: Number(form.hourlyRate), travelCost: form.modality === 'at_student' ? Number(form.travelCost) : 0 }, editing);
      setMessage(editing ? 'Servicio actualizado.' : 'Tu tutoría ya está publicada en el catálogo.');
      setForm(blank()); setEditing(undefined); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  async function remove(service: TutoringService) {
    if (!window.confirm(`¿Eliminar «${service.title}» del catálogo?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await deleteService(service._id);
      if (editing === service._id) { setEditing(undefined); setForm(blank()); }
      setMessage('Servicio eliminado.'); setRevision((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo eliminar.'); }
    finally { setBusy(false); }
  }

  return <section className="section service-catalog" id="catalogo">
    <div className="container">
      <div className="section-heading"><span className="eyebrow">CATÁLOGO DE TUTORÍAS</span><h2>{mode === 'manage' ? <>Mis <span>tutorías</span></> : <>Aprende a tu <span>manera</span></>}</h2><p>Explora servicios publicados por nuestros catedráticos. Precios en quetzales por hora; traslado por sesión cuando corresponda.</p></div>
      {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}
      {message && <p role="status" className="profile-message">{message}</p>}
      {mode === 'manage' && account?.role === 'tutor' && account.tutorProfile?.verificationStatus !== 'verified' && <p>Tu perfil debe ser aprobado por el administrador antes de publicar tutorías. Revisa el estado en Mi perfil.</p>}{mode === 'manage' && account?.role === 'tutor' && account.tutorProfile?.verificationStatus === 'verified' && <details className="service-management" open>
        <summary>Publicar y administrar mis tutorías</summary>
        <form className="profile-form" onSubmit={submit}>
          <h3>{editing ? 'Editar tutoría' : 'Publicar una tutoría'}</h3>
          <label>Título<input required minLength={5} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Categoría<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categoryOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Descripción<textarea required minLength={20} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Modalidad<select value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value as TeachingModality, travelCost: '' })}>{Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Precio por hora (Q)<input required type="number" min="0" max="1000000" step="0.01" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} /></label>
          {form.modality === 'at_student' && <label>Traslado por sesión (Q)<input required type="number" min="0" max="1000000" step="0.01" value={form.travelCost} onChange={(e) => setForm({ ...form, travelCost: e.target.value })} /><small>Escribe 0 si no cobras traslado. Se suma una vez por sesión.</small></label>}
          <button className="button" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Publicar tutoría'}</button>
          {editing && <button type="button" disabled={busy} onClick={() => { setEditing(undefined); setForm(blank()); }}>Cancelar edición</button>}
        </form>
        <h3>Mis servicios publicados</h3>
        {owned.length === 0 && <p>Aún no has publicado tutorías.</p>}
        {owned.map((service) => <div className="service-owned" key={service._id}><span><strong>{service.title}</strong> · {modes[service.modality]} · {amount(service.hourlyRate)}/hora</span><div><button type="button" disabled={busy} onClick={() => { setEditing(service._id); setForm({ title: service.title, description: service.description, category: service.category, modality: service.modality, hourlyRate: String(service.hourlyRate), travelCost: String(service.travelCost) }); }}>Editar</button><button type="button" disabled={busy} onClick={() => void remove(service)}>Eliminar</button></div></div>)}
      </details>}
      {mode === 'public' && <>
      <div className="service-filters"><label>Categoría<select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">Todas las categorías</option>{categoryOptions.map((value) => <option key={value}>{value}</option>)}</select></label><label>Modalidad<select value={modality} onChange={(e) => { setModality(e.target.value); setPage(1); }}><option value="">Todas las modalidades</option>{Object.entries(modes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      {loading ? <p role="status">Cargando tutorías…</p> : <><p>{total} tutorías disponibles</p><div className="service-grid">{services.map((service) => <article className="service-card" key={service._id}><span className="eyebrow">{service.category}</span><h3>{service.title}</h3><p className="service-author">{service.tutorName}</p><Link className="text-link" to={`/tutorias?tutor=${service.tutorId}`}>Ver perfil y cursos del tutor</Link><p className="service-description">{service.description}</p><p>{modes[service.modality]}</p><strong>{amount(service.hourlyRate)} / hora</strong>{service.modality === 'at_student' && <p>{service.travelCost === 0 ? 'Consulta el costo según la ruta' : `+ ${amount(service.travelCost)} de traslado fijo de referencia; consulta la ruta`}</p>}{account?.role === 'student' && service.modality === 'at_student' && <TravelRoute serviceId={service._id} />}</article>)}</div>{services.length === 0 && !error && <p>No hay tutorías para estos filtros.</p>}</>}
      {pages > 1 && <nav className="tutor-pagination" aria-label="Páginas del catálogo"><button disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {pages}</span><button disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button></nav>}
      </>}
    </div>
  </section>;
}
