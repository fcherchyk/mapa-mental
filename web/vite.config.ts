/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dentro de docker compose el proxy apunta a `api:8000`; fuera, a la API local.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// El servidor de desarrollo necesita 'unsafe-inline' en script-src por el preámbulo de React
// Refresh, y el WebSocket del HMR en connect-src. Nada de 'unsafe-eval' ni orígenes externos.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' ws://localhost:5173",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = { 'Content-Security-Policy': CONTENT_SECURITY_POLICY };

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    headers: securityHeaders,
    // Sin changeOrigin: el Host sigue siendo localhost:5173 y la cookie queda en ese origen.
    proxy: { '/api': { target: apiTarget } },
  },
  preview: { headers: securityHeaders },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/api/schema.ts', 'src/main.tsx'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80 },
    },
  },
});
