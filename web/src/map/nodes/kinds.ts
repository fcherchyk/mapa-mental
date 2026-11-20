import type { NodeOut } from '../../api/client';

/** Node kinds the SPA knows; they mirror `api/app/node_types` (ADR 0013). */
export const DEFAULT_KIND = 'idea';
export const TASK_KIND = 'task';
export const DOCUMENT_KIND = 'document';

/** Kinds that cannot be a parent (slice 4A, D3; slice 5, D1). The API enforces it too. */
const LEAF_KINDS = new Set<string>([TASK_KIND, DOCUMENT_KIND]);

export function allowsChildren(kind: string): boolean {
  return !LEAF_KINDS.has(kind);
}

export function isDocument(node: Pick<NodeOut, 'kind'> | undefined): boolean {
  return node?.kind === DOCUMENT_KIND;
}

/** The word for a kind in labels: "New task title", "Document details". */
export const KIND_NAMES: Record<string, string> = {
  [DEFAULT_KIND]: 'idea',
  [TASK_KIND]: 'task',
  [DOCUMENT_KIND]: 'document',
};

export function kindName(kind: string): string {
  return KIND_NAMES[kind] ?? KIND_NAMES[DEFAULT_KIND];
}

export function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * What the kind menu offers, in order; the number key that picks an entry is its position
 * (slice 5, decision D8).
 */
export const CREATABLE_KINDS: string[] = [DEFAULT_KIND, TASK_KIND, DOCUMENT_KIND];
