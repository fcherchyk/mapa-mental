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

/** Block of the `name` service inside docker-compose.yml (up to the next service). */
function composeService(name: string): string {
  const compose = repoFile('docker-compose.yml');
  const match = compose.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  \\w[\\w-]*:\\n|\\nvolumes:)`));
  return match?.[1] ?? '';
}

describe('environment', () => {
  it('S1_FE_AC1: docker compose publishes web only on 127.0.0.1:5173 with a proxy to the api', () => {
    const web = composeService('web');
    expect(web).toContain('"127.0.0.1:5173:5173"');
    expect(web).toContain('API_PROXY_TARGET: http://api:8000');
    expect(web).toMatch(/node_modules/);
  });

  it('S1_FE_AC1: Vite listens on 0.0.0.0:5173 and forwards /api without rewriting', () => {
    expect(config.server?.host).toBe('0.0.0.0');
    expect(config.server?.port).toBe(5173);
    const proxy = config.server?.proxy as Record<string, { target: string; rewrite?: unknown }>;
    expect(proxy['/api'].target).toMatch(/:8000$/);
    expect(proxy['/api'].rewrite).toBeUndefined();
  });

  it('S1_FE_AC1: pnpm-lock.yaml is versioned and node_modules is not', () => {
    expect(existsSync(resolve(webDir, 'pnpm-lock.yaml'))).toBe(true);
    expect(repoFile('.gitignore').split('\n')).toContain('node_modules/');
  });

  it('S1_FE_AC35: the SPA server sends Content-Security-Policy', () => {
    const headers = config.server?.headers as Record<string, string>;
    expect(headers['Content-Security-Policy']).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval');
  });

  it('S1_FE_AC36: line coverage requires at least 80%', () => {
    expect(config.test.coverage.thresholds.lines).toBe(80);
  });

  it('S2_FE_AC20: the move suite runs under the same coverage threshold', () => {
    expect(existsSync(resolve(webDir, 'src/move.test.tsx'))).toBe(true);
    expect(existsSync(resolve(webDir, 'src/map/dropTarget.test.ts'))).toBe(true);
    expect(config.test.coverage.thresholds.lines).toBe(80);
  });

  it('S3_FE_AC22: the details panel suite runs under the same coverage threshold', () => {
    expect(existsSync(resolve(webDir, 'src/detailsPanel.test.tsx'))).toBe(true);
    expect(config.test.coverage.thresholds.lines).toBe(80);
  });

  it('S4A_FE_AC25: the task suites run under the same coverage threshold', () => {
    expect(existsSync(resolve(webDir, 'src/tasks.test.tsx'))).toBe(true);
    expect(existsSync(resolve(webDir, 'src/taskPanel.test.tsx'))).toBe(true);
    expect(config.test.coverage.thresholds.lines).toBe(80);
  });
});
