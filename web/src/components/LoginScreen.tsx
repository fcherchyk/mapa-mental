import { LOGIN_URL } from '../api/client';

/** Login is a full navigation: the backend does the OAuth with Google (ADR 0006). */
export function LoginScreen() {
  return (
    <main className="centered-screen">
      <h1>Mind Map</h1>
      <p>Sign in with your Google account to see your map.</p>
      <a className="button" href={LOGIN_URL}>
        Sign in with Google
      </a>
    </main>
  );
}
