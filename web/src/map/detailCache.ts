import type { NodeDetail, NodeOut } from '../api/client';

/**
 * Node details (today, the description) by id. The window never carries them (slice 3,
 * decision D2): they are read once with `GET /nodes/{id}` and then kept fresh by every `PATCH`.
 */
export class DetailCache {
  private readonly details = new Map<string, NodeDetail>();

  get(id: string): NodeDetail | undefined {
    return this.details.get(id);
  }

  set(detail: NodeDetail): void {
    this.details.set(detail.id, detail);
  }

  /** A node that was just created has an empty description: no need to ask for it. */
  setCreated(node: NodeOut): void {
    this.set({ ...withoutDescription(node), description: '' });
  }

  delete(id: string): void {
    this.details.delete(id);
  }
}

/** `PATCH` answers with a `NodeDetail`; the window's nodes must not carry the description. */
export function withoutDescription<T extends NodeOut>(node: T): NodeOut {
  const rest: NodeOut & { description?: string } = { ...node };
  delete rest.description;
  return rest;
}
