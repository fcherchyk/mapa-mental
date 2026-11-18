import type { DragEvent } from 'react';
import type { MapNode } from '../tree';
import { useNodeActions, type MapNodeData, type NodeActions } from './nodeActions';

/**
 * What every kind of node shares on the canvas: its classes, the drag and drop wiring and the
 * delete button. `IdeaNode` and `TaskNode` differ only in what they draw inside.
 */
export function nodeClasses(data: MapNodeData, kindClass: string): string {
  const { isFocus, selected, dragging, dropState } = data;
  return [
    'map-node',
    kindClass,
    // Without `nopan` React Flow's pan handler takes the mousedown and calls d3-drag's
    // `dragDisable`, which suppresses the browser's `dragstart` on the window: the node could
    // never be picked up. React Flow only adds the class to nodes it drags itself, and it does
    // not drag these (ADR 0003: the layout owns every position).
    'nopan',
    isFocus && 'is-focus',
    selected && 'is-selected',
    dragging && 'is-dragging',
    dropState === 'valid' && 'is-drop-target',
    dropState === 'refused' && 'is-drop-refused',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Drag and drop handlers for a node's body. Dropping on it always appends the dragged node as
 * its last child (slice 2, decision D2); a kind that takes no children refuses the drop, which
 * `isUsefulTarget` decides, so the node shows the refused state (slice 4A, S4A_FE_AC10).
 */
export function dragHandlers(node: MapNode, actions: NodeActions) {
  const asChild = { kind: 'child', parentId: node.id } as const;
  return {
    onDragStart: (event: DragEvent) => {
      event.dataTransfer?.setData('text/plain', node.id);
      actions.dragStart(node.id);
    },
    onDragEnd: () => actions.dragEnd(),
    onDragOver: (event: DragEvent) => {
      if (actions.dragOver(asChild)) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      actions.drop(asChild);
    },
  };
}

/** The 🗑 button; never drawn on the map's real root or on a node that does not exist yet. */
export function DeleteButton({ node }: { node: MapNode }) {
  const actions = useNodeActions();
  if (node.pending || node.parent_id === null) return null;
  return (
    <button
      type="button"
      className="map-node-delete nodrag nopan"
      aria-label={`Delete ${node.title}`}
      onClick={(event) => {
        event.stopPropagation();
        actions.select(node.id);
        actions.remove(node.id);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      🗑
    </button>
  );
}
