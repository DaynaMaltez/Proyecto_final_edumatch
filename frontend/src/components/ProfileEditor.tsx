import { Link } from 'react-router-dom';
import ProfileLocationMap from './ProfileLocationMap';
import type { PersonalDetails } from '../lib/api';
import { useEffect, useState, type FormEvent } from 'react';
import { resubmitTutor } from '../lib/api';
import { getMyProfile, updateMyProfile, completeOnboarding, type OwnProfile, type TeachingModality } from '../lib/api';

type ProfileEditorProps = { onClose: () => void };
type CredentialDraft = { title: string; institution: string; description: string; evidenceUrl: string; verified: boolean };
type ExperienceDraft = { organization: string; position: string; description: string; startDate: string; endDate: string };

function blankCredential(): CredentialDraft { return { title: '', institution: '', description: '', evidenceUrl: '', verified: false }; }
function blankExperience(): ExperienceDraft { return { organization: '', position: '', description: '', startDate: '', endDate: '' }; }

function lines(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export default function ProfileEditor({ onClose }: ProfileEditorProps) {
  const [user, setUser] = useState<OwnProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<'student' | 'tutor' | null>(null);
  const needsOnboarding = user !== null && user.onboardingCompleted === false && !user.role;
  const effectiveRole = needsOnboarding ? selectedRole : user?.role;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [phone, setPhone] = useState(''); const [gender, setGender] = useState<PersonalDetails['gender'] | ''>('');
  const [documentType, setDocumentType] = useState<PersonalDetails['documentType']>('dpi'); const [documentNumber, setDocumentNumber] = useState(''); const [affinity, setAffinity] = useState('');
  const [subjects, setSubjects] = useState('');
  const [studentModality, setStudentModality] = useState('both');
  const [biography, setBiography] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [travelRatePerKm, setTravelRatePerKm] = useState('');
  const [modalities, setModalities] = useState<TeachingModality[]>(['virtual']);
  const [credentials, setCredentials] = useState<CredentialDraft[]>([blankCredential()]);
  const [experiences, setExperiences] = useState<ExperienceDraft[]>([blankExperience()]);
  useEffect(() => {
    if (user?.role !== 'tutor') return;
    let active = true; let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      try { const result = await getMyProfile(); if (active && current === sequence) setUser(result.user); window.dispatchEvent(new Event('profile-updated')); } catch { /* Preserve unsaved form fields if the connection drops. */ }
    };
    window.addEventListener('profile-review-updated', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { active = false; clearInterval(timer); window.removeEventListener('profile-review-updated', refresh); window.removeEventListener('focus', refresh); };
  }, [user?.role]);

  useEffect(() => {
    getMyProfile().then(({ user: profile }) => {
      setUser(profile);
      setPhone(profile.personal?.phone ?? ''); setGender(profile.personal?.gender ?? ''); setDocumentType(profile.personal?.documentType ?? 'dpi'); setDocumentNumber(profile.personal?.documentNumber ?? ''); setAffinity(profile.personal?.categoryAffinity.join(', ') ?? '');
      const location = profile.role === 'tutor' ? profile.tutorProfile?.location : profile.studentProfile?.location;
      setCity(location?.city ?? '');
      setAddress(location?.address ?? '');
      setLatitude(location?.coordinates ? String(location.coordinates.latitude) : '');
      setLongitude(location?.coordinates ? String(location.coordinates.longitude) : '');
      if (profile.studentProfile) {
        setSubjects(profile.studentProfile.subjectPreferences.join(', '));
        setStudentModality(profile.studentProfile.preferredModality ?? 'both');
      }
      if (profile.tutorProfile) {
        const tutor = profile.tutorProfile;
        setBiography(tutor.biography);
        setSpecialties(tutor.specialties.join(', '));
        setHourlyRate(String(tutor.hourlyRate));
        setTravelRatePerKm(tutor.travelRatePerKm === undefined ? '' : String(tutor.travelRatePerKm));
        setModalities(tutor.teachingModalities);
        setCredentials(tutor.credentials.length ? tutor.credentials.map((item) => ({ ...item, institution: item.institution ?? '', description: item.description ?? '', evidenceUrl: item.evidenceUrl ?? '' })) : [blankCredential()]);
        setExperiences(tutor.professionalExperience.length ? tutor.professionalExperience.map((item) => ({
          organization: item.organization, position: item.position, description: item.description ?? '',
          startDate: item.startDate?.slice(0, 10) ?? '', endDate: item.endDate?.slice(0, 10) ?? '',
        })) : [blankExperience()]);
      }
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar el perfil.'))
      .finally(() => setLoading(false));
  }, []);

  function toggleModality(modality: TeachingModality) {
    setModalities((current) => current.includes(modality) ? current.filter((item) => item !== modality) : [...current, modality]);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) { setError('Tu navegador no admite ubicación.'); return; }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude));
      setSuccess('Coordenadas obtenidas. Guarda el perfil para utilizarlas en rutas y búsquedas.');
    }, () => setError('No se pudo obtener la ubicación. Revisa los permisos del navegador.'), { timeout: 10000 });
  }

  function updateCredential(index: number, field: keyof CredentialDraft, value: string) {
    setCredentials((current) => current.map((credential, itemIndex) => itemIndex === index ? { ...credential, [field]: value } : credential));
  }

  function updateExperience(index: number, field: keyof ExperienceDraft, value: string) {
    setExperiences((current) => current.map((experience, itemIndex) => itemIndex === index ? { ...experience, [field]: value } : experience));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || (effectiveRole !== 'student' && effectiveRole !== 'tutor')) return;
    if (!latitude.trim() || !longitude.trim() || !city.trim() || !address.trim() || !gender || !lines(affinity).length) { setError('Completa los datos personales, las categorías de interés y tu dirección con coordenadas.'); return; }
    if (effectiveRole === 'tutor' && !credentials.some((item) => item.title.trim() && item.evidenceUrl.trim().startsWith('https://'))) { setError('Agrega una credencial con enlace HTTPS a tu hoja de vida, PDF o portafolio.'); return; }
    if (Boolean(latitude.trim()) !== Boolean(longitude.trim())) {
      setError('Completa latitud y longitud, o deja ambas vacías.'); return;
    }
    if (effectiveRole === 'tutor' && modalities.length === 0) {
      setError('Selecciona al menos una modalidad de enseñanza.');
      return;
    }
    if (effectiveRole === 'tutor' && experiences.some((item) => (item.organization.trim() || item.position.trim()) && (!item.organization.trim() || !item.position.trim()))) {
      setError('Completa organización y puesto para cada experiencia, o elimina la fila incompleta.');
      return;
    }
    if (effectiveRole === 'tutor' && credentials.some((item) => (item.institution.trim() || item.description.trim() || item.evidenceUrl.trim()) && !item.title.trim())) {
      setError('Cada credencial debe incluir un título, o elimina la fila incompleta.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    const location = {
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(address.trim() ? { address: address.trim() } : {}),
      ...(latitude.trim() && longitude.trim() ? { coordinates: { latitude: Number(latitude), longitude: Number(longitude) } } : {}),
    };
    const profile = effectiveRole === 'student'
      ? { ...(Object.keys(location).length ? { location } : {}), subjectPreferences: lines(subjects), preferredModality: studentModality }
      : {
          biography,
          specialties: lines(specialties),
          hourlyRate: Number(hourlyRate),
          ...(travelRatePerKm !== '' ? { travelRatePerKm: Number(travelRatePerKm) } : {}),
          teachingModalities: modalities,
          ...(Object.keys(location).length ? { location } : {}),
          credentials: credentials.filter((item) => item.title.trim()).map((item) => ({
            title: item.title.trim(),
            ...(item.institution.trim() ? { institution: item.institution.trim() } : {}),
            ...(item.description.trim() ? { description: item.description.trim() } : {}),
            ...(item.evidenceUrl.trim() ? { evidenceUrl: item.evidenceUrl.trim() } : {}),
          })),
          professionalExperience: experiences.filter((item) => item.organization.trim() && item.position.trim()).map((item) => ({
            organization: item.organization.trim(),
            position: item.position.trim(),
            ...(item.description.trim() ? { description: item.description.trim() } : {}),
            ...(item.startDate ? { startDate: item.startDate } : {}),
            ...(item.endDate ? { endDate: item.endDate } : {}),
          })),
        };
    try {
      const personal: PersonalDetails = { phone: phone.trim(), gender: gender as PersonalDetails['gender'], documentType, documentNumber: documentNumber.trim(), categoryAffinity: lines(affinity) };
      const result = needsOnboarding
        ? await completeOnboarding(effectiveRole, profile, personal)
        : await updateMyProfile(profile, personal);
      setUser(result.user); window.dispatchEvent(new Event('profile-updated'));
      if (result.user.tutorProfile) {
        setCredentials(result.user.tutorProfile.credentials.map((item) => ({ ...item, institution: item.institution ?? '', description: item.description ?? '', evidenceUrl: item.evidenceUrl ?? '' })));
        setExperiences(result.user.tutorProfile.professionalExperience.map((item) => ({ organization: item.organization, position: item.position, description: item.description ?? '', startDate: item.startDate?.slice(0, 10) ?? '', endDate: item.endDate?.slice(0, 10) ?? '' })));
      }
      setSuccess('Tu perfil se guardó correctamente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el perfil.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="profile-panel" aria-labelledby="profile-editor-title">
    <div className="profile-panel__heading">
      <div><span className="eyebrow">TU CUENTA</span><h2 id="profile-editor-title">Mi perfil</h2></div>
      <button className="profile-panel__close" type="button" onClick={onClose}>Volver al inicio</button>
    </div>
    {loading && <p role="status">Cargando perfil…</p>}
    {error && <p className="profile-message profile-message--error" role="alert">{error}</p>}
    {!loading && user?.role === 'admin' && <div className="profile-form">
      <p className="profile-form__identity">{user.fullName} · Administrador · {user.email}</p>
      <p>Revisa las solicitudes de catedráticos y autoriza sus perfiles antes de que publiquen tutorías.</p>
      <Link className="button" to="/administracion/catedraticos">Revisar solicitudes de catedráticos</Link>
    </div>}
    {!loading && user?.role === 'tutor' && user.tutorProfile?.verificationStatus === 'pending' && <p role="status">Tu perfil está pendiente de aprobación administrativa. Puedes editarlo mientras se revisa.</p>}
    {!loading && user?.tutorProfile?.verificationStatus === 'rejected' && <div><p>Tu solicitud fue rechazada: {user.tutorProfile.reviewNote || 'Revisa la información de tu perfil.'}</p><p>Guarda primero tus correcciones y luego solicita una nueva revisión.</p><button type="button" disabled={saving} onClick={async () => { setSaving(true); try { await resubmitTutor(); const result = await getMyProfile(); setUser(result.user); window.dispatchEvent(new Event('profile-updated')); setSuccess('Solicitud reenviada al administrador.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo solicitar revisión.'); } finally { setSaving(false); } }}>Solicitar nueva revisión</button></div>}
    {!loading && user?.role === 'student' && <p><Link to="/notificaciones">Mis notificaciones</Link> · <Link to="/calendario">Mi calendario</Link> · <Link to="/mensajes">Mis mensajes</Link></p>}
    {!loading && user?.role === 'tutor' && <p><Link to="/notificaciones">Notificaciones y solicitudes</Link> · <Link to="/mis-tutorias">Administrar mis cursos</Link> · <Link to="/calendario">Mis horarios y calendario</Link> · <Link to="/mensajes">Mis mensajes</Link></p>}
    {!loading && needsOnboarding && <div className="profile-form">
      <h3>¿Cómo quieres usar EduMatch?</h3>
      <p>Elige tu perfil y completa el formulario para terminar tu registro.</p>
      <button type="button" className="button" aria-pressed={selectedRole === 'student'} disabled={saving} onClick={() => { setSelectedRole('student'); setError(''); setSuccess(''); }}>Soy estudiante</button>
      <button type="button" className="button" aria-pressed={selectedRole === 'tutor'} disabled={saving} onClick={() => { setSelectedRole('tutor'); setError(''); setSuccess(''); }}>Soy catedrático</button>
      {selectedRole === 'tutor' && <p>Tu perfil se enviará al administrador. Podrás publicar tutorías cuando sea aprobado.</p>}
    </div>}

    {!loading && user && (effectiveRole === 'student' || effectiveRole === 'tutor') && <form className="profile-form" onSubmit={handleSubmit}>
      <p className="profile-form__identity">{user.fullName} · {effectiveRole === 'student' ? 'Estudiante' : 'Catedrático'} · {user.email}</p>
      <fieldset><legend>Datos personales obligatorios</legend><p>Estos datos de identificación solo se muestran en tu propio perfil.</p>
        <label>Teléfono / WhatsApp<input required type="tel" autoComplete="tel" pattern="\+?[0-9]{8,15}" placeholder="+50212345678" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Género<select required value={gender} onChange={(event) => setGender(event.target.value as PersonalDetails['gender'])}><option value="">Selecciona una opción</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option><option value="prefer_not_to_say">Prefiero no indicarlo</option></select></label>
        <label>Documento de identificación<select value={documentType} onChange={(event) => setDocumentType(event.target.value as PersonalDetails['documentType'])}><option value="dpi">DPI</option><option value="passport">Pasaporte</option><option value="other">Otro documento</option></select></label>
        <label>Número de documento<input required minLength={5} maxLength={40} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} autoComplete="off" /></label>
        <label>Categorías de interés (separadas por comas)<input required maxLength={2400} value={affinity} onChange={(event) => setAffinity(event.target.value)} placeholder="Matemáticas, Idiomas" /></label>
      </fieldset>
      {effectiveRole === 'tutor' ? <>
        <label>Biografía<textarea required minLength={20} maxLength={2000} value={biography} onChange={(event) => setBiography(event.target.value)} /></label>
        <label>Especialidades <small>Separa con comas</small><input required value={specialties} onChange={(event) => setSpecialties(event.target.value)} /></label>
        <label>Movilización por kilómetro (Q)<input type="number" min="0" max="10000" step="0.01" value={travelRatePerKm} onChange={(event) => setTravelRatePerKm(event.target.value)} /><small>Para domicilio: distancia por carretera de ida × tarifa por km. Si la defines, sustituye el traslado fijo del curso.</small></label>
        <label>Tarifa por hora<input required type="number" min="0" max="1000000" step="0.01" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} /></label>
        <fieldset><legend>Modalidades</legend>{([['virtual', 'Virtual'], ['at_tutor', 'En casa del tutor'], ['at_student', 'A domicilio']] as const).map(([value, label]) => <label className="profile-check" key={value}><input type="checkbox" checked={modalities.includes(value)} onChange={() => toggleModality(value)} />{label}</label>)}</fieldset>
        <fieldset><legend>Hoja de vida o credenciales: agrega un enlace HTTPS a un PDF o portafolio</legend>{credentials.map((credential, index) => <div className="profile-list-row" key={`credential-${index}`}><div className="profile-form__row"><label>Título<input value={credential.title} onChange={(event) => updateCredential(index, 'title', event.target.value)} /></label><label>Institución<input value={credential.institution} onChange={(event) => updateCredential(index, 'institution', event.target.value)} /></label></div><label>Descripción<input value={credential.description} onChange={(event) => updateCredential(index, 'description', event.target.value)} /></label><label>URL de evidencia HTTPS<input type="url" value={credential.evidenceUrl} onChange={(event) => updateCredential(index, 'evidenceUrl', event.target.value)} /></label><button className="profile-remove" type="button" onClick={() => setCredentials((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar credencial</button></div>)}<button className="profile-add" type="button" onClick={() => setCredentials((current) => [...current, blankCredential()])}>Añadir credencial</button></fieldset>
        <fieldset><legend>Experiencia profesional (opcional)</legend>{experiences.map((experience, index) => <div className="profile-list-row" key={`experience-${index}`}><div className="profile-form__row"><label>Organización<input value={experience.organization} onChange={(event) => updateExperience(index, 'organization', event.target.value)} /></label><label>Puesto<input value={experience.position} onChange={(event) => updateExperience(index, 'position', event.target.value)} /></label></div><label>Descripción<input value={experience.description} onChange={(event) => updateExperience(index, 'description', event.target.value)} /></label><div className="profile-form__row"><label>Desde<input type="date" value={experience.startDate} onChange={(event) => updateExperience(index, 'startDate', event.target.value)} /></label><label>Hasta<input type="date" value={experience.endDate} onChange={(event) => updateExperience(index, 'endDate', event.target.value)} /></label></div><button className="profile-remove" type="button" onClick={() => setExperiences((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar experiencia</button></div>)}<button className="profile-add" type="button" onClick={() => setExperiences((current) => [...current, blankExperience()])}>Añadir experiencia</button></fieldset>
      </> : <>
        <label>Materias de interés <small>Separa con comas</small><textarea value={subjects} onChange={(event) => setSubjects(event.target.value)} /></label>
        <label>Modalidad preferida<select value={studentModality} onChange={(event) => setStudentModality(event.target.value)}><option value="virtual">Virtual</option><option value="in_person">Presencial</option><option value="both">Ambas</option></select></label>
      </>}
      <fieldset><legend>Dirección habitual obligatoria</legend><label>Ciudad<input required maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} /></label><label>Dirección<input required maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} /><small>La dirección exacta solo aparece en tu propio perfil.</small></label><p>Haz clic en el mapa para fijar tu ubicación, arrastra el marcador o utiliza tu ubicación actual.</p><ProfileLocationMap latitude={latitude} longitude={longitude} onSelect={(lat, lng) => { setLatitude(String(lat)); setLongitude(String(lng)); }} /><div className="profile-form__row"><label>Latitud<input required type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitud<input required type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label></div></fieldset>
      <button type="button" disabled={saving} onClick={useCurrentLocation}>Usar mi ubicación para el perfil</button>
      {error && <p className="profile-message profile-message--error" role="alert">{error}</p>}
      {success && <p className="profile-message" role="status">{success}</p>}
      {effectiveRole === 'tutor' && modalities.length === 0 && <p className="profile-message profile-message--error" role="alert">Selecciona al menos una modalidad de enseñanza.</p>}
      <button className="button" type="submit" disabled={saving || (effectiveRole === 'tutor' && modalities.length === 0)}>{saving ? 'Guardando…' : 'Guardar perfil'}</button>
    </form>}
  </section>;
}
