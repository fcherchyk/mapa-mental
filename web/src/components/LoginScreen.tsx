import { LOGIN_URL } from '../api/client';

/** El login es una navegación completa: el backend hace el OAuth con Google (ADR 0006). */
export function LoginScreen() {
  return (
    <main className="centered-screen">
      <h1>Mapa mental</h1>
      <p>Entrá con tu cuenta de Google para ver tu mapa.</p>
      <a className="button" href={LOGIN_URL}>
        Entrar con Google
      </a>
    </main>
  );
}
