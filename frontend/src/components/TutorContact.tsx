import { useEffect, useState } from 'react';
import { getAccessToken, getMyProfile } from '../lib/api';

export default function TutorContact({ tutorId, tutorName }: { tutorId: string; tutorName: string }) {
  const [student, setStudent] = useState(false);
  useEffect(() => {
    let active = true;
    if (getAccessToken()) void getMyProfile().then(({ user }) => { if (active) setStudent(user.role === 'student'); }).catch(() => {});
    return () => { active = false; };
  }, [tutorId]);
  const link = new URL('/tutorias', window.location.origin);
  link.searchParams.set('tutor', tutorId);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Conoce a ${tutorName} en EduMatch: ${link.href}`)}`;
  return <div className="tutor-contact">
    {student && <button className="button button--small" type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-chat', { detail: { peerId: tutorId } }))}>Enviar mensaje</button>}
    <a className="button button--small" target="_blank" rel="noreferrer" href={whatsapp}>Compartir perfil por WhatsApp</a>
    {['localhost', '127.0.0.1'].includes(window.location.hostname) && <small>El enlace es local. Para compartirlo con otras personas, usa la dirección del sitio cuando esté publicado.</small>}
  </div>;
}
