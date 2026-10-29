// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig, { CONTENT_SECURITY_POLICY } from '../vite.config';

const webDir = resolve(__dirname, '..');
const repoFile = (path: string) => readFileSync(resolve(webDir, '..', path), 'utf-8');
const config = viteConfig as UserConfig & {
  test: { coverage: { thresholds: { lines: number } } };
};

/** Bloque del servicio `name` dentro de docker-compose.yml (hasta el siguiente servicio). */
function composeService(name: string): string {
  const compose = repoFile('docker-compose.yml');
  const match = compose.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  \\w[\\w-]*:\\n|\\nvolumes:)`));
  return match?.[1] ?? '';
}

describe('entorno', () => {
  it('criterio_1: docker compose publica web solo en 127.0.0.1:5173 con proxy hacia la api', () => {
    const web = composeService('web');
    expect(web).toContain('"127.0.0.1:5173:5173"');
    expect(web).toContain('API_PROXY_TARGET: http://api:8000');
    expect(web).toMatch(/node_modules/);
  });

  it('criterio_1: Vite escucha en 0.0.0.0:5173 y reenvía /api sin reescribir', () => {
    expect(config.server?.host).toBe('0.0.0.0');
    expect(config.server?.port).toBe(5173);
    const proxy = config.server?.proxy as Record<string, { target: string; rewrite?: unknown }>;
    expect(proxy['/api'].target).toMatch(/:8000$/);
    expect(proxy['/api'].rewrite).toBeUndefined();
  });

  it('criterio_1: se versiona pnpm-lock.yaml y no node_modules', () => {
    expect(existsSync(resolve(webDir, 'pnpm-lock.yaml'))).toBe(true);
    expect(repoFile('.gitignore').split('\n')).toContain('node_modules/');
  });

  it('criterio_17: el servidor de la SPA manda Content-Security-Policy', () => {
    const headers = config.server?.headers as Record<string, string>;
    expect(headers['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
  });

  it('criterio_18: la cobertura de líneas exige al menos 80%', () => {
    expect(config.test.coverage.thresholds.lines).toBe(80);
  });
});
