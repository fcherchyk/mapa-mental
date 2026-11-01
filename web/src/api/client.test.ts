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

describe('API client', () => {
  const mutations = [
    ['create', (api: ReturnType<typeof createApiClient>) => api.createChild('n1', { title: 't' })],
    ['update', (api: ReturnType<typeof createApiClient>) => api.updateNode('n1', { version: 1 })],
    ['delete', (api: ReturnType<typeof createApiClient>) => api.deleteNode('n1')],
    ['settings', (api: ReturnType<typeof createApiClient>) => api.patchSettings({ depth: 4 })],
    ['logout', (api: ReturnType<typeof createApiClient>) => api.logout()],
  ] as const;

  it.each(mutations)(
    'criterion_2: the %s mutation goes to /api/ with X-CSRF: 1 and same-origin credentials',
    async (_, call) => {
      const fetchMock = stubFetch(200, {});
      await call(createApiClient());
      const { url, init, headers } = requestOf(fetchMock);
      expect(url.startsWith('/api/')).toBe(true);
      expect(headers['X-CSRF']).toBe('1');
      expect(init.credentials).toBe('same-origin');
    },
  );

  it('criterion_2: GET requests do not send X-CSRF', async () => {
    const fetchMock = stubFetch(200, {});
    const api = createApiClient();
    await api.getMe();
    await api.getView('n1', 3);
    expect(requestOf(fetchMock, 0).url).toBe('/api/me');
    expect(requestOf(fetchMock, 1).url).toBe('/api/nodes/n1/view?depth=3');
    expect(requestOf(fetchMock, 1).headers['X-CSRF']).toBeUndefined();
  });

  it('a 204 returns undefined', async () => {
    stubFetch(204);
    await expect(createApiClient().deleteNode('n1')).resolves.toBeUndefined();
  });

  it('deleteNode with reparent sends ?children=reparent and without options sends no query', async () => {
    const fetchMock = stubFetch(204);
    const api = createApiClient();
    await api.deleteNode('n1');
    await api.deleteNode('n1', { children: 'reparent' });
    expect(requestOf(fetchMock, 0).url).toBe('/api/nodes/n1');
    expect(requestOf(fetchMock, 1).url).toBe('/api/nodes/n1?children=reparent');
  });

  it('a 401 notifies onUnauthorized and rejects with ApiError', async () => {
    stubFetch(401, { detail: 'invalid or expired session' });
    const onUnauthorized = vi.fn();
    const error = await createApiClient(onUnauthorized).getMe().catch((e: unknown) => e);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'invalid or expired session' });
  });

  it('an error without a readable detail uses the status code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 502 })),
    );
    await expect(createApiClient().getMe()).rejects.toMatchObject({
      status: 502,
      message: 'error 502',
    });
  });
});
