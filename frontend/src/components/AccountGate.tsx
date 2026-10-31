import { useEffect, useState, type ReactNode } from 'react';
import { clearAccessToken, expireAccessToken, getAccessToken, getSession, logoutSession, moderationRequest, type SuspensionState } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { tokenExpirationMilliseconds } from '../lib/session';

export default function AccountGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      const token = getAccessToken(); if (!token) return;
      const expires = tokenExpirationMilliseconds(token); if (expires === null) return;
      timer = setTimeout(() => { if (Date.now() >= expires) expireAccessToken(token); else arm(); }, Math.max(0, Math.min(expires - Date.now(), 2147483647)));
    };
    const expired = () => navigate('/acceso?motivo=sesion', { replace: true });
    arm(); window.addEventListener('session-changed', arm); window.addEventListener('session-expired', expired);
    return () => { clearTimeout(timer); window.removeEventListener('session-changed', arm); window.removeEventListener('session-expired', expired); };
  }, [navigate]);
  const [loading, setLoading] = useState(Boolean(getAccessToken()));
  const [checked, setChecked] = useState(!getAccessToken());
  const [suspended, setSuspended] = useState(false);
  const [state, setState] = useState<SuspensionState>();
  const [statement, setStatement] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true; let sequence = 0;
    const refresh = async () => {
      const current = ++sequence;
      if (!getAccessToken()) { if (alive) { setSuspended(false); setChecked(true); setLoading(false); setState(undefined); } return; }
      try {
        const { user } = await getSession();
        if (!alive || current !== sequence) return;
        setSuspended(user.accountStatus === 'suspended');
        setChecked(true);
        if (user.accountStatus === 'suspended') {
          const result = await moderationRequest<SuspensionState>('/me');
          if (alive && current === sequence) setState(result);
        }
        if (alive && current === sequence) setError('');
      } catch (cause) { if (alive && current === sequence) setError(cause instanceof Error ? cause.message : 'No se pudo comprobar tu cuenta.'); }
      finally { if (alive && current === sequence) setLoading(false); }
    };
    const session = () => { setLoading(Boolean(getAccessToken())); setChecked(!getAccessToken()); setState(undefined); setStatement(''); void refresh(); };
    const update = () => { void refresh(); };
    void refresh(); const timer = window.setInterval(update, 10000);
    window.addEventListener('session-changed', session); window.addEventListener('account-status-changed', update); window.addEventListener('focus', update);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('session-changed', session); window.removeEventListener('account-status-changed', update); window.removeEventListener('focus', update); };
  }, []);
  if (loading) return <main className="container section"><p role="status">Comprobando sesión…</p></main>;
  if (!checked) return <main className="container section"><p role="alert">{error || 'No se pudo comprobar tu sesión.'}</p><button onClick={() => window.location.reload()}>Reintentar</button><button onClick={clearAccessToken}>Cerrar sesión</button></main>;
  if (!suspended) return <>{children}</>;
  const appeal = state?.appeals.find((item) => item.caseId === state.suspension?.caseId);
  return <main className="container section suspension-view"><h1>Cuenta suspendida</h1><p>Tu cuenta tiene el acceso restringido mientras se revisa esta situación.</p>
    {state?.suspension ? <><p><strong>Motivo:</strong> {state.suspension.reason}</p><p>Fecha: {new Date(state.suspension.suspendedAt).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}</p></> : <p>Consultando el motivo de suspensión…</p>}
    <a href="#politicas-convivencia">Consultar políticas de convivencia</a>
    {appeal ? <article className="service-card"><h2>Tu apelación</h2><p>{appeal.statement}</p><p>Estado: {{ pending: 'En revisión', accepted: 'Aceptada', rejected: 'Rechazada' }[appeal.status] ?? appeal.status}</p>{appeal.decision && <p>Resolución: {appeal.decision}</p>}</article> : state?.suspension && <form className="moderation-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await moderationRequest('/appeals', { statement }); setState(await moderationRequest<SuspensionState>('/me')); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}><h2>Apelar suspensión</h2><label>Explica tu caso y proporciona evidencia<textarea required minLength={20} maxLength={4000} value={statement} onChange={(event) => setStatement(event.target.value)} /></label><button className="button" disabled={busy}>Enviar apelación</button></form>}
    {error && <p role="alert">{error}</p>}<button type="button" onClick={() => { void logoutSession().catch(() => {}).finally(() => navigate('/')); }}>Cerrar sesión</button>
    <section id="politicas-convivencia"><h2>Políticas de convivencia</h2><p>Trata a los demás con respeto. No se permiten acoso, discriminación, amenazas, suplantación ni cobros engañosos. Respeta los horarios acordados y comunica las cancelaciones. Protege los datos personales y utiliza la mensajería para coordinar las tutorías.</p><p>La administración revisa los reportes y la evidencia antes de tomar medidas. Una suspensión restringe las operaciones de la cuenta. Puedes presentar una apelación por cada suspensión; la administración debe justificar su resolución. Si se acepta, recuperarás el acceso.</p></section>
  </main>;
}
