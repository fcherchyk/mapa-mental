import { vi } from 'vitest';
import type { Me, NodeDetail, NodeOut, NodeView } from '../api/client';

export interface FakeNode {
  id: string;
  parent_id: string | null;
  title: string;
  sort_key: string;
  collapsed?: boolean;
  version?: number;
  description?: string;
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

/** In-memory API with the same shape as the real one; records every request it gets. */
export class FakeApi {
  readonly nodes = new Map<string, Required<FakeNode>>();
  readonly calls: RecordedCall[] = [];
  private readonly overrides: Override[] = [];
  loggedIn = true;
  depth = 3;
  private created = 0;

  constructor(nodes: FakeNode[]) {
    for (const node of nodes) {
      this.nodes.set(node.id, { collapsed: false, version: 1, description: '', ...node });
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

  /** The next request that satisfies `match` gets a `status` error response. */
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
    if (!this.loggedIn) return json(401, { detail: 'invalid or expired session' });
    if (method === 'GET' && url === '/api/me') return json(200, this.me());
    if (method === 'PATCH' && url === '/api/me/settings') {
      this.depth = (call.body as { depth: number }).depth;
      return json(200, { depth: this.depth });
    }
    const match = url.match(
      /^\/api\/nodes\/([^/?]+)(\/view\?depth=(\d+)|\/children|\/move|\?children=(cascade|reparent))?$/,
    );
    const node = match && this.nodes.get(decodeURIComponent(match[1]));
    if (!match || !node) return json(404, { detail: 'node not found' });
    if (method === 'GET' && match[3]) return json(200, this.view(node.id, Number(match[3])));
    if (method === 'GET' && !match[2]) return json(200, this.detail(node));
    if (method === 'POST' && match[2] === '/children') return json(201, this.create(node, call));
    if (method === 'POST' && match[2] === '/move') return this.move(node, call);
    if (method === 'PATCH') return this.patch(node, call);
    if (method === 'DELETE') {
      if (match[4] === 'reparent') this.reparentChildren(node);
      this.subtree(node.id).forEach((id) => this.nodes.delete(id));
      return new Response(null, { status: 204 });
    }
    return json(405, { detail: 'method not supported' });
  }

  children(id: string): Required<FakeNode>[] {
    return [...this.nodes.values()]
      .filter((node) => node.parent_id === id)
      .sort((a, b) => (a.sort_key < b.sort_key ? -1 : 1));
  }

  /** Children move to the parent; the node's key as a prefix keeps them in place and in order. */
  private reparentChildren(node: Required<FakeNode>): void {
    for (const child of this.children(node.id)) {
      this.nodes.set(child.id, {
        ...child,
        parent_id: node.parent_id,
        sort_key: `${node.sort_key}${child.sort_key}`,
        version: child.version + 1,
      });
    }
  }

  private subtree(id: string): string[] {
    return [id, ...this.children(id).flatMap((child) => this.subtree(child.id))];
  }

  /** The window never carries the description (slice 3, decision D2). */
  private out(node: Required<FakeNode>): NodeOut {
    const rest: Partial<Required<FakeNode>> = { ...node };
    delete rest.description;
    return {
      ...(rest as Omit<Required<FakeNode>, 'description'>),
      kind: 'idea',
      props: {},
      child_count: this.children(node.id).length,
    };
  }

  detail(node: Required<FakeNode>): NodeDetail {
    return { ...this.out(node), description: node.description };
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
      description: '',
    };
    this.nodes.set(node.id, node);
    return this.out(node);
  }

  /**
   * Moves the node under `parent_id` at `place`. The destination's children are renumbered, which
   * is not what the real API does (it only writes the moved row) but keeps the order readable.
   */
  private move(node: Required<FakeNode>, call: RecordedCall): Response {
    const body = call.body as {
      parent_id: string;
      place: 'first' | 'last' | { after_id: string };
      version: number;
    };
    if (body.version !== node.version) return json(409, { detail: 'the node changed' });
    const parent = this.nodes.get(body.parent_id);
    if (!parent) return json(404, { detail: 'node not found' });
    const siblings = this.children(parent.id).filter((sibling) => sibling.id !== node.id);
    const place = body.place;
    let index = siblings.length;
    if (place === 'first') {
      index = 0;
    } else if (typeof place === 'object') {
      const after = siblings.findIndex((sibling) => sibling.id === place.after_id);
      if (after === -1) return json(422, { detail: 'after_id must be a child of parent_id' });
      index = after + 1;
    }
    const ordered = [...siblings.slice(0, index), node, ...siblings.slice(index)];
    ordered.forEach((child, position) => {
      this.nodes.set(child.id, {
        ...child,
        parent_id: parent.id,
        sort_key: `k${String(position).padStart(3, '0')}`,
        version: child.id === node.id ? child.version + 1 : child.version,
      });
    });
    return json(200, this.out(this.nodes.get(node.id)!));
  }

  private patch(node: Required<FakeNode>, call: RecordedCall): Response {
    const body = call.body as {
      version: number;
      title?: string;
      description?: string;
      collapsed?: boolean;
    };
    if (body.version !== node.version) return json(409, { detail: 'the node changed' });
    const updated = {
      ...node,
      title: body.title ?? node.title,
      description: body.description ?? node.description,
      collapsed: body.collapsed ?? node.collapsed,
      version: node.version + 1,
    };
    this.nodes.set(node.id, updated);
    return json(200, this.detail(updated));
  }
}
