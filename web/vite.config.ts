/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Inside docker compose the proxy points at `api:8000`; outside, at the local API.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

// The dev server needs 'unsafe-inline' in script-src for the React Refresh preamble, and the
// HMR WebSocket in connect-src. No 'unsafe-eval' and no external origins.
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
    // No changeOrigin: the Host stays localhost:5173 and the cookie stays on that origin.
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
