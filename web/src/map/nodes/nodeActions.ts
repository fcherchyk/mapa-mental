import { createContext, useContext } from 'react';
import type { MapNode } from '../tree';

export type MapNodeData = {
  node: MapNode;
  isFocus: boolean;
  selected: boolean;
  editing: boolean;
  hiddenCount: number;
};

export interface NodeComponentProps {
  data: MapNodeData;
}

export interface NodeActions {
  select: (id: string) => void;
  open: (id: string) => void;
  startEdit: (id: string) => void;
  commitEdit: (id: string, title: string, createSibling: boolean) => void;
  cancelEdit: (id: string) => void;
}

export const NodeActionsContext = createContext<NodeActions | null>(null);

export function useNodeActions(): NodeActions {
  const actions = useContext(NodeActionsContext);
  if (!actions) throw new Error('useNodeActions fuera de NodeActionsContext');
  return actions;
}
