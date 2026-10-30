import { useMemo } from 'react';
import { ReactFlow, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutTree } from './layout';
import { useNodeActions } from './nodes/nodeActions';
import { NodeRenderer, type MapFlowNode } from './nodes/NodeRenderer';
import { hiddenChildCount, isBorder, visibleChildren, type MapState } from './tree';

const NODE_TYPES = { renderer: NodeRenderer };

interface MapCanvasProps {
  state: MapState;
  selectedId: string | null;
  editingId: string | null;
}

/** Pasa la ventana a nodos y aristas de React Flow con la disposición en árbol (ADR 0003). */
export function toFlowElements(
  state: MapState,
  selectedId: string | null,
  editingId: string | null,
): { nodes: MapFlowNode[]; edges: Edge[] } {
  const { positions, edges } = layoutTree(state.focusId, (id) => visibleChildren(state, id));
  const nodes = Object.entries(positions).map(([id, position]) => ({
    id,
    type: 'renderer' as const,
    position,
    data: {
      node: state.nodes[id],
      isFocus: id === state.focusId,
      selected: id === selectedId,
      editing: id === editingId,
      hiddenCount: hiddenChildCount(state, id),
      canAddChild: !state.nodes[id].collapsed && !isBorder(state, id),
    },
  }));
  return {
    nodes,
    edges: edges.map(({ source, target }) => ({ id: `${source}->${target}`, source, target })),
  };
}

export function MapCanvas({ state, selectedId, editingId }: MapCanvasProps) {
  const actions = useNodeActions();
  const { nodes, edges } = useMemo(
    () => toFlowElements(state, selectedId, editingId),
    [state, selectedId, editingId],
  );

  return (
    <ReactFlow
      // Cada foco o N nuevo vuelve a encuadrar el árbol.
      key={`${state.focusId}:${state.depth}`}
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodeClick={(_, node) => actions.select(node.id)}
      onNodeDoubleClick={(_, node) => actions.open(node.id)}
      fitView
      minZoom={0.2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      // El teclado lo maneja MapPage: React Flow no debe borrar ni desplazar con Espacio.
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
