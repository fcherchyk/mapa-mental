import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { DeleteButton, dragHandlers, nodeClasses } from './nodeChrome';
import { progressOf, STATUS_LABELS, taskPropsOf } from './taskProps';
import { TitleEditor } from './TitleEditor';

/**
 * A task on the canvas (slice 4A, decision D8): the same body as an idea, with a left stripe in
 * the status colour and the checklist progress. The status word is not drawn; the stripe carries
 * it as an accessible label. A task never has children, so it offers no "+" and no "+k".
 */
export function TaskNode({ data }: NodeComponentProps) {
  const { node, selected, editing, draggable } = data;
  const actions = useNodeActions();
  const props = taskPropsOf(node);
  const { done, total } = progressOf(props);

  return (
    <div
      className={nodeClasses(data, 'is-task')}
      data-testid={`node-${node.id}`}
      data-status={props.status}
      aria-selected={selected}
      draggable={draggable}
      {...dragHandlers(node, actions)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span
        className={`map-node-status is-${props.status}`}
        aria-label={`Status: ${STATUS_LABELS[props.status]}`}
      />
      {editing ? (
        <TitleEditor
          initialTitle={node.title}
          label="New task title"
          onCommit={(title, createSibling) => actions.commitEdit(node.id, title, createSibling)}
          onCancel={() => actions.cancelEdit(node.id)}
        />
      ) : (
        <span className="map-node-title" title={node.title}>
          {node.title}
        </span>
      )}
      {!editing && total > 0 && (
        <span className="map-node-progress" aria-label={`${done} of ${total} done`}>
          {done}/{total}
        </span>
      )}
      {!editing && <DeleteButton node={node} />}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
