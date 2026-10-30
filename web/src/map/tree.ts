import type { NodeOut, NodeView } from '../api/client';

/** Nodo de la ventana; `pending` marca uno creado en el cliente que todavía no existe en la API. */
export interface MapNode extends NodeOut {
  pending?: boolean;
  /** Para un nodo nuevo creado con Enter: el hermano tras el cual va. */
  afterId?: string | null;
}

/** Ventana visible normalizada: nodos por id e hijos cargados, en orden. */
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
  // La API devuelve los nodos por nivel y los hermanos por sort_key.
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

/** Hijos que se dibujan: ninguno si el nodo está colapsado o en el borde. */
export function visibleChildren(state: MapState, id: string): string[] {
  const node = state.nodes[id];
  if (!node || node.collapsed || isBorder(state, id)) return [];
  return state.childIds[id] ?? [];
}

/** Cantidad de hijos ocultos para el indicador "+k". */
export function hiddenChildCount(state: MapState, id: string): number {
  const node = state.nodes[id];
  if (!node) return 0;
  return node.collapsed || isBorder(state, id) ? node.child_count : 0;
}

/** Padre dentro de la ventana; null para el foco. */
export function windowParent(state: MapState, id: string): string | null {
  if (id === state.focusId) return null;
  return state.nodes[id]?.parent_id ?? null;
}

export function isRealRoot(state: MapState, id: string): boolean {
  return state.nodes[id]?.parent_id === null;
}

/** Hijos del nodo que ya llegaron a la ventana (en un colapsado o del borde pueden faltar). */
export function hasLoadedChildren(state: MapState, id: string): boolean {
  return (state.childIds[id]?.length ?? 0) >= (state.nodes[id]?.child_count ?? 0);
}

/** Hijo del foco que es el mismo nodo o su ancestro: adonde baja el foco para mostrar `id`. */
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

/** Agrega un hijo al final o, con `afterId`, justo después de ese hermano. */
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

/** Cambia el id de un nodo (el temporal por el que asignó la API) conservando su lugar. */
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
 * Descendientes conocidos: los cargados más los `child_count` de los nodos cuyos hijos no
 * llegaron. Si alguno de esos tiene hijos, puede haber más niveles: el número es un mínimo.
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

/** Nodo al que se mueve la selección; el mismo si la flecha no lleva a un nodo visible. */
export function moveSelection(state: MapState, id: string, key: ArrowKey): string {
  if (key === 'ArrowRight') return visibleChildren(state, id)[0] ?? id;
  const parent = windowParent(state, id);
  if (key === 'ArrowLeft' || parent === null) return parent ?? id;
  const siblings = visibleChildren(state, parent);
  const index = siblings.indexOf(id) + (key === 'ArrowUp' ? -1 : 1);
  return siblings[index] ?? id;
}

/** Selección después de borrar: el hermano anterior o, si no hay, el padre. */
export function selectionAfterDelete(state: MapState, id: string): string {
  const parent = state.nodes[id]?.parent_id;
  if (!parent) return state.focusId;
  const siblings = state.childIds[parent] ?? [];
  return siblings[siblings.indexOf(id) - 1] ?? parent;
}
