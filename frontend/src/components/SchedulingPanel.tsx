import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cancelBooking, changeReservation, getAccessToken, getAvailability, getBookings, getMyProfile, listServices, myServices, previewReservation, publishCourseSlots, removeAvailability, reserveCourse, type Booking, type BookingQuote, type OwnProfile, type ReservationInput, type Slot, type TutoringService } from '../lib/api';
import CalendarView, { localToday, stateLabels } from './CalendarView';
import { useLocation } from 'react-router-dom';
import { getTutorServices } from '../lib/api';
import ClassReviewForm from './ClassReviewForm';
import { getMyReviews, type ClassReview } from '../lib/api';
const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const modes = { virtual: 'Virtual', at_tutor: 'En casa del catedrático', at_student: 'A domicilio', in_person: 'Presencial' };

export default function SchedulingPanel({ profileOpen }: { profileOpen: boolean }) {
  const routeLocation = useLocation();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [courses, setCourses] = useState<TutoringService[]>([]); const [courseId, setCourseId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]); const [bookings, setBookings] = useState<Booking[]>([]);
  const [reviews, setReviews] = useState<ClassReview[]>([]);
  const [form, setForm] = useState({ date: localToday(), startTime: '09:00', endTime: '10:00', bufferMinutes: 30 });
  const [repeat, setRepeat] = useState(false); const [until, setUntil] = useState(''); const [days, setDays] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(''); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState('');
  const [quote, setQuote] = useState<BookingQuote | null>(null); const [date, setDate] = useState(localToday()); const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0); const [coursePage, setCoursePage] = useState(1); const [coursePages, setCoursePages] = useState(1);
  const loadedAccount = useRef('');
  const selectedCourse = courses.find((course) => course._id === courseId);
  useEffect(() => {
    const selected = routeLocation.state?.course as TutoringService | undefined;
    if (!profile || !selected?._id || !selected.tutorId || profile.role !== 'student') return;
    let active = true;
    void getTutorServices(selected.tutorId).then(({ data }) => {
      if (!active) return;
      const course = data.find((item) => item._id === selected._id);
      if (!course) { setError('Este curso ya no está disponible. Busca otra tutoría.'); return; }
      setCourses((current) => [...new Map([...current, course].map((item) => [item._id, item])).values()]);
      setCourseId(course._id); setSelectedSlot(''); setQuote(null); setRepeat(false); setDays([]); setMessage('Selecciona un horario para este curso.');
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo abrir el curso.'); });
    return () => { active = false; };
  }, [routeLocation.key, profile?.id]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('calendar-updated', refresh);
    window.addEventListener('profile-review-updated', refresh);
    return () => { window.removeEventListener('calendar-updated', refresh); window.removeEventListener('profile-review-updated', refresh); };
  }, []);
  useEffect(() => {
    let active = true; setProfile(null); setBookings([]); setError('');
    if (!getAccessToken()) { loadedAccount.current = ''; setCourses([]); setCourseId(''); return; }
    getMyProfile().then(async ({ user }) => {
      if (!active) return; setProfile(user);
      if (loadedAccount.current !== user.id) { loadedAccount.current = user.id; setCourses([]); setCourseId(''); setQuote(null); setRepeat(false); }
      if (user.role !== 'student' && user.role !== 'tutor') return;
      const reserved = await getBookings(); if (active) setBookings(reserved.data);
      if (user.role === 'student') { const ownReviews = await getMyReviews(); if (active) setReviews(ownReviews.data); }
      const result = user.role === 'tutor' ? await myServices() : await listServices('', '', coursePage);
      if (active) { setCourses((current) => user.role === 'tutor' ? result.data : [...new Map([...current, ...result.data].map((course) => [course._id, course])).values()]); if ('totalPages' in result && typeof result.totalPages === 'number') setCoursePages(result.totalPages); }
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el calendario.'); });
    return () => { active = false; };
  }, [profileOpen, revision, coursePage]);
  useEffect(() => {
    function selectCourse(event: Event) { const course = (event as CustomEvent<TutoringService>).detail; setCourses((current) => [...new Map([...current, course].map((item) => [item._id, item])).values()]); setCourseId(course._id); setSelectedSlot(''); setQuote(null); setRepeat(false); setDays([]); setMessage('Selecciona un horario para este curso.'); document.getElementById('reservas')?.scrollIntoView({ behavior: 'smooth' }); }
    window.addEventListener('reserve-course', selectCourse); return () => window.removeEventListener('reserve-course', selectCourse);
  }, []);
  useEffect(() => {
    let active = true; setSlots([]); setSelectedSlot(''); setQuote(null); if (!courseId) return;
    setLoading(true); getAvailability(undefined, courseId).then((result) => { if (active) setSlots(result.data); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar horarios.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, revision]);
  const recurrence = repeat ? { until, weekdays: days } : undefined;
  const reservation: ReservationInput = { slotId: selectedSlot, ...(recurrence ? { recurrence } : {}), ...(latitude !== '' && longitude !== '' ? { latitude: Number(latitude), longitude: Number(longitude) } : {}) };
  async function perform(action: () => Promise<unknown>, success: string) { setBusy(true); setError(''); setMessage(''); try { await action(); setMessage(success); setQuote(null); setRevision((value) => value + 1); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.'); } finally { setBusy(false); } }
  async function publish(event: FormEvent) { event.preventDefault(); await perform(() => publishCourseSlots({ ...form, serviceId: courseId, ...(recurrence ? { recurrence } : {}) }), 'Disponibilidad publicada.'); }
  async function preview(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { setQuote(await previewReservation(reservation)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo calcular el precio.'); } finally { setBusy(false); } }
  function locate() { if (!navigator.geolocation) { setError('Tu navegador no admite ubicación.'); return; } setBusy(true); navigator.geolocation.getCurrentPosition(({ coords }) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)); setQuote(null); setBusy(false); }, () => { setError('No se pudo obtener la ubicación.'); setBusy(false); }, { timeout: 10000 }); }
  const repeatFields = <fieldset disabled={busy} className="calendar-recurrence"><legend>Repetición semanal</legend><label><input type="checkbox" checked={repeat} onChange={(e) => { setRepeat(e.target.checked); setQuote(null); }} />Repetir cada semana</label>{repeat && <><label>Hasta<input required type="date" min={localToday()} value={until} onChange={(e) => { setUntil(e.target.value); setQuote(null); }} /></label><div>{weekdays.map((name, index) => <label key={name}><input type="checkbox" checked={days.includes(index)} onChange={() => { setDays((current) => current.includes(index) ? current.filter((day) => day !== index) : [...current, index]); setQuote(null); }} />{name}</label>)}</div><small>Máximo 52 sesiones en 180 días. Todas las fechas deben estar libres y publicadas.</small></>}</fieldset>;
  return <section className="section scheduling-section" id="reservas"><div className="container">
    <div className="section-heading"><span className="eyebrow">RESERVAS Y CALENDARIO</span><h2>Mi <span>calendario</span></h2><p>Reserva sesiones de un curso o administra tu disponibilidad. Horarios de Guatemala.</p></div>
    {error && <p role="alert" className="profile-message profile-message--error">{error}</p>}{message && <p role="status" className="profile-message">{message}</p>}
    {!profile && <p>Inicia sesión para consultar tu calendario y reservar tutorías.</p>}{profile && !profile.role && <p>Completa tu perfil para usar el calendario.</p>}
    {profile && (profile.role === 'student' || profile.role === 'tutor') && <>
      <label className="schedule-tutor">{profile.role === 'tutor' ? 'Curso para publicar horarios' : 'Curso para reservar'}<select value={courseId} disabled={busy} onChange={(e) => { setCourseId(e.target.value); setQuote(null); setRepeat(false); }}><option value="">Selecciona un curso</option>{courses.map((course) => <option key={course._id} value={course._id}>{course.title}{course.tutorName ? ` · ${course.tutorName}` : ''}</option>)}</select></label>
      {profile.role === 'student' && coursePage < coursePages && <button type="button" disabled={busy} onClick={() => setCoursePage(coursePage + 1)}>Cargar más cursos</button>}
      {profile.role === 'tutor' && !courses.length && <p>Publica un curso en el catálogo para agregar horarios.</p>}
      {profile.role === 'tutor' && profile.tutorProfile?.verificationStatus === 'verified' && selectedCourse && <form className="schedule-form" onSubmit={publish}><h3>Publicar horarios de {selectedCourse.title}</h3><label>Fecha inicial<input required type="date" min={localToday()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Desde<input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label><label>Hasta<input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label><p>{modes[selectedCourse.modality]}</p>{selectedCourse.modality === 'at_student' && <label>Margen de traslado (minutos)<input disabled={busy} required type="number" min="0" max="180" value={form.bufferMinutes} onChange={(e) => setForm({ ...form, bufferMinutes: Number(e.target.value) })} /><small>Se bloquea este margen entre reservas del catedrático.</small></label>}{repeatFields}<button className="button" disabled={busy}>{busy ? 'Publicando…' : 'Publicar disponibilidad'}</button></form>}
      {loading && <p role="status">Cargando horarios…</p>}
      {profile.role === 'student' && selectedCourse && <form className="schedule-form" onSubmit={preview}><h3>Reservar: {selectedCourse.title}</h3><label>Horario<select required disabled={busy} value={selectedSlot} onChange={(e) => { setSelectedSlot(e.target.value); setQuote(null); }}><option value="">Selecciona fecha y hora</option>{slots.map((slot) => <option key={slot._id} value={slot._id} disabled={!slot.available}>{slot.date} · {slot.startTime}–{slot.endTime}{!slot.available ? ' · Ocupado' : ''}</option>)}</select></label><p>Q {selectedCourse.hourlyRate.toFixed(2)} por hora · {modes[selectedCourse.modality]}</p>{selectedCourse.modality === 'at_student' && <fieldset><legend>Lugar de la clase</legend><button type="button" disabled={busy} onClick={locate}>Usar mi ubicación</button><label>Latitud<input disabled={busy} required type="number" min="-90" max="90" step="any" value={latitude} onChange={(e) => { setLatitude(e.target.value); setQuote(null); }} /></label><label>Longitud<input disabled={busy} required type="number" min="-180" max="180" step="any" value={longitude} onChange={(e) => { setLongitude(e.target.value); setQuote(null); }} /></label></fieldset>}{repeatFields}<button className="button" disabled={busy || !selectedSlot}>{busy ? 'Calculando…' : 'Revisar precio'}</button>
        {quote && <div className="booking-quote"><h4>Resumen antes de reservar</h4><p>{quote.dates.length} sesión(es) · Q {quote.hourlyRate.toFixed(2)} por hora · Q {quote.travelCost.toFixed(2)} de traslado por sesión.</p><p>Q {quote.sessionTotal.toFixed(2)} por sesión · <strong>Total: Q {quote.total.toFixed(2)}</strong></p><details><summary>Ver fechas</summary><ul>{quote.dates.map((day) => <li key={day}>{day}</li>)}</ul></details><p>La solicitud queda pendiente de confirmación del catedrático y bloquea el horario. No se realiza un cobro en línea.</p><button type="button" className="button" disabled={busy} onClick={() => void perform(() => reserveCourse({ ...reservation, expectedTotal: quote.total }), 'Solicitud enviada. Puedes consultarla en el calendario.')}>Confirmar solicitud de reserva</button></div>}
      </form>}
      {selectedCourse && !loading && !slots.length && <p>Este curso no tiene horarios publicados disponibles.</p>}
      {profile.role === 'tutor' && <div className="schedule-grid">{slots.map((slot) => <article className="schedule-card" key={slot._id}><strong>{slot.date} · {slot.startTime}–{slot.endTime}</strong><span>{slot.serviceTitle} · {slot.available ? 'Disponible' : 'Reservado'}</span><button type="button" disabled={busy || !slot.available} onClick={() => void perform(() => removeAvailability(slot._id), 'Horario eliminado.')}>Eliminar horario</button></article>)}</div>}
      <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Actualizar calendario</button>
      <CalendarView bookings={bookings} date={date} view={view} onDate={setDate} onView={setView} />
      <h3>Reservas del {date}</h3><div className="schedule-grid">{bookings.filter((booking) => booking.date === date).map((booking) => <article className="schedule-card" key={booking._id}><strong>{booking.serviceTitle ?? 'Tutoría'} · {booking.startTime}–{booking.endTime}</strong><span>{profile.role === 'tutor' ? booking.studentName : booking.tutorName}</span><span>{stateLabels[booking.status]} · {modes[booking.modality]}</span>{booking.total !== undefined && <span>Q {booking.total.toFixed(2)} por sesión</span>}{booking.seriesId && <small>Sesión de una serie semanal</small>}{booking.destination && <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${booking.destination.latitude}&mlon=${booking.destination.longitude}#map=16/${booking.destination.latitude}/${booking.destination.longitude}`}>Ver lugar de la clase en el mapa</a>}
        {!booking.legacy && profile.role === 'tutor' && booking.status === 'confirmed' && new Date(`${booking.date}T${booking.endTime}:00-06:00`).getTime() <= Date.now() && <button type="button" disabled={busy} onClick={() => void perform(() => changeReservation(booking._id, 'complete'), 'Clase completada. El estudiante ya puede publicar su reseña.')}>Marcar clase completada</button>}
        {!booking.legacy && profile.role === 'student' && booking.status === 'completed' && <ClassReviewForm key={booking._id} bookingId={booking._id} existing={reviews.find((review) => review.bookingId === booking._id)} onSaved={(review) => { setReviews((current) => [...current.filter((item) => item.bookingId !== booking._id), review]); setMessage('Reseña publicada. El promedio del tutor se actualizó.'); }} />}
        {!booking.legacy && profile.role === 'tutor' && booking.status === 'pending' && <><button type="button" disabled={busy} onClick={() => void perform(() => changeReservation(booking._id, 'confirm'), 'Reserva confirmada.')}>Aceptar</button><button type="button" disabled={busy} onClick={() => void perform(() => changeReservation(booking._id, 'reject'), 'Solicitud rechazada.')}>Rechazar</button>{booking.seriesId && <button type="button" disabled={busy} onClick={() => void perform(() => changeReservation(booking._id, 'confirm', true), 'Serie confirmada.')}>Aceptar toda la serie pendiente</button>}</>}
        {['pending', 'confirmed'].includes(booking.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm('¿Cancelar esta sesión?')) void perform(() => booking.legacy ? cancelBooking(booking._id) : changeReservation(booking._id, 'cancel'), 'Reserva cancelada.'); }}>Cancelar sesión</button>}
        {booking.seriesId && ['pending', 'confirmed'].includes(booking.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm('¿Cancelar todas las sesiones activas de esta serie?')) void perform(() => changeReservation(booking._id, 'cancel', true), 'Serie cancelada.'); }}>Cancelar serie</button>}
      </article>)}</div>{!bookings.some((booking) => booking.date === date) && <p>No tienes reservas ese día.</p>}
    </>}
  </div></section>;
}
