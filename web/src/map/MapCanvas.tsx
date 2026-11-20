import { useMemo } from 'react';
import { ReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { gapSlots, isDraggable, isUsefulTarget, type DropTarget } from './dropTarget';
import { layoutTree } from './layout';
import { GapDropZone, type GapFlowNode } from './nodes/GapDropZone';
import { useNodeActions } from './nodes/nodeActions';
import { NodeRenderer, type MapFlowNode } from './nodes/NodeRenderer';
import { hiddenChildCount, visibleChildren, type MapState } from './tree';

const NODE_TYPES = { renderer: NodeRenderer, gap: GapDropZone };

/** What is being dragged and what the pointer is currently over. */
export interface DragState {
  draggingId: string | null;
  hover: DropTarget | null;
}

export const NO_DRAG: DragState = { draggingId: null, hover: null };

interface MapCanvasProps {
  state: MapState;
  selectedId: string | null;
  editingId: string | null;
  drag?: DragState;
  /** The idea whose kind menu is open (slice 5, decision D8). */
  kindMenuFor?: string | null;
}

function dropStateOf(state: MapState, drag: DragState, id: string): 'valid' | 'refused' | null {
  const { draggingId, hover } = drag;
  if (!draggingId || !hover || hover.kind !== 'child' || hover.parentId !== id) return null;
  return isUsefulTarget(state, draggingId, hover) ? 'valid' : 'refused';
}

function gapLabel(state: MapState, afterId: string | null, parentId: string): string {
  if (afterId === null) {
    const first = visibleChildren(state, parentId)[0];
    return `Move before "${state.nodes[first]?.title ?? ''}"`;
  }
  return `Move after "${state.nodes[afterId]?.title ?? ''}"`;
}

/** Turns the window into React Flow nodes and edges with the tree layout (ADR 0003). */
export function toFlowElements(
  state: MapState,
  selectedId: string | null,
  editingId: string | null,
  drag: DragState = NO_DRAG,
  kindMenuFor: string | null = null,
): { nodes: (MapFlowNode | GapFlowNode)[]; edges: Edge[] } {
  const { positions, edges } = layoutTree(state.focusId, (id) => visibleChildren(state, id));
  const nodes: (MapFlowNode | GapFlowNode)[] = Object.entries(positions).map(([id, position]) => ({
    id,
    type: 'renderer' as const,
    position,
    draggable: false,
    // The open menu hangs below its node: it must be drawn over the nodes underneath.
    ...(id === kindMenuFor ? { zIndex: 1000 } : {}),
    data: {
      node: state.nodes[id],
      isFocus: id === state.focusId,
      selected: id === selectedId,
      editing: id === editingId,
      hiddenCount: hiddenChildCount(state, id),
      draggable: isDraggable(state, id, editingId),
      dragging: id === drag.draggingId,
      dropState: dropStateOf(state, drag, id),
      menuOpen: id === kindMenuFor,
    },
  }));
  // The insertion lines only exist while a node is dragged, and only among its own siblings.
  if (drag.draggingId) {
    const parentId = state.nodes[drag.draggingId]?.parent_id;
    for (const slot of gapSlots(state, drag.draggingId, positions)) {
      if (!parentId) break;
      const hovered = drag.hover?.kind === 'sibling' && drag.hover.afterId === slot.afterId;
      nodes.push({
        id: `gap-${slot.afterId ?? 'first'}`,
        type: 'gap' as const,
        position: slot.position,
        draggable: false,
        data: {
          parentId,
          afterId: slot.afterId,
          label: gapLabel(state, slot.afterId, parentId),
          hovered,
        },
      });
    }
  }
  return {
    nodes,
    edges: edges.map(({ source, target }) => ({ id: `${source}->${target}`, source, target })),
  };
}

export function MapCanvas({
  state,
  selectedId,
  editingId,
  drag = NO_DRAG,
  kindMenuFor = null,
}: MapCanvasProps) {
  const actions = useNodeActions();
  const { nodes, edges } = useMemo(
    () => toFlowElements(state, selectedId, editingId, drag, kindMenuFor),
    [state, selectedId, editingId, drag, kindMenuFor],
  );

  return (
    <ReactFlow
      // Every new focus or N fits the tree into view again.
      key={`${state.focusId}:${state.depth}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={(_, node) => node.type === 'renderer' && actions.select(node.id)}
      onPaneClick={() => actions.clearSelection()}
      onNodeDoubleClick={(_, node) => node.type === 'renderer' && actions.open(node.id)}
      fitView
      minZoom={0.2}
      // Nodes are dragged with the browser's own drag and drop, not by moving them on the pane:
      // their position comes from the layout (ADR 0003) and is never stored.
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      // MapPage handles the keyboard: React Flow must not delete, nor pan with Space.
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panActivationKeyCode={null}
      zoomActivationKeyCode={null}
      disableKeyboardA11y
      proOptions={{ hideAttribution: true }}
    />
  );
}
