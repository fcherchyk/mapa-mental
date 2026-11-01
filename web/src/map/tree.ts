import type { NodeOut, NodeView } from '../api/client';

/** A window node; `pending` marks one created on the client that does not exist in the API yet. */
export interface MapNode extends NodeOut {
  pending?: boolean;
  /** For a new node created with Enter: the sibling it goes after. */
  afterId?: string | null;
}

/** Normalized visible window: nodes by id and loaded children, in order. */
export interface MapState {
  focusId: string;
  depth: number;
  ancestors: NodeOut[];
  nodes: Record<string, MapNode>;
  childIds: Record<string, string[]>;
  levels: Record<string, number>;
}

export function fromView(view: NodeView, depth: number): MapState {
  const state: MapState = {
    focusId: view.focus.id,
    depth,
    ancestors: view.ancestors,
    nodes: { [view.focus.id]: view.focus },
    childIds: { [view.focus.id]: [] },
    levels: { [view.focus.id]: 0 },
  };
  // The API returns nodes by level and siblings by sort_key.
  for (const { level, ...node } of view.nodes) {
    state.nodes[node.id] = node;
    state.childIds[node.id] = [];
    state.levels[node.id] = level;
    if (node.parent_id) state.childIds[node.parent_id]?.push(node.id);
  }
  return state;
}

export function isBorder(state: MapState, id: string): boolean {
  return state.levels[id] >= state.depth;
}

/** Children that get drawn: none if the node is collapsed or on the border. */
export function visibleChildren(state: MapState, id: string): string[] {
  const node = state.nodes[id];
  if (!node || node.collapsed || isBorder(state, id)) return [];
  return state.childIds[id] ?? [];
}

/** Number of hidden children for the "+k" indicator. */
export function hiddenChildCount(state: MapState, id: string): number {
  const node = state.nodes[id];
  if (!node) return 0;
  return node.collapsed || isBorder(state, id) ? node.child_count : 0;
}

/** Parent within the window; null for the focus. */
export function windowParent(state: MapState, id: string): string | null {
  if (id === state.focusId) return null;
  return state.nodes[id]?.parent_id ?? null;
}

export function isRealRoot(state: MapState, id: string): boolean {
  return state.nodes[id]?.parent_id === null;
}

/** The node's children already in the window (they may be missing on a collapsed or border node). */
export function hasLoadedChildren(state: MapState, id: string): boolean {
  return (state.childIds[id]?.length ?? 0) >= (state.nodes[id]?.child_count ?? 0);
}

/** The focus's child that is the node itself or its ancestor: where focus moves to show `id`. */
export function childOfFocusToward(state: MapState, id: string): string | null {
  let current: MapNode | undefined = state.nodes[id];
  while (current && current.parent_id !== state.focusId) {
    current = current.parent_id ? state.nodes[current.parent_id] : undefined;
  }
  return current?.id ?? null;
}

export function patchNode(state: MapState, id: string, patch: Partial<MapNode>): MapState {
  const node = state.nodes[id];
  if (!node) return state;
  return { ...state, nodes: { ...state.nodes, [id]: { ...node, ...patch } } };
}

/** Adds a child at the end or, with `afterId`, right after that sibling. */
export function insertChild(
  state: MapState,
  parentId: string,
  node: MapNode,
  afterId: string | null = null,
): MapState {
  const parent = state.nodes[parentId];
  const siblings = [...(state.childIds[parentId] ?? [])];
  const afterIndex = afterId ? siblings.indexOf(afterId) : -1;
  siblings.splice(afterIndex >= 0 ? afterIndex + 1 : siblings.length, 0, node.id);
  return {
    ...state,
    nodes: {
      ...state.nodes,
      [parentId]: { ...parent, child_count: parent.child_count + 1 },
      [node.id]: node,
    },
    childIds: { ...state.childIds, [parentId]: siblings, [node.id]: [] },
    levels: { ...state.levels, [node.id]: state.levels[parentId] + 1 },
  };
}

/** Changes a node's id (the temporary one for the one the API assigned), keeping its place. */
export function replaceNode(state: MapState, oldId: string, node: MapNode): MapState {
  const current = state.nodes[oldId];
  if (!current) return state;
  const nodes = { ...state.nodes };
  const childIds = { ...state.childIds };
  const levels = { ...state.levels };
  delete nodes[oldId];
  nodes[node.id] = node;
  childIds[node.id] = childIds[oldId] ?? [];
  if (oldId !== node.id) delete childIds[oldId];
  levels[node.id] = levels[oldId];
  if (oldId !== node.id) delete levels[oldId];
  if (current.parent_id) {
    childIds[current.parent_id] = childIds[current.parent_id].map((id) =>
      id === oldId ? node.id : id,
    );
  }
  return { ...state, nodes, childIds, levels };
}

export function subtreeIds(state: MapState, id: string): string[] {
  return [id, ...(state.childIds[id] ?? []).flatMap((child) => subtreeIds(state, child))];
}

export function removeSubtree(state: MapState, id: string): MapState {
  const node = state.nodes[id];
  if (!node) return state;
  const nodes = { ...state.nodes };
  const childIds = { ...state.childIds };
  const levels = { ...state.levels };
  for (const removed of subtreeIds(state, id)) {
    delete nodes[removed];
    delete childIds[removed];
    delete levels[removed];
  }
  const parent = node.parent_id ? nodes[node.parent_id] : undefined;
  if (parent) {
    nodes[parent.id] = { ...parent, child_count: Math.max(0, parent.child_count - 1) };
    childIds[parent.id] = childIds[parent.id].filter((child) => child !== id);
  }
  return { ...state, nodes, childIds, levels };
}

/**
 * Known descendants: the loaded ones plus the `child_count` of nodes whose children did not
 * arrive. If any of those has children there may be more levels, so the number is a minimum.
 */
export function countDescendants(state: MapState, id: string): { count: number; exact: boolean } {
  let count = 0;
  let exact = true;
  for (const descendant of subtreeIds(state, id)) {
    const loaded = state.childIds[descendant]?.length ?? 0;
    const total = state.nodes[descendant].child_count;
    count += Math.max(loaded, total);
    if (total > loaded) exact = false;
  }
  return { count, exact };
}

export type ArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

/** Node the selection moves to; the same one if the arrow does not lead to a visible node. */
export function moveSelection(state: MapState, id: string, key: ArrowKey): string {
  if (key === 'ArrowRight') return visibleChildren(state, id)[0] ?? id;
  const parent = windowParent(state, id);
  if (key === 'ArrowLeft' || parent === null) return parent ?? id;
  const siblings = visibleChildren(state, parent);
  const index = siblings.indexOf(id) + (key === 'ArrowUp' ? -1 : 1);
  return siblings[index] ?? id;
}

/** Selection after deleting: the previous sibling or, if there is none, the parent. */
export function selectionAfterDelete(state: MapState, id: string): string {
  const parent = state.nodes[id]?.parent_id;
  if (!parent) return state.focusId;
  const siblings = state.childIds[parent] ?? [];
  return siblings[siblings.indexOf(id) - 1] ?? parent;
}
