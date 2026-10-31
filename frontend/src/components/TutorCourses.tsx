import { useEffect, useState } from 'react';
import TravelRoute from './TravelRoute';

import { enrollInService, getAccessToken, getMyEnrollments, getMyProfile, getTutorServices, type OwnProfile, type TeachingModality, type TutoringService } from '../lib/api';

const modalities: Record<TeachingModality, string> = { virtual: 'Virtual', at_tutor: 'En casa del catedrático', at_student: 'A domicilio' };

export default function TutorCourses({ tutorId, onLogin }: { tutorId: string; onLogin: () => void }) {
  const [courses, setCourses] = useState<TutoringService[]>([]);
  const [account, setAccount] = useState<OwnProfile | null>(null);
  const [enrolled, setEnrolled] = useState<string[]>([]);
  const [registrationStatus, setRegistrationStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let active = true;
    setCourses([]); setAccount(null); setEnrolled([]); setLoading(true); setError(''); setMessage(''); setSessionReady(false);
    getTutorServices(tutorId).then((result) => { if (active) setCourses(result.data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los cursos.'); })
      .finally(() => { if (active) setLoading(false); });
    async function loadSession() {
      if (!getAccessToken()) { if (active) setSessionReady(true); return; }
      try {
        const { user } = await getMyProfile();
        const registrations = user.role === 'student' ? (await getMyEnrollments()).data : [];
        if (active) { setAccount(user); setEnrolled(registrations.map((item) => item.serviceId)); setRegistrationStatus(Object.fromEntries(registrations.map((item) => [item.serviceId, item.status ?? 'pending']))); setSessionReady(true); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo comprobar tu sesión.'); }
    }
    void loadSession();
    return () => { active = false; };
  }, [tutorId]);

  async function enroll(id: string) {
    setBusy(id); setError(''); setMessage('');
    try {
      await enrollInService(id);
      setEnrolled((current) => [...new Set([...current, id])]);
      setRegistrationStatus((current) => ({ ...current, [id]: 'pending' }));
      setMessage('Solicitud enviada al catedrático para su aprobación. No reserva un horario ni realiza un pago.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la inscripción.'); }
    finally { setBusy(null); }
  }

  return <section aria-labelledby="tutor-courses-title" className="tutor-courses">
    <h3 id="tutor-courses-title">Cursos de este catedrático</h3>
    {loading && <p role="status">Cargando cursos…</p>}
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}
    {message && <p role="status" className="profile-message">{message}</p>}
    {!loading && !error && courses.length === 0 && <p>Este catedrático aún no ha publicado cursos.</p>}
    <div className="service-grid">{courses.map((course) => <article className="service-card" key={course._id}>
      <span className="eyebrow">{course.category}</span><h4>{course.title}</h4>
      <p className="service-description">{course.description}</p><p>{modalities[course.modality]}</p>
      <strong>Q {course.hourlyRate.toFixed(2)} / hora</strong>
      {account?.role === 'student' && <button className="button button--small" type="button" onClick={() => window.dispatchEvent(new CustomEvent('reserve-course', { detail: course }))}>Reservar sesión</button>}
      {account?.role === 'student' && course.modality === 'at_student' && <TravelRoute serviceId={course._id} />}
      {course.modality === 'at_student' && <p>Calcula la movilización para conocer el costo según tu ubicación.</p>}
      {sessionReady && account?.role === 'student' && <button className="button button--small" type="button" disabled={busy !== null || enrolled.includes(course._id)} onClick={() => void enroll(course._id)}>{enrolled.includes(course._id) ? (registrationStatus[course._id] === 'approved' ? 'Inscripción aprobada' : registrationStatus[course._id] === 'rejected' ? 'Inscripción rechazada' : 'Solicitud pendiente') : busy === course._id ? 'Inscribiendo…' : 'Inscribirme'}</button>}
      {sessionReady && !account && <button className="button button--small" type="button" onClick={onLogin}>Inicia sesión como alumno para inscribirte</button>}
      {sessionReady && account && !account.role && <p>Completa tu registro como estudiante para inscribirte.</p>}
    </article>)}</div>
  </section>;
}
