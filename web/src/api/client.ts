import type { components } from './schema';

export type Me = components['schemas']['MeOut'];
export type UserSettings = components['schemas']['UserSettings'];
export type NodeOut = components['schemas']['NodeOut'];
export type NodeDetail = components['schemas']['NodeDetail'];
export type NodeView = components['schemas']['NodeView'];
export type NodeCreate = components['schemas']['NodeCreate'];
export type NodePatch = components['schemas']['NodePatch'];
export type NodeMove = components['schemas']['NodeMove'];
/** Where a node lands among its new siblings: first, last, or right after a given one. */
export type Place = NodeMove['place'];
export type BoardView = components['schemas']['BoardView'];
export type BoardMove = components['schemas']['BoardMove'];
export type PathEntry = components['schemas']['PathEntry'];
/** A card's position in the map's board order: right before or right after another task (slice 4B). */
export type BoardPlace = NonNullable<BoardMove['place']>;

/**
 * A task's `props` (slice 4A, decision D1). `props` is `dict[str, Any]` in the OpenAPI document,
 * because it is validated per kind on the server (ADR 0013), so these types are written by hand
 * and must stay in step with `api/app/node_types`.
 */
export type TaskStatus = 'to_do' | 'in_progress' | 'done';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskProps {
  status: TaskStatus;
  checklist: ChecklistItem[];
}

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

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiClient {
  getMe(): Promise<Me>;
  logout(): Promise<void>;
  patchSettings(settings: { depth: number }): Promise<UserSettings>;
  getView(nodeId: string, depth: number): Promise<NodeView>;
  getBoard(nodeId: string): Promise<BoardView>;
  getNode(nodeId: string): Promise<NodeDetail>;
  createChild(parentId: string, data: NodeCreate): Promise<NodeOut>;
  updateNode(nodeId: string, patch: NodePatch): Promise<NodeDetail>;
  moveNode(nodeId: string, move: NodeMove): Promise<NodeOut>;
  boardMove(nodeId: string, move: BoardMove): Promise<NodeOut>;
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
    getBoard: (nodeId) => request('GET', `${node(nodeId)}/board`),
    getNode: (nodeId) => request('GET', node(nodeId)),
    createChild: (parentId, data) => request('POST', `${node(parentId)}/children`, data),
    updateNode: (nodeId, patch) => request('PATCH', node(nodeId), patch),
    moveNode: (nodeId, move) => request('POST', `${node(nodeId)}/move`, move),
    boardMove: (nodeId, move) => request('POST', `${node(nodeId)}/board-move`, move),
    deleteNode: (nodeId, options) =>
      request(
        'DELETE',
        `${node(nodeId)}${options?.children === 'reparent' ? '?children=reparent' : ''}`,
      ),
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
