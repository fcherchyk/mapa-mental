import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { TitleEditor } from './TitleEditor';

export function IdeaNode({ data }: NodeComponentProps) {
  const { node, isFocus, selected, editing, hiddenCount } = data;
  const actions = useNodeActions();
  const classes = ['map-node', isFocus && 'is-focus', selected && 'is-selected']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={`node-${node.id}`}
      aria-selected={selected}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {editing ? (
        <TitleEditor
          initialTitle={node.title}
          onCommit={(title, createSibling) => actions.commitEdit(node.id, title, createSibling)}
          onCancel={() => actions.cancelEdit(node.id)}
        />
      ) : (
        // Siempre como texto: React escapa el título (nunca dangerouslySetInnerHTML).
        <span className="map-node-title" title={node.title}>
          {node.title}
        </span>
      )}
      {!editing && !node.pending && (
        <button
          type="button"
          className="map-node-edit nodrag nopan"
          aria-label={`Renombrar ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.startEdit(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          ✎
        </button>
      )}
      {hiddenCount > 0 && (
        <span
          className={`map-node-hidden ${node.collapsed ? 'is-collapsed' : 'is-border'}`}
          aria-label={`${hiddenCount} hijos ocultos`}
        >
          +{hiddenCount}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
