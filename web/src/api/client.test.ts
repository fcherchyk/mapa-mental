import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

function stubFetch(status = 200, body: unknown = {}) {
  const fetchMock = vi.fn(
    async () =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const requestOf = (fetchMock: ReturnType<typeof stubFetch>, index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit];
  return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente de la API', () => {
  const mutations = [
    ['crear', (api: ReturnType<typeof createApiClient>) => api.createChild('n1', { title: 't' })],
    ['editar', (api: ReturnType<typeof createApiClient>) => api.updateNode('n1', { version: 1 })],
    ['borrar', (api: ReturnType<typeof createApiClient>) => api.deleteNode('n1')],
    ['settings', (api: ReturnType<typeof createApiClient>) => api.patchSettings({ depth: 4 })],
    ['logout', (api: ReturnType<typeof createApiClient>) => api.logout()],
  ] as const;

  it.each(mutations)(
    'criterio_2: la mutación %s va a /api/ con X-CSRF: 1 y misma credencial de origen',
    async (_, call) => {
      const fetchMock = stubFetch(200, {});
      await call(createApiClient());
      const { url, init, headers } = requestOf(fetchMock);
      expect(url.startsWith('/api/')).toBe(true);
      expect(headers['X-CSRF']).toBe('1');
      expect(init.credentials).toBe('same-origin');
    },
  );

  it('criterio_2: los GET no mandan X-CSRF', async () => {
    const fetchMock = stubFetch(200, {});
    const api = createApiClient();
    await api.getMe();
    await api.getView('n1', 3);
    expect(requestOf(fetchMock, 0).url).toBe('/api/me');
    expect(requestOf(fetchMock, 1).url).toBe('/api/nodes/n1/view?depth=3');
    expect(requestOf(fetchMock, 1).headers['X-CSRF']).toBeUndefined();
  });

  it('un 204 devuelve undefined', async () => {
    stubFetch(204);
    await expect(createApiClient().deleteNode('n1')).resolves.toBeUndefined();
  });

  it('deleteNode con reparent manda ?children=reparent y sin opciones no manda query', async () => {
    const fetchMock = stubFetch(204);
    const api = createApiClient();
    await api.deleteNode('n1');
    await api.deleteNode('n1', { children: 'reparent' });
    expect(requestOf(fetchMock, 0).url).toBe('/api/nodes/n1');
    expect(requestOf(fetchMock, 1).url).toBe('/api/nodes/n1?children=reparent');
  });

  it('un 401 avisa a onUnauthorized y rechaza con ApiError', async () => {
    stubFetch(401, { detail: 'sesión inválida o vencida' });
    const onUnauthorized = vi.fn();
    const error = await createApiClient(onUnauthorized).getMe().catch((e: unknown) => e);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'sesión inválida o vencida' });
  });

  it('un error sin detalle legible usa el código', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no es json', { status: 502 })),
    );
    await expect(createApiClient().getMe()).rejects.toMatchObject({
      status: 502,
      message: 'error 502',
    });
  });
});
