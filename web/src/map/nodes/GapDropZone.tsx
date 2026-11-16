import type { Node, NodeProps } from '@xyflow/react';
import type { DropTarget } from '../dropTarget';
import { useNodeActions, type GapNodeData } from './nodeActions';

export type GapFlowNode = Node<GapNodeData, 'gap'>;

/**
 * The insertion line between two siblings, drawn only while one of them is dragged
 * (slice 2, S2_FE_AC5 and AC9). Dropping here reorders without changing parent.
 */
export function GapDropZone({ data }: NodeProps<GapFlowNode>) {
  const actions = useNodeActions();
  const target: DropTarget = {
    kind: 'sibling',
    parentId: data.parentId,
    afterId: data.afterId,
  };

  return (
    <div
      className={`map-gap${data.hovered ? ' is-hovered' : ''}`}
      role="button"
      tabIndex={-1}
      aria-label={data.label}
      data-testid={`gap-${data.afterId ?? 'first'}`}
      onDragOver={(event) => {
        if (actions.dragOver(target)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        actions.drop(target);
      }}
    />
  );
}
