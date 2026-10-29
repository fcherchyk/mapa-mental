import { vi } from 'vitest';
import type { Me, NodeOut, NodeView } from '../api/client';

export interface FakeNode {
  id: string;
  parent_id: string | null;
  title: string;
  sort_key: string;
  collapsed?: boolean;
  version?: number;
}

export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Override = (call: RecordedCall) => Response | undefined;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** API en memoria con la misma forma que la real; registra cada pedido que recibe. */
export class FakeApi {
  readonly nodes = new Map<string, Required<FakeNode>>();
  readonly calls: RecordedCall[] = [];
  private readonly overrides: Override[] = [];
  loggedIn = true;
  depth = 3;
  private created = 0;

  constructor(nodes: FakeNode[]) {
    for (const node of nodes) {
      this.nodes.set(node.id, { collapsed: false, version: 1, ...node });
    }
  }

  get rootId(): string {
    return [...this.nodes.values()].find((node) => node.parent_id === null)!.id;
  }

  me(): Me {
    return {
      id: 'user-1',
      email: 'ana@example.com',
      name: 'Ana',
      avatar_url: null,
      settings: { depth: this.depth },
      root_node_id: this.rootId,
    };
  }

  /** La próxima respuesta que cumpla `match` es `response` (por ejemplo, un error). */
  failNext(match: (call: RecordedCall) => boolean, status: number): void {
    const override: Override = (call) => {
      if (!match(call)) return undefined;
      this.overrides.splice(this.overrides.indexOf(override), 1);
      return json(status, { detail: `error ${status}` });
    };
    this.overrides.push(override);
  }

  callsTo(method: string, pattern: string | RegExp): RecordedCall[] {
    return this.calls.filter(
      (call) =>
        call.method === method &&
        (typeof pattern === 'string' ? call.url === pattern : pattern.test(call.url)),
    );
  }

  readonly fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      method: init.method ?? 'GET',
      url: String(input),
      headers: { ...(init.headers as Record<string, string>) },
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    this.calls.push(call);
    for (const override of [...this.overrides]) {
      const response = override(call);
      if (response) return response;
    }
    return this.handle(call);
  });

  private handle(call: RecordedCall): Response {
    const { method, url } = call;
    if (method === 'POST' && url === '/api/auth/logout') {
      this.loggedIn = false;
      return new Response(null, { status: 204 });
    }
    if (!this.loggedIn) return json(401, { detail: 'sesión inválida o vencida' });
    if (method === 'GET' && url === '/api/me') return json(200, this.me());
    if (method === 'PATCH' && url === '/api/me/settings') {
      this.depth = (call.body as { depth: number }).depth;
      return json(200, { depth: this.depth });
    }
    const match = url.match(/^\/api\/nodes\/([^/?]+)(\/view\?depth=(\d+)|\/children)?$/);
    const node = match && this.nodes.get(decodeURIComponent(match[1]));
    if (!match || !node) return json(404, { detail: 'nodo inexistente' });
    if (method === 'GET' && match[3]) return json(200, this.view(node.id, Number(match[3])));
    if (method === 'POST' && match[2] === '/children') return json(201, this.create(node, call));
    if (method === 'PATCH') return this.patch(node, call);
    if (method === 'DELETE') {
      this.subtree(node.id).forEach((id) => this.nodes.delete(id));
      return new Response(null, { status: 204 });
    }
    return json(405, { detail: 'método no soportado' });
  }

  children(id: string): Required<FakeNode>[] {
    return [...this.nodes.values()]
      .filter((node) => node.parent_id === id)
      .sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
  }

  private subtree(id: string): string[] {
    return [id, ...this.children(id).flatMap((child) => this.subtree(child.id))];
  }

  private out(node: Required<FakeNode>): NodeOut {
    return {
      ...node,
      kind: 'idea',
      props: {},
      child_count: this.children(node.id).length,
    };
  }

  view(focusId: string, depth: number): NodeView {
    const focus = this.nodes.get(focusId)!;
    const nodes: NodeView['nodes'] = [];
    let level = [focus];
    for (let distance = 1; distance <= depth; distance++) {
      level = level.filter((node) => !node.collapsed).flatMap((node) => this.children(node.id));
      nodes.push(...level.map((node) => ({ ...this.out(node), level: distance })));
    }
    const ancestors: NodeOut[] = [];
    for (let id = focus.parent_id; id; id = this.nodes.get(id)!.parent_id) {
      ancestors.unshift(this.out(this.nodes.get(id)!));
    }
    return { focus: this.out(focus), ancestors, nodes };
  }

  private create(parent: Required<FakeNode>, call: RecordedCall): NodeOut {
    const body = call.body as { title: string; after_sort_key?: string };
    const siblings = this.children(parent.id);
    const last = siblings[siblings.length - 1]?.sort_key;
    this.created += 1;
    const node = {
      id: `new-${this.created}`,
      parent_id: parent.id,
      title: body.title,
      sort_key: body.after_sort_key ? `${body.after_sort_key}V` : `${last ?? ''}V`,
      collapsed: false,
      version: 1,
    };
    this.nodes.set(node.id, node);
    return this.out(node);
  }

  private patch(node: Required<FakeNode>, call: RecordedCall): Response {
    const body = call.body as { version: number; title?: string; collapsed?: boolean };
    if (body.version !== node.version) return json(409, { detail: 'el nodo cambió' });
    const updated = {
      ...node,
      title: body.title ?? node.title,
      collapsed: body.collapsed ?? node.collapsed,
      version: node.version + 1,
    };
    this.nodes.set(node.id, updated);
    return json(200, this.out(updated));
  }
}
