// Configuration for the LIVE backend integration (the /live page).
// Everything is env-driven so the same build works against local dev or AWS.
//
// Dev (default, no env needed): talks to the local auth-identity dev server.
// Cognito: set AUTH_MODE=cognito + the Cognito Hosted-UI values after `pnpm deploy:dev`.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8787';

export const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || 'dev'; // 'dev' | 'cognito'

export const COGNITO = {
  // e.g. https://sc-dev-auth.auth.ap-south-1.amazoncognito.com
  domain: (process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '').replace(/\/$/, ''),
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
  // User pool id — needed for the direct (non-Hosted-UI) email/password SDK flow.
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  // Where the Hosted UI sends the user back. Must be in the client's callback URLs.
  redirectUri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT || '',
};

export const isCognito = () => AUTH_MODE === 'cognito';

// When 'on', the main predictor screen fetches REAL results from the catalog API
// (official JoSAA cutoffs) instead of the local dummy dataset.
export const PREDICTOR_API = process.env.NEXT_PUBLIC_PREDICTOR_API === 'on';
