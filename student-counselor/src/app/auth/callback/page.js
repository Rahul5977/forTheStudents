'use client';
// OAuth / Hosted-UI return URL — a registered Cognito callback (see auth-stack.ts
// callbackUrls). Google (and any federated) sign-in lands here with the id_token in the
// URL fragment (implicit flow; liveAuth.federatedLoginUrl). We capture it, then hard-nav
// into the app so the store hydrates from the stored token and the auth gate routes to the
// right dashboard. Falls back to /login if no token came back.
import { useEffect } from 'react';
import { captureCognitoRedirect, getToken } from '@/lib/liveAuth';

export default function AuthCallback() {
  useEffect(() => {
    captureCognitoRedirect(); // pulls id_token out of the #fragment into localStorage
    window.location.replace(getToken() ? '/dashboard/' : '/login/');
  }, []);
  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-body)' }}>
      <p className="text-muted">Signing you in…</p>
    </main>
  );
}
