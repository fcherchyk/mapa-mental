import type { MapState } from './tree';

export function cacheKey(nodeId: string, depth: number): string {
  return `${nodeId}:${depth}`;
}

/** Already visited windows, keyed by (nodeId, N) (ADRs 0010 and 0012). */
export class ViewCache {
  private readonly entries = new Map<string, MapState>();

  get(key: string): MapState | undefined {
    return this.entries.get(key);
  }

  set(key: string, state: MapState): void {
    this.entries.set(key, state);
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
