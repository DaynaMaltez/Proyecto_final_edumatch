import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import HomePage from './pages/HomePage';
import Icon from './components/Icon';
import TutorCard from './components/TutorCard';
import ProfileEditor from './components/ProfileEditor';
import GoogleSignIn from './components/GoogleSignIn';
import SchedulingPanel from './components/SchedulingPanel';
import ServiceCatalog from './components/ServiceCatalog';
import TutorCourses from './components/TutorCourses';
import TutorRequests from './components/TutorRequests';
import StudentNotifications from './components/StudentNotifications';
import ChatPanel from './components/ChatPanel';
import AdminPanel from './components/AdminPanel';
import AccountGate from './components/AccountGate';
import ModerationPanel from './components/ModerationPanel';
import TutorContact from './components/TutorContact';
import TutorReviews from './components/TutorReviews';
import { getAccessToken, logoutSession, getMyProfile, type OwnProfile, type TutorSearch } from './lib/api';
import { getTutor, searchTutors, type PublicTutor, type TutorSearchResult } from './lib/api';



export default function App() { return <BrowserRouter><AccountGate><AppContent /></AccountGate></BrowserRouter>; }
export function AppContent() {
  const routeLocation = useLocation();
  const navigate = useNavigate();
  const home = routeLocation.pathname === '/';
  const [accountLoading, setAccountLoading] = useState(Boolean(getAccessToken()));
  useEffect(() => {
    setMenuOpen(false);
    const legacy: Record<string, string> = { '#reservas': '/calendario', '#mensajes': '/mensajes', '#solicitudes': '/notificaciones', '#notificaciones-estudiante': '/notificaciones', '#catalogo': '/tutorias/cursos', '#administracion': '/administracion', '#moderacion': '/ayuda', '#categorias': '/tutorias', '#tutores-destacados': '/tutorias' };
    if (legacy[routeLocation.hash]) { navigate(legacy[routeLocation.hash], { replace: true }); return; }
    if (routeLocation.hash) document.getElementById(routeLocation.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    else window.scrollTo(0, 0);
    const titles: Record<string, string> = { '/': 'Inicio', '/tutorias': 'Buscar tutores', '/tutorias/cursos': 'Catálogo de tutorías', '/perfil': 'Mi perfil', '/calendario': 'Mi calendario', '/mensajes': 'Mensajes', '/notificaciones': 'Notificaciones', '/mis-tutorias': 'Mis tutorías', '/ayuda': 'Ayuda y reportes' };
    document.title = `${routeLocation.pathname.startsWith('/administracion') ? 'Administración' : titles[routeLocation.pathname] ?? 'Página no encontrada'} | EduMatch`;
  }, [routeLocation.pathname, routeLocation.hash, navigate]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  useEffect(() => {
    const update = (event: Event) => setUnreadChat(Number((event as CustomEvent<number>).detail) || 0);
    window.addEventListener('chat-unread', update);
    return () => window.removeEventListener('chat-unread', update);
  }, []);
  const [subject, setSubject] = useState('');
  const [location, setLocation] = useState('');
  const [modality, setModality] = useState('');
  const [minRate, setMinRate] = useState('');
  const [maxRate, setMaxRate] = useState('');
  const [maxDistance, setMaxDistance] = useState('');
  const [minRating, setMinRating] = useState('');
  const [searchPosition, setSearchPosition] = useState<{ latitude: number; longitude: number }>();
  const [locating, setLocating] = useState(false);
  const searchSequence = useRef(0);
  const appliedSearch = useRef<TutorSearch>({});
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => {
    const update = () => { setSessionRevision((value) => value + 1); setAccountRole(undefined); setAccountLoading(Boolean(getAccessToken())); };
    window.addEventListener('session-changed', update);
    return () => window.removeEventListener('session-changed', update);
  }, []);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const showReview = (event: Event) => {
      const decision = (event as CustomEvent<{ status: string; reviewNote?: string }>).detail;
      setNotice(decision.status === 'rejected' ? `Tu solicitud de catedrático fue rechazada. Motivo: ${decision.reviewNote || 'Revisa tu perfil.'}` : decision.status === 'verified' ? 'Tu perfil de catedrático fue aprobado. Ya puedes publicar tutorías.' : 'Tu perfil se envió a revisión administrativa.');
    };
    window.addEventListener('profile-review-updated', showReview);
    return () => window.removeEventListener('profile-review-updated', showReview);
  }, []);
  const [tutors, setTutors] = useState<TutorSearchResult | null>(null);
  const [loadingTutors, setLoadingTutors] = useState(true);
  const [tutorError, setTutorError] = useState('');
  const [activePage, setActivePage] = useState(1);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const sequence = ++searchSequence.current;
      try { const result = await searchTutors({ ...appliedSearch.current, page: activePage }); if (active && sequence === searchSequence.current) setTutors(result); }
      catch { /* The review remains saved even if refreshing search fails. */ }
    };
    window.addEventListener('reviews-updated', refresh);
    return () => { active = false; window.removeEventListener('reviews-updated', refresh); };
  }, [activePage]);
  const profileOpen = routeLocation.pathname === '/perfil';
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<'login' | 'register'>('login');
  const [selectedTutor, setSelectedTutor] = useState<PublicTutor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [accountRole, setAccountRole] = useState<OwnProfile['role']>();
  useEffect(() => {
    let active = true;
    const refreshRole = async () => {
      if (!getAccessToken()) { if (active) { setAccountRole(undefined); setAccountLoading(false); } return; }
      try { const { user } = await getMyProfile(); if (active) setAccountRole(user.role); }
      catch { if (active) setAccountRole(undefined); } finally { if (active) setAccountLoading(false); }
    };
    void refreshRole();
    window.addEventListener('focus', refreshRole); window.addEventListener('profile-updated', refreshRole);
    return () => { active = false; window.removeEventListener('focus', refreshRole); window.removeEventListener('profile-updated', refreshRole); };
  }, [sessionRevision, profileOpen, routeLocation.pathname]);
  const profileSequence = useRef(0);
  const closeTutorProfile = useCallback(() => {
    profileSequence.current++; setSelectedTutor(null); setDetailLoading(false);
    const params = new URLSearchParams(routeLocation.search);
    if (params.has('tutor')) { params.delete('tutor'); navigate({ pathname: routeLocation.pathname, search: params.toString() }, { replace: true }); }
  }, [navigate, routeLocation.pathname, routeLocation.search]);
  const closeMenu = () => setMenuOpen(false);
  const onAuthenticated = useCallback(() => { setAuthOpen(false); navigate('/perfil'); }, [navigate]);
  useEffect(() => {
    const closeTutor = () => closeTutorProfile();
    const reserve = (event: Event) => { closeTutor(); navigate('/calendario', { state: { course: (event as CustomEvent).detail } }); };
    const chat = () => { closeTutor(); navigate('/mensajes'); };
    window.addEventListener('reserve-course', reserve);
    window.addEventListener('open-chat', chat);
    return () => { window.removeEventListener('reserve-course', reserve); window.removeEventListener('open-chat', chat); };
  }, [navigate, closeTutorProfile]);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(routeLocation.search).get('tutor');
    if (!id) { profileSequence.current++; setSelectedTutor(null); setDetailLoading(false); return; }
    if (id) {
      const sequence = ++profileSequence.current;
    setDetailLoading(true); setDetailError('');
      getTutor(id).then(({ data }) => { if (active && sequence === profileSequence.current) setSelectedTutor(data); }).catch(() => { if (active && sequence === profileSequence.current) { setSelectedTutor(null); setNotice('El perfil compartido no está disponible.'); } }).finally(() => { if (active && sequence === profileSequence.current) setDetailLoading(false); });
    }
    return () => { active = false; };
  }, [routeLocation.search]);

  useEffect(() => {
    let active = true; const sequence = ++searchSequence.current;
    searchTutors({ page: 1 }).then((result) => { if (active && sequence === searchSequence.current) setTutors(result); })
      .catch((error: unknown) => { if (active && sequence === searchSequence.current) setTutorError(error instanceof Error ? error.message : 'No se pudieron cargar los tutores.'); })
      .finally(() => { if (active && sequence === searchSequence.current) setLoadingTutors(false); });
    return () => { active = false; };
  }, []);

  async function handleSearch(event?: FormEvent<HTMLFormElement>, page = 1, category = subject, reuseApplied = false) {
    event?.preventDefault();
    if (!reuseApplied && maxDistance && !searchPosition) { setNotice('Usa tu ubicación antes de buscar por distancia.'); return; }
    navigate('/tutorias');
    const sequence = ++searchSequence.current;
    const filters: TutorSearch = reuseApplied ? appliedSearch.current : { category: category.trim(), location: location.trim(), modality: modality as TutorSearch['modality'], minRate, maxRate, minRating, maxDistance, ...searchPosition };
    appliedSearch.current = filters;
    setLoadingTutors(true);
    setTutorError('');
    setNotice('');
    setActivePage(page);
    try {
      const result = await searchTutors({ ...filters, page });
      if (sequence === searchSequence.current) setTutors(result);
      document.getElementById('tutores-destacados')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      if (sequence === searchSequence.current) { setTutorError(error instanceof Error ? error.message : 'No se pudieron cargar los tutores.'); setTutors(null); }
    } finally {
      if (sequence === searchSequence.current) setLoadingTutors(false);
    }
  }

  function openTutorProfile(tutor: PublicTutor) {
    setSelectedTutor(tutor); setDetailError('');
    navigate({ pathname: routeLocation.pathname, search: new URLSearchParams({ tutor: tutor.id }).toString() });
  }

  async function searchByCategory(category: string) {
    setSubject(category);
    await handleSearch(undefined, 1, category);
  }
  async function clearSearch() {
    setSubject(''); setLocation(''); setModality(''); setMinRate(''); setMaxRate(''); setMinRating(''); setMaxDistance(''); setSearchPosition(undefined);
    appliedSearch.current = {}; const sequence = ++searchSequence.current;
    setLoadingTutors(true); setTutorError(''); setActivePage(1);
    try { const result = await searchTutors({ page: 1 }); if (sequence === searchSequence.current) setTutors(result); }
    catch { if (sequence === searchSequence.current) setTutorError('No se pudieron cargar los tutores.'); }
    finally { if (sequence === searchSequence.current) setLoadingTutors(false); }
  }

  function locateForSearch() {
    if (!navigator.geolocation) { setNotice('No se puede obtener la ubicación en este navegador.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => { setSearchPosition({ latitude: coords.latitude, longitude: coords.longitude }); setLocating(false); setNotice('Ubicación lista. La distancia de búsqueda se mide en línea recta.'); }, () => { setLocating(false); setNotice('No se pudo obtener la ubicación. Revisa el permiso del navegador.'); }, { timeout: 10000 });
  }

  function protect(content: ReactNode, roles?: NonNullable<OwnProfile['role']>[]) {
    if (!getAccessToken()) return <div className="container section route-message"><h1>Inicia sesión para continuar</h1><p>Accede con Google para utilizar esta sección.</p><button className="button" onClick={() => { setAuthIntent('login'); setAuthOpen(true); }}>Iniciar sesión con Google</button><Link to="/">Volver al inicio</Link></div>;
    if (accountLoading) return <div className="container section"><p role="status">Comprobando permisos…</p></div>;
    if (!accountRole && !profileOpen) return <Navigate to="/perfil" replace />;
    if (roles && !roles.includes(accountRole!)) return <div className="container section route-message"><h1>Esta sección corresponde a otro perfil</h1><p>Usa las opciones de tu menú para continuar.</p><Link className="button" to="/">Volver al inicio</Link></div>;
    return content;
  }

  const tutorResults = (
      <section className="section tutors-section" id="tutores-destacados" aria-labelledby="tutors-title">
        <div className="container">
          <div className="section-heading section-heading--row tutors-heading"><div><span className="eyebrow">PERSONAS QUE INSPIRAN</span><h2 id="tutors-title">{home ? <>Conoce a algunos <span>tutores</span></> : <>Encuentra tu <span>tutor</span></>}</h2></div><Link className="text-link" to={home ? "/tutorias" : "/"}>{home ? "Ver todos los tutores" : "Volver al inicio"} <Icon name="arrow" /></Link></div>
          <p className="demo-note"><Icon name="info" /> Perfiles públicos cargados desde EduMatch.</p>
          {loadingTutors && <p className="search-state" role="status">Buscando tutores…</p>}
          {tutorError && <p className="search-state search-state--error" role="alert">{tutorError}</p>}
          {!loadingTutors && !tutorError && tutors?.data.length === 0 && <p className="search-state">No encontramos tutores con esos filtros. Prueba ampliando la distancia o el precio, o quitando la ciudad. Los tutores sin coordenadas no aparecen al limitar distancia, y los que no tienen reseñas no aparecen al exigir calificación.</p>}
          {!loadingTutors && !tutorError && tutors && tutors.data.length > 0 && <>
            <p className="search-state">{tutors.pagination.total} tutor{tutors.pagination.total === 1 ? '' : 'es'} encontrado{tutors.pagination.total === 1 ? '' : 's'}.</p>
            <div className="tutor-grid">{(home ? tutors.data.slice(0, 3) : tutors.data).map((tutor) => <TutorCard key={tutor.id} tutor={tutor} onDetails={openTutorProfile} />)}</div>
            {!home && tutors.pagination.totalPages > 1 && <nav className="tutor-pagination" aria-label="Paginación de tutores">
              <button type="button" disabled={activePage <= 1 || loadingTutors} onClick={() => void handleSearch(undefined, activePage - 1, subject, true)}>Anterior</button>
              <span>Página {activePage} de {tutors.pagination.totalPages}</span>
              <button type="button" disabled={activePage >= tutors.pagination.totalPages || loadingTutors} onClick={() => void handleSearch(undefined, activePage + 1, subject, true)}>Siguiente</button>
            </nav>}
          </>}
        </div>
      </section>
  );

  return <>
    <header className="site-header">
      <div className="container nav-wrap">
        <Link className="brand" to="/" aria-label="EduMatch, ir al inicio" onClick={closeMenu}>
          <span className="brand__mark"><Icon name="sparkle" /></span><span>Edu<span className="brand__accent">Match</span></span>
        </Link>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
        <nav id="main-navigation" className={`main-nav${menuOpen ? ' main-nav--open' : ''}`} aria-label="Navegación principal">
          <NavLink to="/" end onClick={closeMenu}>Inicio</NavLink>
          <NavLink to="/tutorias" onClick={closeMenu}>Buscar tutorías</NavLink>
          {getAccessToken() && <>
            {accountRole === 'tutor' && <NavLink to="/mis-tutorias" onClick={closeMenu}>Mis tutorías</NavLink>}
            {['student', 'tutor'].includes(accountRole ?? '') && <>
              <NavLink to="/calendario" onClick={closeMenu}>Calendario</NavLink>
              <NavLink to="/mensajes" onClick={closeMenu}>Mensajes{unreadChat > 0 ? ` (${unreadChat})` : ''}</NavLink>
              <NavLink to="/notificaciones" onClick={closeMenu}>Notificaciones</NavLink>
              <NavLink to="/ayuda" onClick={closeMenu}>Ayuda y reportes</NavLink>
            </>}
            {accountRole === 'admin' && <NavLink to="/administracion" onClick={closeMenu}>Administración</NavLink>}
            <NavLink to="/perfil" onClick={closeMenu}>Mi perfil</NavLink>
            <button className="nav-login" type="button" onClick={() => { void logoutSession().catch(() => setNotice('Se cerró la sesión local. No se pudo contactar al servidor para invalidar el acceso remoto.')).finally(() => { closeTutorProfile(); navigate('/'); closeMenu(); }); }}>Salir</button>
          </>}
          {!getAccessToken() && <><button className="nav-login" type="button" onClick={() => { setAuthIntent('login'); setAuthOpen(true); closeMenu(); }}>Iniciar sesión</button><button className="button button--small" type="button" onClick={() => { setAuthIntent('register'); setAuthOpen(true); closeMenu(); }}>Registrarse <Icon name="arrow" /></button></>}
        </nav>
      </div>
    </header>
    {notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}><Icon name="close" /></button></div>}
    {authOpen && <div className="profile-overlay"><section className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="profile-panel__close" type="button" onClick={() => setAuthOpen(false)}>Cerrar</button><span className="eyebrow">EDUMATCH</span><h2 id="auth-title">{authIntent === 'register' ? 'Crea tu cuenta' : 'Inicia sesión'}</h2><GoogleSignIn intent={authIntent} onAuthenticated={onAuthenticated} /></section></div>}

    <main id="contenido-principal" className={home ? 'home-page' : 'workspace-page'}>
      <Routes>
        <Route path="/acceso" element={getAccessToken() ? <Navigate to="/perfil" replace /> : <div className="container section"><section className="auth-panel"><span className="eyebrow">EDUMATCH</span><h1>Inicia sesión</h1>{new URLSearchParams(routeLocation.search).get('motivo') === 'sesion' && <p role="status">Tu sesión venció o dejó de ser válida. Inicia sesión nuevamente.</p>}<GoogleSignIn intent="login" onAuthenticated={onAuthenticated} /></section></div>} />
        <Route path="/" element={<HomePage onCategory={(name) => { setNotice(''); void searchByCategory(name); }} onTeach={() => { if (getAccessToken()) navigate('/perfil'); else { setAuthIntent('register'); setAuthOpen(true); } }}>{tutorResults}</HomePage>} />
        <Route path="/tutorias" element={<><div className="container page-heading"><span className="eyebrow">EXPLORA Y APRENDE</span><h1>Buscar tutorías</h1><p>Filtra por tema, modalidad, precio y distancia para encontrar tu próxima clase.</p><BrowseTabs /></div>
        <div className="container search-container">
          <form className="search-panel" onSubmit={handleSearch} aria-label="Formulario para explorar tutores">
            <label className="search-field"><span className="search-field__icon"><Icon name="book" /></span><span className="search-field__label">¿Qué quieres aprender?</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Asignatura o tema" aria-label="Asignatura o tema" /></label>
            <label className="search-field"><span className="search-field__icon"><Icon name="pin" /></span><span className="search-field__label">¿Dónde?</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Ciudad o zona" aria-label="Ciudad o zona" /></label>
            <label className="search-field search-field--mode"><span className="search-field__icon"><Icon name="video" /></span><span className="search-field__label">Modalidad</span><select value={modality} onChange={(event) => setModality(event.target.value)} aria-label="Modalidad"><option value="">Cualquiera</option><option value="virtual">Virtual</option><option value="in_person">Presencial (cualquiera)</option><option value="at_tutor">En casa del catedrático</option><option value="at_student">A domicilio</option></select></label>
            <fieldset className="search-rate"><legend>Tarifa por hora (Q)</legend><label><span className="sr-only">Mínima</span><input type="number" min="0" step="0.01" value={minRate} onChange={(event) => setMinRate(event.target.value)} placeholder="Mín." /></label><label><span className="sr-only">Máxima</span><input type="number" min="0" step="0.01" value={maxRate} onChange={(event) => setMaxRate(event.target.value)} placeholder="Máx." /></label></fieldset>
            <button className="button search-button" type="submit"><Icon name="search" /> Buscar tutores</button>
            <div className="search-advanced">
              <label>Distancia máxima (km)<input type="number" min="0.1" max="20000" step="0.1" value={maxDistance} onChange={(e) => setMaxDistance(e.target.value)} placeholder="Sin límite" /></label>
              <button type="button" disabled={locating} onClick={locateForSearch}>{locating ? 'Obteniendo ubicación…' : searchPosition ? 'Actualizar mi ubicación' : 'Usar mi ubicación'}</button>
              <label>Calificación mínima<select value={minRating} onChange={(e) => setMinRating(e.target.value)}><option value="">Todas, incluso sin reseñas</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}+ estrellas</option>)}</select></label>
              <button type="button" onClick={() => void clearSearch()}>Limpiar filtros</button>
            </div>
          </form>
        </div>
{tutorResults}

        </>} />
        <Route path="/tutorias/cursos" element={<><div className="container page-heading"><span className="eyebrow">EXPLORA Y APRENDE</span><h1>Catálogo de tutorías</h1><BrowseTabs /></div><ServiceCatalog profileOpen={false} mode="public" /></>} />
        <Route path="/perfil" element={protect(<div className="container profile-page"><ProfileEditor key={sessionRevision} onClose={() => navigate('/')} /></div>)} />
        <Route path="/calendario" element={protect(<SchedulingPanel key={sessionRevision} profileOpen={false} />, ['student', 'tutor'])} />
        <Route path="/notificaciones" element={protect(accountRole === 'tutor' ? <TutorRequests profileOpen={false} /> : <StudentNotifications profileOpen={false} />, ['student', 'tutor'])} />
        <Route path="/mensajes" element={protect(<></>, ['student', 'tutor'])} />
        <Route path="/mis-tutorias" element={protect(<ServiceCatalog profileOpen={false} mode="manage" />, ['tutor'])} />
        <Route path="/ayuda" element={protect(<ModerationPanel profileOpen={false} />, ['student', 'tutor'])} />
        <Route path="/administracion" element={protect(<Navigate to="/administracion/catedraticos" replace />, ['admin'])} />
        <Route path="/administracion/:section" element={protect(<AdminWorkspace />, ['admin'])} />
        <Route path="*" element={<div className="container section route-message"><h1>Página no encontrada</h1><p>La dirección que abriste no existe.</p><Link className="button" to="/">Volver al inicio</Link></div>} />
      </Routes>
      {getAccessToken() && ['student', 'tutor'].includes(accountRole ?? '') && <div hidden={routeLocation.pathname !== '/mensajes'}><ChatPanel key={sessionRevision} profileOpen={false} visible={routeLocation.pathname === '/mensajes'} /></div>}
    </main>

    {selectedTutor && <div className="tutor-dialog-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) closeTutorProfile(); }}>
      <section className="tutor-dialog" role="dialog" aria-modal="true" aria-labelledby="tutor-dialog-title">
        <button className="profile-panel__close" type="button" onClick={() => closeTutorProfile()}>Cerrar</button>
        {detailLoading && <p role="status">Cargando perfil…</p>}
        {detailError && <p className="search-state search-state--error" role="alert">{detailError}</p>}
        <span className="eyebrow">PERFIL PÚBLICO</span><h2 id="tutor-dialog-title">{selectedTutor.fullName}</h2>
        {selectedTutor.tutorProfile.location?.city && <p>{selectedTutor.tutorProfile.location.city}</p>}
        <p>{selectedTutor.tutorProfile.biography}</p>
        <TutorContact key={`contact-${sessionRevision}`} tutorId={selectedTutor.id} tutorName={selectedTutor.fullName} />
        <TutorCourses key={`${selectedTutor.id}-${sessionRevision}`} tutorId={selectedTutor.id} onLogin={() => { closeTutorProfile(); setAuthIntent('login'); setAuthOpen(true); }} />
        <TutorReviews key={`reviews-${selectedTutor.id}`} tutorId={selectedTutor.id} />
        <h3>Especialidades</h3><p>{selectedTutor.tutorProfile.specialties.join(' · ')}</p>
        <h3>Modalidades y tarifa</h3><p>{selectedTutor.tutorProfile.teachingModalities.join(' · ')} · {selectedTutor.tutorProfile.hourlyRate === undefined ? 'Consultar' : `Q ${selectedTutor.tutorProfile.hourlyRate} por hora`}</p>
        {selectedTutor.tutorProfile.credentials.length > 0 && <><h3>Credenciales públicas</h3><ul>{selectedTutor.tutorProfile.credentials.map((credential, index) => <li key={`${credential.title}-${index}`}>{credential.title}{credential.institution ? ` · ${credential.institution}` : ''}</li>)}</ul></>}
        {selectedTutor.tutorProfile.professionalExperience.length > 0 && <><h3>Experiencia</h3><ul>{selectedTutor.tutorProfile.professionalExperience.map((experience, index) => <li key={`${experience.organization}-${index}`}>{experience.position} · {experience.organization}{experience.description ? ` — ${experience.description}` : ''}</li>)}</ul></>}
      </section>
    </div>}

    <footer className="site-footer">
      <div className="container footer-main"><div className="footer-brand"><Link className="brand brand--footer" to="/"><span className="brand__mark"><Icon name="sparkle" /></span><span>Edu<span className="brand__accent">Match</span></span></Link><p>Un espacio para conectar conocimiento, personas y nuevas posibilidades.</p></div><div className="footer-links"><div><strong>Explora</strong><Link to="/tutorias">Áreas de aprendizaje</Link><Link to="/tutorias">Nuestros tutores</Link></div><div><strong>Conoce más</strong><Link to="/#como-funciona">Cómo funciona</Link><Link to="/">Volver al inicio</Link></div></div></div>
      <div className="container footer-bottom"><span>© 2026 EduMatch · Proyecto académico</span><span>Aprender nos mueve <span aria-hidden="true">✳</span></span></div>
    </footer>
  </>;
}

function AdminWorkspace() {
  const { pathname } = useLocation();
  const section = pathname.split('/').pop();
  const options = [['catedraticos', 'Solicitudes de catedráticos'], ['moderacion', 'Denuncias y apelaciones'], ['categorias', 'Categorías'], ['estadisticas', 'Estadísticas']];
  if (!options.some(([value]) => value === section)) return <Navigate to="/administracion/catedraticos" replace />;
  return <div className="admin-workspace"><div className="container page-heading"><span className="eyebrow">ADMINISTRACIÓN</span><h1>Panel de administración</h1><nav className="workspace-tabs" aria-label="Secciones de administración">{options.map(([value, label]) => <NavLink key={value} to={`/administracion/${value}`}>{label}</NavLink>)}</nav></div>{section === 'catedraticos' ? <AdminPanel profileOpen={false} /> : <ModerationPanel key={section} profileOpen={false} mode={section === 'estadisticas' ? 'analytics' : section === 'categorias' ? 'categories' : 'moderation'} />}</div>;
}

function BrowseTabs() { return <nav className="workspace-tabs" aria-label="Opciones de búsqueda"><NavLink to="/tutorias" end>Buscar tutores</NavLink><NavLink to="/tutorias/cursos">Ver cursos</NavLink></nav>; }
