import { useEffect, useState } from 'react';
import CategoryAdmin from './CategoryAdmin';
import { getAccessToken, getMyProfile, getBookings, getConversations, getAnalytics, moderationRequest, type OwnProfile, type ConductReport, type Appeal, type ModeratedUser, type AdminAnalytics, type TutorRank } from '../lib/api';

const reasons: Record<string, string> = { absence: 'Inasistencia', conduct: 'Conducta inapropiada', charges: 'Cobros indebidos', other: 'Otro motivo' };
const states: Record<string, string> = { open: 'Abierta', dismissed: 'Desestimada', actioned: 'Atendida', pending: 'Pendiente', accepted: 'Aceptada', rejected: 'Rechazada', completed: 'Impartidas', cancelled: 'Canceladas', confirmed: 'Confirmadas' };
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : 'No se pudo completar la operación.';
export default function ModerationPanel({ profileOpen, mode = 'moderation' }: { profileOpen: boolean; mode?: 'moderation' | 'analytics' | 'categories' }) {
  const [user, setUser] = useState<OwnProfile>(); const [peers, setPeers] = useState<{ id: string; name: string }[]>([]);
  const [targetId, setTargetId] = useState(''); const [reason, setReason] = useState('conduct'); const [evidence, setEvidence] = useState('');
  const [reports, setReports] = useState<ConductReport[]>([]); const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [reportStatus, setReportStatus] = useState('open'); const [appealStatus, setAppealStatus] = useState('pending');
  const [historyId, setHistoryId] = useState(''); const [query, setQuery] = useState(''); const [users, setUsers] = useState<ModeratedUser[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({}); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [revision, setRevision] = useState(0);
  const [month, setMonth] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit' }).format(new Date()));
  const [analytics, setAnalytics] = useState<AdminAnalytics>();
  const [selectedRank, setSelectedRank] = useState<TutorRank>();
  const [reviewList, setReviewList] = useState<{ studentName: string; rating: number; comment: string; serviceTitle: string }[]>([]);
  useEffect(() => {
    let active = true;
    if (!getAccessToken()) { setUser(undefined); return; }
    setLoading(true); setError('');
    void (async () => {
      const { user: account } = await getMyProfile(); if (!active) return; setUser(account);
      if (account.role === 'admin') {
        if (mode === 'analytics') { const result = await getAnalytics(month); if (active) setAnalytics(result); }
        else if (mode === 'moderation') {
          const results = await Promise.all([
            moderationRequest<{ data: ConductReport[] }>(`/reports?status=${historyId ? 'all' : reportStatus}${historyId ? `&targetId=${historyId}` : ''}`),
            moderationRequest<{ data: Appeal[] }>(`/appeals?status=${appealStatus}`),
          ]);
          if (active) { setReports(results[0].data); setAppeals(results[1].data); }
        }
      } else if (account.role === 'student' || account.role === 'tutor') {
        const [bookings, conversations, ownReports] = await Promise.all([getBookings(), getConversations(), moderationRequest<{ data: ConductReport[] }>('/reports/me')]);
        const candidates = new Map<string, string>();
        for (const item of bookings.data) candidates.set(account.role === 'student' ? item.tutorId : item.studentId, (account.role === 'student' ? item.tutorName : item.studentName) || 'Participante de tutoría');
        for (const item of conversations.data) candidates.set(item.peerId, item.peerName);
        if (active) { setPeers([...candidates].map(([id, name]) => ({ id, name }))); setReports(ownReports.data); }
      }
    })().catch((cause) => { if (active) setError(messageOf(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profileOpen, revision, reportStatus, appealStatus, historyId, month, mode]);
  async function run(operation: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setSuccess('');
    try { await operation(); setSuccess(message); setRevision((value) => value + 1); } catch (cause) { setError(messageOf(cause)); } finally { setBusy(false); }
  }
  if (!user?.role) return null;
  const admin = user.role === 'admin';
  return <section id="moderacion" className="section moderation-panel"><div className="container"><div className="section-heading"><span className="eyebrow">CONVIVENCIA Y SEGURIDAD</span><h2>{admin ? (mode === 'analytics' ? 'Estadísticas de la plataforma' : mode === 'categories' ? 'Catálogo académico' : 'Centro de moderación') : 'Reportar un problema'}</h2><p>{admin ? (mode === 'analytics' ? 'Consulta la actividad y las valoraciones registradas en la plataforma.' : mode === 'categories' ? 'Administra las categorías y subcategorías disponibles para los cursos.' : 'Revisa evidencia, consulta el historial y resuelve las apelaciones de las cuentas suspendidas.') : 'Reporta problemas con participantes de tus reservas o conversaciones. La administración revisará la evidencia.'}</p></div>
    <button disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>Actualizar</button>
    {loading && <p role="status">Cargando…</p>}{error && <p role="alert" className="profile-message profile-message--error">{error}</p>}{success && <p role="status" className="profile-message">{success}</p>}
    {!admin ? <><form className="moderation-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await moderationRequest('/reports', { targetId, reason, evidence }); setEvidence(''); }, 'Denuncia enviada. Puedes consultar aquí su resolución.'); }}>
      <label>Usuario<select required value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Selecciona un participante</option>{peers.map((peer) => <option key={peer.id} value={peer.id}>{peer.name}</option>)}</select></label>
      {!peers.length && <p>Aparecerán los usuarios con los que tengas una reserva o conversación.</p>}
      <label>Motivo<select value={reason} onChange={(event) => setReason(event.target.value)}>{Object.entries(reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Descripción y evidencia textual<textarea required minLength={10} maxLength={4000} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Describe lo ocurrido, fecha de la clase y mensajes relevantes. No incluyas contraseñas ni datos sensibles." /></label><button className="button" disabled={busy || !targetId}>Enviar denuncia</button>
    </form><h3>Mis denuncias</h3>{!reports.length && <p>No has presentado denuncias.</p>}{reports.map((report) => <article className="service-card" key={report._id}><h4>{report.targetId?.fullName ?? 'Usuario no disponible'}</h4><p>{reasons[report.reason]} · {states[report.status]}</p><p>{report.evidence}</p>{report.decision && <p>Resolución: {report.decision}</p>}</article>)}</> : <>
      {mode === 'moderation' && <>
      <h3>Usuarios e historial</h3><form className="calendar-toolbar" onSubmit={(event) => { event.preventDefault(); void run(async () => { const result = await moderationRequest<{ data: ModeratedUser[] }>(`/users?q=${encodeURIComponent(query)}`); setUsers(result.data); }, 'Búsqueda completada.'); }}><label>Nombre o correo<input required minLength={2} maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} /></label><button disabled={busy}>Buscar usuario</button></form>
      <div className="service-grid">{users.map((account) => <article className="service-card" key={account._id}><h4>{account.fullName}</h4><p>{account.email}</p><p>{account.role === 'tutor' ? 'Catedrático' : 'Estudiante'} · {account.accountStatus === 'active' ? 'Activa' : 'Suspendida'}</p><button onClick={() => setHistoryId(account._id)}>Ver historial de denuncias</button>{account.accountStatus === 'active' && <><label>Motivo del bloqueo<textarea maxLength={2000} value={notes[account._id] ?? ''} onChange={(event) => setNotes({ ...notes, [account._id]: event.target.value })} /></label><button disabled={busy} onClick={() => void run(async () => { await moderationRequest(`/users/${account._id}/suspend`, { reason: notes[account._id] }, 'PATCH'); setUsers((current) => current.map((item) => item._id === account._id ? { ...item, accountStatus: 'suspended' } : item)); }, 'Cuenta suspendida. El usuario podrá apelar.')}>Suspender cuenta</button></>}</article>)}</div>
      <h3>{historyId ? 'Historial de denuncias del usuario' : 'Bandeja de denuncias'}</h3>{historyId ? <button onClick={() => setHistoryId('')}>Volver a la bandeja</button> : <label>Estado<select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>{['open', 'dismissed', 'actioned', 'all'].map((value) => <option key={value} value={value}>{states[value] ?? 'Todas'}</option>)}</select></label>}
      {!reports.length && <p>No hay denuncias con este filtro.</p>}<div className="service-grid">{reports.map((report) => <article className="service-card" key={report._id}><h4>{reasons[report.reason]} · {states[report.status]}</h4><p>Reporta: {report.reporterId?.fullName ?? 'Usuario no disponible'}</p><p>Reportado: {report.targetId?.fullName ?? 'Usuario no disponible'}</p><p>{new Date(report.createdAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</p><p className="preserve-text">{report.evidence}</p>{report.targetId && <button onClick={() => { setHistoryId(report.targetId!._id); setQuery(report.targetId!.email); }}>Ver historial</button>}{report.decision && <p>Resolución: {report.decision}</p>}{report.status === 'open' && <><label>Justificación<textarea maxLength={2000} value={notes[report._id] ?? ''} onChange={(event) => setNotes({ ...notes, [report._id]: event.target.value })} /></label><button disabled={busy} onClick={() => void run(() => moderationRequest(`/reports/${report._id}`, { status: 'dismissed', decision: notes[report._id] }, 'PATCH'), 'Denuncia desestimada.')}>Desestimar</button><button disabled={busy} onClick={() => void run(() => moderationRequest(`/reports/${report._id}`, { status: 'actioned', decision: notes[report._id] }, 'PATCH'), 'Denuncia atendida.')}>Marcar atendida</button>{report.targetId?.accountStatus === 'active' && <button disabled={busy} onClick={() => void run(() => moderationRequest(`/users/${report.targetId!._id}/suspend`, { reason: notes[report._id] }, 'PATCH'), 'Cuenta suspendida. Registra también la resolución de la denuncia.')}>Suspender por este motivo</button>}</>}</article>)}</div>
      <h3>Apelaciones</h3><label>Estado<select value={appealStatus} onChange={(event) => setAppealStatus(event.target.value)}>{['pending', 'accepted', 'rejected'].map((value) => <option key={value} value={value}>{states[value]}</option>)}</select></label>
      {!appeals.length && <p>No hay apelaciones con este estado.</p>}<div className="service-grid">{appeals.map((appeal) => <article className="service-card" key={appeal._id}><h4>{appeal.userId?.fullName ?? 'Usuario no disponible'}</h4><p>{appeal.userId?.email}</p><p>Motivo de suspensión: {appeal.suspensionReason}</p><p className="preserve-text">{appeal.statement}</p>{appeal.decision && <p>Resolución: {appeal.decision}</p>}{['pending', 'rejected'].includes(appeal.status) && <><label>Justificación<textarea maxLength={2000} value={notes[appeal._id] ?? ''} onChange={(event) => setNotes({ ...notes, [appeal._id]: event.target.value })} /></label><button disabled={busy} onClick={() => void run(() => moderationRequest(`/appeals/${appeal._id}`, { status: 'accepted', decision: notes[appeal._id] }, 'PATCH'), 'Apelación aceptada. Cuenta reactivada.')}>Aceptar y reactivar</button><button disabled={busy || appeal.status === 'rejected'} onClick={() => void run(() => moderationRequest(`/appeals/${appeal._id}`, { status: 'rejected', decision: notes[appeal._id] }, 'PATCH'), 'Apelación rechazada. La cuenta permanece suspendida.')}>Rechazar apelación</button></>}</article>)}</div>
      </>}
      {mode === 'categories' && <CategoryAdmin />}
      {mode === 'analytics' && <>
      <h3>Estadísticas</h3><label>Mes de las clases<input type="month" min="2000-01" max="2100-12" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></label>
      {analytics && <><div className="analytics-summary"><p>Denuncias abiertas: <strong>{analytics.openReports}</strong></p><p>Apelaciones pendientes: <strong>{analytics.pendingAppeals}</strong></p>{analytics.users.map((entry) => <p key={entry._id}>Cuentas {entry._id === 'active' ? 'activas' : 'suspendidas'}: <strong>{entry.count}</strong></p>)}</div><h4>Estado de las clases del mes</h4><BarChart values={['completed', 'cancelled', 'confirmed', 'pending', 'rejected'].map((status) => ({ label: states[status] ?? status, value: analytics.statuses.find((entry) => entry._id === status)?.count ?? 0 }))} unit="clases" /><h4>Demanda por categoría</h4><p>Horas de clases confirmadas o impartidas del mes seleccionado. No incluye pendientes, canceladas ni rechazadas.</p><BarChart values={analytics.demand.map((entry) => ({ label: entry._id, value: entry.hours }))} unit="horas" /><p>Los rankings usan todas las reseñas de clases completadas. Se muestra la cantidad de valoraciones para interpretar cada promedio.</p><div className="service-grid">{[['Mejor calificados', analytics.best], ['Menor calificación', analytics.worst]].map(([label, entries]) => <article className="service-card" key={String(label)}><h4>{String(label)}</h4>{!(entries as TutorRank[]).length && <p>Aún no hay reseñas.</p>}<ol>{(entries as TutorRank[]).map((entry) => <li key={entry._id}>{entry.fullName}: {entry.average.toFixed(2)} ★ ({entry.count}) <button onClick={() => void run(async () => { const result = await moderationRequest<{ data: typeof reviewList }>(`/reviews/${entry._id}`); setSelectedRank(entry); setReviewList(result.data); }, 'Reseñas cargadas.')}>Ver reseñas</button></li>)}</ol></article>)}</div>{selectedRank && <article className="service-card"><h4>Reseñas de {selectedRank.fullName}</h4><button onClick={() => setSelectedRank(undefined)}>Cerrar reseñas</button>{reviewList.map((review, index) => <blockquote key={index}><p>{review.rating} ★ · {review.serviceTitle} · {review.studentName}</p><p>{review.comment}</p></blockquote>)}</article>}</>}
      </>}
    </>}
  </div></section>;
}
function BarChart({ values, unit }: { values: { label: string; value: number }[]; unit: string }) {
  const max = Math.max(1, ...values.map((item) => item.value));
  return <div className="analytics-bars" role="list" aria-label={`Gráfico en ${unit}`}>{!values.length && <p>Sin datos para este período.</p>}{values.map((item) => <div role="listitem" key={item.label}><span>{item.label}</span><div className="analytics-track"><div style={{ width: `${item.value / max * 100}%` }} /></div><strong>{Number(item.value.toFixed(2))} {unit}</strong></div>)}</div>;
}
