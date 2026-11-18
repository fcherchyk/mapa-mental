import type { NodeDetail, NodeOut, PathEntry } from '../api/client';

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

  /**
   * A node that was just created has an empty description: no need to ask for it. Its path is
   * known to the caller, which has the parent's ancestors on screen (slice 4B, decision D12).
   */
  setCreated(node: NodeOut, path: PathEntry[]): void {
    this.set({ ...withoutDescription(node), description: '', path });
  }

  delete(id: string): void {
    this.details.delete(id);
  }

  /** A renamed node may be on other nodes' paths: only its own detail stays (slice 4B, D12). */
  keepOnly(id: string): void {
    const kept = this.details.get(id);
    this.details.clear();
    if (kept) this.details.set(id, kept);
  }
}

/** `PATCH` answers with a `NodeDetail`; the window's nodes must not carry the description. */
export function withoutDescription<T extends NodeOut>(node: T): NodeOut {
  const rest: NodeOut & { description?: string } = { ...node };
  delete rest.description;
  return rest;
}
