import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="centered-screen">
      <h1>No encontrado</h1>
      <p>Ese nodo no existe o no es tuyo.</p>
      <Link to="/">Volver al inicio</Link>
    </main>
  );
}
