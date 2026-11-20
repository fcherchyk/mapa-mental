import { vi } from 'vitest';
import type {
  BoardPlace,
  BoardView,
  Me,
  NodeDetail,
  NodeOut,
  NodeView,
  PathEntry,
  TaskProps,
} from '../api/client';
import { DOCUMENT_KIND } from '../map/nodes/kinds';
import { defaultTaskProps, TASK_KIND } from '../map/nodes/taskProps';

export interface FakeNode {
  id: string;
  parent_id: string | null;
  title: string;
  sort_key: string;
  collapsed?: boolean;
  version?: number;
  description?: string;
  /** A document's Markdown body (slice 5); always empty for other kinds. */
  content?: string;
  kind?: string;
  props?: Record<string, unknown>;
  /** Board order (slice 4B); tasks without one get it in tree order, as the migration does. */
  board_rank?: number;
}

/** Kinds that take children, as `app/node_types` decides on the server (4A D3, 5 D1). */
function allowsChildren(kind: string): boolean {
  return kind !== TASK_KIND && kind !== DOCUMENT_KIND;
}

function propsFor(
  kind: string,
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (kind !== TASK_KIND) return props ?? {};
  return { ...defaultTaskProps(), ...(props as Partial<TaskProps>) };
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
      const kind = node.kind ?? 'idea';
      this.nodes.set(node.id, {
        collapsed: false,
        version: 1,
        description: '',
        content: '',
        board_rank: 0,
        ...node,
        kind,
        props: propsFor(kind, node.props),
      });
    }
    let rank = 0;
    for (const node of this.treeOrder()) {
      if (node.kind !== TASK_KIND) continue;
      rank += 1;
      const given = nodes.find((n) => n.id === node.id)?.board_rank;
      this.nodes.set(node.id, { ...node, board_rank: given ?? rank });
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
      /^\/api\/nodes\/([^/?]+)(\/view\?depth=(\d+)|\/children|\/move|\/board|\/board-move|\?children=(cascade|reparent))?$/,
    );
    const node = match && this.nodes.get(decodeURIComponent(match[1]));
    if (!match || !node) return json(404, { detail: 'node not found' });
    if (method === 'GET' && match[3]) return json(200, this.view(node.id, Number(match[3])));
    if (method === 'GET' && match[2] === '/board') return json(200, this.board(node.id));
    if (method === 'POST' && match[2] === '/board-move') return this.boardMove(node, call);
    if (method === 'GET' && !match[2]) return json(200, this.detail(node));
    if (method === 'POST' && match[2] === '/children') {
      if (!allowsChildren(node.kind))
        return json(422, { detail: `a ${node.kind} cannot have children` });
      return json(201, this.create(node, call));
    }
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

  /** The window never carries `board_rank` either: the API orders the board itself. */
  private out(node: Required<FakeNode>): NodeOut {
    const rest: Partial<Required<FakeNode>> = { ...node };
    delete rest.description;
    delete rest.content;
    delete rest.board_rank;
    return {
      ...(rest as Omit<Required<FakeNode>, 'description' | 'content' | 'board_rank'>),
      child_count: this.children(node.id).length,
    };
  }

  detail(node: Required<FakeNode>): NodeDetail {
    return {
      ...this.out(node),
      description: node.description,
      content: node.content,
      path: this.path(node),
    };
  }

  private path(node: Required<FakeNode>): PathEntry[] {
    const path: PathEntry[] = [];
    for (let id = node.parent_id; id; id = this.nodes.get(id)!.parent_id) {
      const ancestor = this.nodes.get(id)!;
      path.unshift({ id: ancestor.id, title: ancestor.title });
    }
    return path;
  }

  /** Every node, depth first, siblings by `sort_key`. */
  private treeOrder(): Required<FakeNode>[] {
    const walk = (id: string): Required<FakeNode>[] =>
      this.children(id).flatMap((child) => [child, ...walk(child.id)]);
    const root = this.nodes.get(this.rootId)!;
    return [root, ...walk(root.id)];
  }

  private rankedTasks(): Required<FakeNode>[] {
    return [...this.nodes.values()]
      .filter((node) => node.kind === TASK_KIND)
      .sort((a, b) => a.board_rank - b.board_rank || (a.id < b.id ? -1 : 1));
  }

  board(focusId: string): BoardView {
    const { focus, ancestors } = this.view(focusId, 1);
    const under = new Set(this.subtree(focusId));
    under.delete(focusId);
    const tasks = this.rankedTasks()
      .filter((task) => under.has(task.id))
      .map((task) => this.out(task));
    return { focus, ancestors, tasks };
  }

  /** A rank right before or after the task `place` names, or `null` if it is not a task. */
  private rankAt(place: BoardPlace, excludeId?: string): number | null {
    const anchorId = 'before_id' in place ? place.before_id : place.after_id;
    const anchor = this.nodes.get(anchorId);
    if (!anchor || anchor.kind !== TASK_KIND || anchor.id === excludeId) return null;
    const ranks = this.rankedTasks()
      .filter((task) => task.id !== excludeId)
      .map((task) => task.board_rank);
    const index = ranks.indexOf(anchor.board_rank);
    if ('before_id' in place) {
      const lower = ranks[index - 1];
      return lower === undefined ? anchor.board_rank - 1 : (lower + anchor.board_rank) / 2;
    }
    const upper = ranks[index + 1];
    return upper === undefined ? anchor.board_rank + 1 : (anchor.board_rank + upper) / 2;
  }

  /** Tree-order rank for a task that was just added (slice 4B, decision D3). */
  private treeOrderRank(id: string): number {
    const order = this.treeOrder().filter((node) => node.kind === TASK_KIND);
    const index = order.findIndex((node) => node.id === id);
    const before = order[index - 1];
    const after = order[index + 1];
    const ranks = this.rankedTasks()
      .filter((task) => task.id !== id)
      .map((task) => task.board_rank);
    if (before) {
      const next = ranks.find((rank) => rank > before.board_rank);
      return next === undefined ? before.board_rank + 1 : (before.board_rank + next) / 2;
    }
    if (after) {
      const previous = [...ranks].reverse().find((rank) => rank < after.board_rank);
      return previous === undefined ? after.board_rank - 1 : (previous + after.board_rank) / 2;
    }
    return 1;
  }

  private boardMove(node: Required<FakeNode>, call: RecordedCall): Response {
    const body = call.body as { status: string; place?: BoardPlace | null; version: number };
    if (node.kind !== TASK_KIND) return json(422, { detail: 'only a task can be moved' });
    if (body.version !== node.version) return json(409, { detail: 'the node changed' });
    let rank = node.board_rank;
    if (body.place) {
      const next = this.rankAt(body.place, node.id);
      if (next === null) return json(422, { detail: 'place must name another task' });
      rank = next;
    }
    const props = { ...node.props, status: body.status };
    const updated = { ...node, props, board_rank: rank, version: node.version + 1 };
    this.nodes.set(node.id, updated);
    return json(200, this.out(updated));
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
    const body = call.body as {
      title: string;
      after_sort_key?: string;
      kind?: string;
      props?: Record<string, unknown>;
      board_place?: BoardPlace;
    };
    const kind = body.kind ?? 'idea';
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
      content: '',
      kind,
      props: propsFor(kind, body.props),
      board_rank: 0,
    };
    this.nodes.set(node.id, node);
    if (kind === TASK_KIND) {
      const rank = body.board_place ? this.rankAt(body.board_place) : this.treeOrderRank(node.id);
      this.nodes.set(node.id, { ...node, board_rank: rank ?? this.treeOrderRank(node.id) });
    }
    return this.out(this.nodes.get(node.id)!);
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
    if (!allowsChildren(parent.kind)) {
      return json(422, { detail: `a ${parent.kind} cannot have children` });
    }
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
      content?: string;
      collapsed?: boolean;
      kind?: string;
      props?: Record<string, unknown>;
    };
    // `kind` is not a patchable field (slice 4A, decision D2).
    if (body.kind !== undefined) return json(422, { detail: 'unknown field: kind' });
    // Only a document has content, and it has no description (slice 5, decision D3).
    const isDocument = node.kind === DOCUMENT_KIND;
    if (body.content !== undefined && !isDocument) {
      return json(422, { detail: 'only a document has content' });
    }
    if (body.description !== undefined && isDocument) {
      return json(422, { detail: 'a document has no description' });
    }
    if (body.version !== node.version) return json(409, { detail: 'the node changed' });
    const unchanged =
      body.content !== undefined &&
      body.content === node.content &&
      Object.keys(body).every((key) => key === 'version' || key === 'content');
    if (unchanged) return json(200, this.detail(node));
    const updated = {
      ...node,
      title: body.title ?? node.title,
      description: body.description ?? node.description,
      content: body.content ?? node.content,
      collapsed: body.collapsed ?? node.collapsed,
      props: body.props ?? node.props,
      version: node.version + 1,
    };
    this.nodes.set(node.id, updated);
    return json(200, this.detail(updated));
  }
}
