import type { components } from './schema';

export type Me = components['schemas']['MeOut'];
export type UserSettings = components['schemas']['UserSettings'];
export type NodeOut = components['schemas']['NodeOut'];
export type NodeView = components['schemas']['NodeView'];
export type NodeCreate = components['schemas']['NodeCreate'];
export type NodePatch = components['schemas']['NodePatch'];

export const API_PREFIX = '/api';
export const LOGIN_URL = `${API_PREFIX}/auth/login`;
// The API rejects every mutation without this header (ADR 0006).
export const CSRF_HEADERS = { 'X-CSRF': '1' } as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** `cascade` deletes the subtree; `reparent` moves the direct children up to the deleted node's parent. */
export interface DeleteOptions {
  children?: 'cascade' | 'reparent';
}

type Method ='GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiClient {
  getMe(): Promise<Me>;
  logout(): Promise<void>;
  patchSettings(settings: { depth: number }): Promise<UserSettings>;
  getView(nodeId: string, depth: number): Promise<NodeView>;
  createChild(parentId: string, data: NodeCreate): Promise<NodeOut>;
  updateNode(nodeId: string, patch: NodePatch): Promise<NodeOut>;
  deleteNode(nodeId: string, options?: DeleteOptions): Promise<void>;
}

/** API client; `onUnauthorized` is called on any 401 (expired session). */
export function createApiClient(onUnauthorized: () => void = () => {}): ApiClient {
  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = method === 'GET' ? {} : { ...CSRF_HEADERS };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API_PREFIX}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401) onUnauthorized();
    if (!response.ok) throw new ApiError(response.status, await errorDetail(response));
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const node = (id: string) => `/nodes/${encodeURIComponent(id)}`;

  return {
    getMe: () => request('GET', '/me'),
    logout: () => request('POST', '/auth/logout'),
    patchSettings: (settings) => request('PATCH', '/me/settings', settings),
    getView: (nodeId, depth) => request('GET', `${node(nodeId)}/view?depth=${depth}`),
    createChild: (parentId, data) => request('POST', `${node(parentId)}/children`, data),
    updateNode: (nodeId, patch) => request('PATCH', node(nodeId), patch),
    deleteNode: (nodeId, options) =>
      request('DELETE', `${node(nodeId)}${options?.children === 'reparent' ? '?children=reparent' : ''}`),
  };
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    return typeof data.detail === 'string' ? data.detail : `error ${response.status}`;
  } catch {
    return `error ${response.status}`;
  }
}
