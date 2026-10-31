import { useEffect, useState } from 'react';
import { changeReservation, decideEnrollment, getAccessToken, getBookings, getEnrollmentRequests, getMyProfile, type Booking, type EnrollmentRequest, type OwnProfile } from '../lib/api';

export default function TutorRequests({ profileOpen }: { profileOpen: boolean }) {
  const [isTutor, setIsTutor] = useState(false);
  const [tutorProfile, setTutorProfile] = useState<OwnProfile['tutorProfile']>();
  const [enrollments, setEnrollments] = useState<EnrollmentRequest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; let fetching = false; let refreshAgain = false;
    async function refresh() {
      if (fetching) { refreshAgain = true; return; }
      if (!getAccessToken()) { if (active) setIsTutor(false); return; }
      fetching = true;
      try {
        const { user } = await getMyProfile();
        if (!active) return;
        setIsTutor(user.role === 'tutor');
        setTutorProfile(user.tutorProfile);
        if (user.role !== 'tutor') return;
        const [requests, calendar] = await Promise.all([getEnrollmentRequests(), getBookings()]);
        if (active) { setEnrollments(requests.data); setBookings(calendar.data.filter((booking) => !booking.legacy && booking.status === 'pending' && new Date(`${booking.date}T${booking.startTime}:00-06:00`).getTime() > Date.now())); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las solicitudes.'); }
      finally { fetching = false; if (refreshAgain && active) { refreshAgain = false; void refresh(); } }
    }
    void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('calendar-updated', refresh); window.addEventListener('profile-review-updated', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('calendar-updated', refresh); window.removeEventListener('profile-review-updated', refresh); };
  }, [profileOpen, revision]);
  async function decide(action: () => Promise<unknown>, text: string) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); setMessage(text); setRevision((value) => value + 1); window.dispatchEvent(new Event('calendar-updated')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la solicitud.'); }
    finally { setBusy(false); }
  }
  if (!isTutor) return null;
  return <section id="solicitudes" className="section tutor-requests"><div className="container">
    <div className="section-heading"><span className="eyebrow">NOTIFICACIONES DEL CATEDRÁTICO</span><h2>Solicitudes <span>pendientes ({enrollments.length + bookings.length})</span></h2><p>Revisa las inscripciones a tus cursos y las solicitudes de reserva. Se actualiza cada 30 segundos.</p></div>
    <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Actualizar solicitudes</button>
    <div className="class-review" role="status" aria-live="polite">
      <h3>Revisión administrativa de tu perfil</h3>
      {tutorProfile?.verificationStatus === 'rejected' ? <><strong>Tu solicitud de catedrático fue rechazada.</strong><p>Motivo: {tutorProfile.reviewNote || 'Revisa y completa la información de tu perfil.'}</p><p>Corrige los datos en Mi perfil, guarda los cambios y pulsa «Solicitar nueva revisión».</p></> : tutorProfile?.verificationStatus === 'verified' ? <><strong>Tu perfil de catedrático fue aprobado.</strong><p>Ya puedes publicar cursos y horarios.</p>{tutorProfile.reviewNote && <p>Observaciones: {tutorProfile.reviewNote}</p>}</> : <p>Tu solicitud está pendiente de revisión por el administrador.</p>}
      {tutorProfile?.reviewedAt && tutorProfile.verificationStatus !== 'pending' && <small>{new Date(tutorProfile.reviewedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</small>}
    </div>
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}{message && <p role="status" className="profile-message">{message}</p>}
    <h3>Inscripciones a cursos ({enrollments.length})</h3><div className="schedule-grid">{enrollments.map((item) => <article key={item._id} className="schedule-card"><strong>{item.studentName} solicita inscribirse</strong><span>{item.serviceTitle}</span><small>{new Date(item.createdAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</small><button type="button" disabled={busy} onClick={() => void decide(() => decideEnrollment(item._id, 'approved'), 'Inscripción aprobada.')}>Aprobar inscripción</button><button type="button" disabled={busy} onClick={() => void decide(() => decideEnrollment(item._id, 'rejected'), 'Inscripción rechazada.')}>Rechazar</button></article>)}</div>{!enrollments.length && <p>No tienes inscripciones pendientes.</p>}
    <h3>Reservas de sesiones ({bookings.length})</h3><div className="schedule-grid">{bookings.map((item) => <article key={item._id} className="schedule-card"><strong>{item.studentName} solicita una sesión</strong><span>{item.serviceTitle}</span><span>{item.date} · {item.startTime}–{item.endTime} (Guatemala)</span>{item.total !== undefined && <span>Q {item.total.toFixed(2)}</span>}<button type="button" disabled={busy} onClick={() => void decide(() => changeReservation(item._id, 'confirm'), 'Reserva aprobada.')}>Aprobar reserva</button><button type="button" disabled={busy} onClick={() => void decide(() => changeReservation(item._id, 'reject'), 'Reserva rechazada.')}>Rechazar</button>{item.seriesId && <button type="button" disabled={busy} onClick={() => void decide(() => changeReservation(item._id, 'confirm', true), 'Serie de reservas aprobada.')}>Aprobar toda la serie pendiente</button>}</article>)}</div>{!bookings.length && <p>No tienes reservas pendientes.</p>}
  </div></section>;
}
