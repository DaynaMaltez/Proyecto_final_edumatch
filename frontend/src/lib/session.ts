// This expiry hint only schedules the UI logout. The backend always verifies
// the signature, issuer, audience, expiry, revocation and current account status.
export function tokenExpirationMilliseconds(token: string): number | null {
  try {
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const payload = JSON.parse(atob(segments[1].replace(/-/g, '+').replace(/_/g, '/')));
    return Number.isSafeInteger(payload.exp) && payload.exp > 0 && Number.isSafeInteger(payload.exp * 1000) ? payload.exp * 1000 : null;
  } catch { return null; }
}
