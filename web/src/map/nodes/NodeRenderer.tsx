import type { ComponentType } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import { DocumentNode } from './DocumentNode';
import { IdeaNode } from './IdeaNode';
import type { MapNodeData, NodeComponentProps } from './nodeActions';
import { TaskNode } from './TaskNode';

export type MapFlowNode = Node<MapNodeData, 'renderer'>;

/** Component for each `kind`; future kinds (event, spreadsheet…) are added here (ADR 0002). */
export const NODE_COMPONENTS: Record<string, ComponentType<NodeComponentProps>> = {
  idea: IdeaNode,
  task: TaskNode,
  document: DocumentNode,
};

export function NodeRenderer({ data }: NodeProps<MapFlowNode>) {
  const Component = NODE_COMPONENTS[data.node.kind] ?? IdeaNode;
  return <Component data={data} />;
}
