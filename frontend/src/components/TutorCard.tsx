import Icon from './Icon';
import type { PublicTutor, TeachingModality } from '../lib/api';

type TutorCardProps = { tutor: PublicTutor; onDetails: (tutor: PublicTutor) => void };

function modeLabel(modalities: TeachingModality[]): string {
  const virtual = modalities.includes('virtual');
  const inPerson = modalities.includes('at_tutor') || modalities.includes('at_student');
  if (virtual && inPerson) return 'Virtual y presencial';
  if (virtual) return 'Virtual';
  if (inPerson) return 'Presencial';
  return 'Modalidad por definir';
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toLocaleUpperCase('es');
}

export default function TutorCard({ tutor, onDetails }: TutorCardProps) {
  const profile = tutor.tutorProfile;
  const palette = ['lilac', 'sand', 'mint'] as const;
  const color = palette[tutor.id.charCodeAt(tutor.id.length - 1) % palette.length] ?? 'mint';
  return <article className="tutor-card">
    <div className={`tutor-card__portrait tutor-card__portrait--${color}`} aria-hidden="true">
      <span className="portrait-sun" /><span className="tutor-card__initials">{initials(tutor.fullName)}</span>
    </div>
    <div className="tutor-card__body">
      <div className="tutor-card__meta"><span className="demo-badge">{profile.verificationStatus === 'verified' ? 'PERFIL VERIFICADO' : 'PERFIL PÚBLICO'}</span></div>
      <h3>{tutor.fullName}</h3><p className="tutor-card__subject">{profile.specialties.join(' · ') || 'Especialidad por definir'}</p>
      <p>{tutor.averageRating != null ? `★ ${tutor.averageRating.toFixed(1)} (${tutor.reviewCount} calificaciones)` : 'Sin calificaciones aún'}{tutor.distanceKm != null ? ` · ${tutor.distanceKm.toFixed(1)} km en línea recta` : ''}</p>
      {tutor.matchingCourseCount ? <p>{tutor.matchingCourseCount} curso(s) coinciden · tarifa desde</p> : null}
      <div className="tutor-card__details"><span><Icon name="video" /> {modeLabel(profile.teachingModalities)}</span><strong>{profile.hourlyRate === undefined ? 'Consultar' : `Q ${profile.hourlyRate}`}<small>{profile.hourlyRate === undefined ? '' : ' / hora'}</small></strong></div>
      {profile.location?.city && <p className="tutor-card__location"><Icon name="pin" /> {profile.location.city}</p>}
      <button className="tutor-card__link" type="button" onClick={() => onDetails(tutor)}>Ver perfil público <Icon name="arrow" /></button>
    </div>
  </article>;
}
