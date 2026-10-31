import type { ComponentType } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { IdeaNode } from './IdeaNode';
import type { MapNodeData, NodeComponentProps } from './nodeActions';

export type MapFlowNode = Node<MapNodeData, 'renderer'>;

/** Component for each `kind`; future kinds (document, task…) are added here (ADR 0002). */
export const NODE_COMPONENTS: Record<string, ComponentType<NodeComponentProps>> = {
  idea: IdeaNode,
};

export function NodeRenderer({ data }: NodeProps<MapFlowNode>) {
  const Component = NODE_COMPONENTS[data.node.kind] ?? IdeaNode;
  return <Component data={data} />;
}
