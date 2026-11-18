import type { Place } from '../api/client';
import { NODE_HEIGHT, SIBLING_GAP, type Position } from './layout';
import { allowsChildren } from './nodes/taskProps';
import { visibleChildren, type MapState } from './tree';

/**
 * Where a dragged node would land (slice 2, S2_FE_AC2).
 *
 * `child` appends it to a parent; `sibling` inserts it among the nodes it already belongs to,
 * with `afterId: null` meaning "before the first one". Dropping on a node's body always appends,
 * so a reparent and a precise position are two separate gestures (decision D2).
 */
export type DropTarget =
  | { kind: 'child'; parentId: string }
  | { kind: 'sibling'; parentId: string; afterId: string | null };

/** A gap between two of the dragged node's siblings, with the place to draw its drop zone. */
export interface GapSlot {
  afterId: string | null;
  position: Position;
}

export function isDescendant(state: MapState, ancestorId: string, nodeId: string): boolean {
  let current = state.nodes[nodeId]?.parent_id ?? null;
  while (current) {
    if (current === ancestorId) return true;
    current = state.nodes[current]?.parent_id ?? null;
  }
  return false;
}

/** A node can be dragged unless it is the map's root, the focus, pending or being edited. */
export function isDraggable(state: MapState, id: string, editingId: string | null): boolean {
  const node = state.nodes[id];
  if (!node || node.pending || id === editingId) return false;
  return node.parent_id !== null && id !== state.focusId;
}

/** True if the target is reachable and would actually change where the node sits (S2_FE_AC8). */
export function isUsefulTarget(state: MapState, draggedId: string, target: DropTarget): boolean {
  const node = state.nodes[draggedId];
  if (!node || node.parent_id === null || draggedId === state.focusId) return false;
  if (target.parentId === draggedId || isDescendant(state, draggedId, target.parentId)) {
    return false;
  }
  // A leaf kind takes nothing inside it (slice 4A, decision D3). An ancestor in the breadcrumb is
  // not in `nodes`, and ancestors always have children, so an unknown parent is accepted.
  const parent = state.nodes[target.parentId];
  if (parent && !allowsChildren(parent.kind)) return false;
  if (target.kind === 'child') {
    const children = state.childIds[target.parentId] ?? [];
    // Appending where it already sits last changes nothing.
    return !(target.parentId === node.parent_id && children.at(-1) === draggedId);
  }
  // A gap only exists among the node's current siblings (decision D2).
  if (target.parentId !== node.parent_id) return false;
  if (target.afterId === draggedId) return false;
  const siblings = visibleChildren(state, target.parentId);
  const after = target.afterId === null ? -1 : siblings.indexOf(target.afterId);
  if (target.afterId !== null && after === -1) return false;
  // The gaps right above and right below the node leave it exactly where it is.
  return after !== siblings.indexOf(draggedId) - 1;
}

/**
 * The gaps offered while dragging `draggedId`: one before the first sibling and one after each,
 * skipping the two that would leave the node where it is.
 */
export function gapSlots(
  state: MapState,
  draggedId: string,
  positions: Record<string, Position>,
): GapSlot[] {
  const parentId = state.nodes[draggedId]?.parent_id;
  if (!parentId) return [];
  const siblings = visibleChildren(state, parentId).filter((id) => positions[id]);
  if (siblings.length === 0) return [];
  const x = positions[siblings[0]].x;
  const slots: GapSlot[] = [];
  const edges: (string | null)[] = [null, ...siblings];
  for (const afterId of edges) {
    if (!isUsefulTarget(state, draggedId, { kind: 'sibling', parentId, afterId })) continue;
    const above = afterId === null ? null : positions[afterId];
    const belowId = afterId === null ? siblings[0] : siblings[siblings.indexOf(afterId) + 1];
    const below = belowId ? positions[belowId] : null;
    const y = above && below ? (above.y + NODE_HEIGHT + below.y) / 2 : edgeY(above, below);
    slots.push({ afterId, position: { x, y } });
  }
  return slots;
}

function edgeY(above: Position | null, below: Position | null): number {
  if (above) return above.y + NODE_HEIGHT + SIBLING_GAP / 2;
  return (below?.y ?? 0) - SIBLING_GAP / 2;
}

/** The `place` the move endpoint expects for a resolved target. */
export function placeFor(target: DropTarget): Place {
  if (target.kind === 'child') return 'last';
  return target.afterId === null ? 'first' : { after_id: target.afterId };
}
