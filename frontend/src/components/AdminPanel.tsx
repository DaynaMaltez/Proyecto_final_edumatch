import { useEffect, useState } from 'react';
import { getAccessToken, getMyProfile, listAdminTutors, reviewTutor, type AdminTutor } from '../lib/api';

export default function AdminPanel({ profileOpen }: { profileOpen: boolean }) {
  const [admin, setAdmin] = useState(false); const [status, setStatus] = useState('pending'); const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminTutor[]>([]); const [total, setTotal] = useState(0); const [pages, setPages] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    if (!getAccessToken()) { setAdmin(false); return; }
    setLoading(true);
    getMyProfile().then(async ({ user }) => {
      if (!active) return; setAdmin(user.role === 'admin'); if (user.role !== 'admin') return;
      const result = await listAdminTutors(status, page);
      if (active) { if (page > Math.max(1, result.totalPages)) { setPage(Math.max(1, result.totalPages)); return; } setItems(result.data); setTotal(result.total); setPages(result.totalPages); }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las solicitudes.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profileOpen, status, page, revision]);
  async function decide(tutor: AdminTutor, decision: 'verified' | 'rejected') {
    const note = notes[tutor._id] ?? '';
    if (decision === 'rejected' && !note.trim()) { setError('Indica el motivo del rechazo para que el catedrático pueda corregir su perfil.'); return; }
    setBusy(true); setError(''); setMessage('');
    try { await reviewTutor(tutor._id, decision, note); setMessage(`${tutor.fullName}: ${decision === 'verified' ? 'perfil aprobado' : 'solicitud rechazada'}.`); setRevision((value) => value + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la revisión.'); }
    finally { setBusy(false); }
  }
  if (!admin) return null;
  return <section id="administracion" className="section admin-panel"><div className="container">
    <div className="section-heading"><span className="eyebrow">ADMINISTRACIÓN</span><h2>Revisión de <span>catedráticos</span></h2><p>Aprueba los perfiles para habilitar sus cursos, horarios y reservas en el catálogo público.</p></div>
    <div className="calendar-toolbar"><label>Estado<select value={status} disabled={busy} onChange={(e) => { setStatus(e.target.value); setPage(1); setMessage(''); }}>{[['pending', 'Pendientes'], ['verified', 'Aprobados'], ['rejected', 'Rechazados']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>Actualizar</button><span>{total} perfiles</span></div>
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}{message && <p role="status" className="profile-message">{message}</p>}
    {loading ? <p role="status">Cargando perfiles…</p> : <div className="service-grid">{items.map((tutor) => <article className="service-card" key={tutor._id}>
      <h3>{tutor.fullName}</h3><p>{tutor.email}</p><p>{tutor.tutorProfile.biography}</p><p>Especialidades: {tutor.tutorProfile.specialties.join(' · ')}</p><p>Tarifa: Q {tutor.tutorProfile.hourlyRate.toFixed(2)} por hora</p><p>Modalidades: {tutor.tutorProfile.teachingModalities.map((value) => ({ virtual: 'Virtual', at_tutor: 'En casa del catedrático', at_student: 'A domicilio' })[value]).join(' · ')}</p>
      <h4>Credenciales</h4>{!tutor.tutorProfile.credentials.length && <p>Sin credenciales adjuntas.</p>}<ul>{tutor.tutorProfile.credentials.map((credential, index) => <li key={index}>{credential.title}{credential.institution ? ` · ${credential.institution}` : ''}{credential.description && <p>{credential.description}</p>}{credential.evidenceUrl?.startsWith('https://') && <a href={credential.evidenceUrl} target="_blank" rel="noreferrer">Ver evidencia</a>}</li>)}</ul>
      {!!tutor.tutorProfile.professionalExperience.length && <><h4>Experiencia</h4><ul>{tutor.tutorProfile.professionalExperience.map((experience, index) => <li key={index}>{experience.position} · {experience.organization}</li>)}</ul></>}
      {tutor.tutorProfile.reviewNote && <p>Observaciones: {tutor.tutorProfile.reviewNote}</p>}
      {status === 'pending' && <div className="admin-review"><label>Observaciones (obligatorias al rechazar)<textarea maxLength={1000} value={notes[tutor._id] ?? ''} disabled={busy} onChange={(e) => setNotes((current) => ({ ...current, [tutor._id]: e.target.value }))} /></label><button className="button" type="button" disabled={busy} onClick={() => void decide(tutor, 'verified')}>Aprobar catedrático</button><button type="button" disabled={busy} onClick={() => void decide(tutor, 'rejected')}>Rechazar solicitud</button></div>}
    </article>)}</div>}
    {!loading && !items.length && <p>No hay catedráticos con este estado.</p>}{pages > 1 && <nav className="tutor-pagination" aria-label="Páginas de revisión"><button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Anterior</button><span>{page} de {pages}</span><button disabled={page >= pages || busy} onClick={() => setPage(page + 1)}>Siguiente</button></nav>}
  </div></section>;
}
