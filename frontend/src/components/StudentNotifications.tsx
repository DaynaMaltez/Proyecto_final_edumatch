import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAccessToken, getBookings, getMyEnrollments, getMyProfile, type Booking, type StudentEnrollment } from '../lib/api';

const bookingLabels = { pending: 'Reserva pendiente de aprobación', confirmed: 'Tu reserva fue aprobada', completed: 'Clase completada: ya puedes reseñarla en Mi calendario', rejected: 'Tu reserva fue rechazada', cancelled: 'Reserva cancelada' };
const enrollmentLabels = { pending: 'Inscripción pendiente de aprobación', approved: 'Tu inscripción fue aprobada', rejected: 'Tu inscripción fue rechazada' };

export default function StudentNotifications({ profileOpen }: { profileOpen: boolean }) {
  const [isStudent, setIsStudent] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; let fetching = false;
    async function refresh() {
      if (fetching) return;
      if (!getAccessToken()) { if (active) { setIsStudent(false); setBookings([]); setEnrollments([]); } return; }
      fetching = true; if (active) setLoading(true);
      try {
        const { user } = await getMyProfile();
        if (!active) return;
        setIsStudent(user.role === 'student');
        if (user.role !== 'student') return;
        const [calendar, registrations] = await Promise.all([getBookings(), getMyEnrollments()]);
        if (active) { setBookings(calendar.data); setEnrollments(registrations.data); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las notificaciones.'); }
      finally { fetching = false; if (active) setLoading(false); }
    }
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('calendar-updated', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('calendar-updated', refresh); };
  }, [profileOpen, revision]);
  if (!isStudent) return null;
  return <section id="notificaciones-estudiante" className="section student-notifications"><div className="container">
    <div className="section-heading"><span className="eyebrow">NOTIFICACIONES DEL ESTUDIANTE</span><h2>Estado de mis <span>solicitudes</span></h2><p>Consulta las respuestas de tus catedráticos. Esta sección se actualiza cada 30 segundos.</p></div>
    <button type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? 'Actualizando…' : 'Actualizar notificaciones'}</button>
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}
    <h3>Reservas de sesiones</h3><div className="schedule-grid">{[...bookings].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)).map((booking) => <article key={booking._id} className={`schedule-card calendar-event--${booking.status}`}><strong>{bookingLabels[booking.status]}</strong><span>{booking.serviceTitle ?? 'Tutoría'} · {booking.tutorName ?? 'Catedrático'}</span><span>{booking.date} · {booking.startTime}–{booking.endTime} (Guatemala)</span>{booking.total !== undefined && <span>Q {booking.total.toFixed(2)}</span>}{booking.seriesId && <small>Sesión de una serie recurrente</small>}<Link to="/calendario">Ver mi calendario</Link></article>)}</div>{!loading && !bookings.length && <p>Aún no tienes solicitudes de reserva.</p>}
    <h3>Inscripciones a cursos</h3><div className="schedule-grid">{[...enrollments].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).map((item) => <article key={item._id} className="schedule-card"><strong>{enrollmentLabels[item.status ?? 'pending']}</strong><span>{item.serviceTitle ?? 'Curso'} · {item.tutorName ?? 'Catedrático'}</span><Link to="/tutorias">Explorar cursos del catedrático</Link></article>)}</div>{!loading && !enrollments.length && <p>Aún no tienes solicitudes de inscripción.</p>}
  </div></section>;
}
