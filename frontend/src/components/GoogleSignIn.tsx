import { useEffect, useState } from 'react';
import { loginWithGoogle } from '../lib/api';

type GoogleCredentialResponse = { credential?: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback(response: GoogleCredentialResponse): void }): void;
          renderButton(element: HTMLElement, options: { theme: 'outline'; size: 'large'; text: 'signin_with' | 'signup_with'; shape: 'rectangular'; width: number }): void;
        };
      };
    };
  }
}

type GoogleSignInProps = { intent: 'login' | 'register'; onAuthenticated: () => void };

export default function GoogleSignIn({ intent, onAuthenticated }: GoogleSignInProps) {
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) {
      setError('Falta configurar VITE_GOOGLE_CLIENT_ID para activar el acceso con Google.');
      return;
    }

    const button = document.getElementById('google-sign-in-button');
    if (!button) return;
    let active = true;
    let authenticating = false;
    const initialize = () => {
      if (!active || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (!active || authenticating) return;
          if (!response.credential) { setError('Google no devolvió una credencial válida.'); return; }
          authenticating = true;
          setWorking(true);
          setError('');
          loginWithGoogle(response.credential)
            .then(() => { if (active) onAuthenticated(); })
            .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); })
            .finally(() => { authenticating = false; if (active) setWorking(false); });
        },
      });
      window.google.accounts.id.renderButton(button, {
        theme: 'outline', size: 'large', text: intent === 'register' ? 'signup_with' : 'signin_with', shape: 'rectangular', width: 300,
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-edumatch-google]');
    if (window.google) initialize();
    else if (existingScript) existingScript.addEventListener('load', initialize, { once: true });
    else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.edumatchGoogle = 'true';
      script.addEventListener('load', initialize, { once: true });
      script.addEventListener('error', () => { script.remove(); if (active) setError('No se pudo cargar el acceso de Google. Cierra y vuelve a abrir esta ventana para reintentar.'); }, { once: true });
      document.head.append(script);
    }
    return () => { active = false; };
  }, [clientId, intent, onAuthenticated]);

  return <div className="google-sign-in">
    <p>{intent === 'register' ? 'Regístrate o inicia sesión con tu cuenta de Google.' : 'Continúa con tu cuenta de Google.'}</p>
    <div id="google-sign-in-button" />
    {working && <p role="status">Validando tu cuenta…</p>}
    {error && <p className="profile-message profile-message--error" role="alert">{error}</p>}
  </div>;
}
