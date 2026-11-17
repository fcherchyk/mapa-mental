import { createContext, useContext } from 'react';
import type { DropTarget } from '../dropTarget';
import type { MapNode } from '../tree';

/** How a node looks while something is being dragged over it (slice 2, S2_FE_AC9). */
export type DropState = 'valid' | 'refused' | null;

export type MapNodeData = {
  node: MapNode;
  isFocus: boolean;
  selected: boolean;
  editing: boolean;
  hiddenCount: number;
  draggable: boolean;
  dragging: boolean;
  dropState: DropState;
};

/** A drop zone drawn between two siblings while one of them is dragged. */
export type GapNodeData = {
  parentId: string;
  afterId: string | null;
  label: string;
  hovered: boolean;
};

export interface NodeComponentProps {
  data: MapNodeData;
}

export interface NodeActions {
  select: (id: string) => void;
  open: (id: string) => void;
  createChild: (id: string) => void;
  /** A click on the empty canvas clears the selection (slice 3, decision D7). */
  clearSelection: () => void;
  remove: (id: string) => void;
  commitEdit: (id: string, title: string, createSibling: boolean) => void;
  cancelEdit: (id: string) => void;
  dragStart: (id: string) => void;
  dragEnd: () => void;
  /** Marks the target under the pointer; returns whether it accepts the drop. */
  dragOver: (target: DropTarget) => boolean;
  drop: (target: DropTarget) => void;
}

export const NodeActionsContext = createContext<NodeActions | null>(null);

export function useNodeActions(): NodeActions {
  const actions = useContext(NodeActionsContext);
  if (!actions) throw new Error('useNodeActions outside NodeActionsContext');
  return actions;
}
