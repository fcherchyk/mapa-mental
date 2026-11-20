import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { DeleteButton, dragHandlers, nodeClasses } from './nodeChrome';
import { TitleEditor } from './TitleEditor';

/**
 * A document on the canvas (slice 5, decision D7): the same footprint as an idea, drawn as a page
 * with a folded corner and a page icon. Its body is never drawn here, only in the panel. Like a
 * task it is a leaf: no "+" and no "+k".
 */
export function DocumentNode({ data }: NodeComponentProps) {
  const { node, selected, editing, draggable } = data;
  const actions = useNodeActions();

  return (
    <div
      className={nodeClasses(data, 'is-document')}
      data-testid={`node-${node.id}`}
      aria-selected={selected}
      draggable={draggable}
      {...dragHandlers(node, actions)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="map-node-icon" role="img" aria-label="Document">
        📄
      </span>
      {editing ? (
        <TitleEditor
          initialTitle={node.title}
          label="New document title"
          onCommit={(title, createSibling) => actions.commitEdit(node.id, title, createSibling)}
          onCancel={() => actions.cancelEdit(node.id)}
        />
      ) : (
        <span className="map-node-title" title={node.title}>
          {node.title}
        </span>
      )}
      {!editing && <DeleteButton node={node} />}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
