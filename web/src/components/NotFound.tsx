import { Link } from 'react-router';

export function NotFound() {
  return (
    <main className="centered-screen">
      <h1>Not found</h1>
      <p>That idea does not exist or is not yours.</p>
      <Link to="/">Back to the start</Link>
    </main>
  );
}
