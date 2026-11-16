import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { TitleEditor } from './TitleEditor';

export function IdeaNode({ data }: NodeComponentProps) {
  const { node, isFocus, selected, editing, hiddenCount, draggable, dragging, dropState } = data;
  const actions = useNodeActions();
  const classes = [
    'map-node',
    // React Flow only marks a node `nopan` when it drags the node itself, and it does not here:
    // the layout owns the positions. Without it the pane's d3-zoom takes the mousedown and calls
    // d3-drag's dragDisable, which suppresses `dragstart` on the window, so no drag ever starts.
    'nopan',
    isFocus && 'is-focus',
    selected && 'is-selected',
    dragging && 'is-dragging',
    dropState === 'valid' && 'is-drop-target',
    dropState === 'refused' && 'is-drop-refused',
  ]
    .filter(Boolean)
    .join(' ');
  // Dropping on a node's body always appends it as the last child (decision D2).
  const asChild = { kind: 'child', parentId: node.id } as const;
  // The "+" always shows on the focus and the selected node; on the rest, on mouse hover (CSS).
  const addClasses = ['map-node-add', 'nodrag', 'nopan', (isFocus || selected) && 'is-visible']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={`node-${node.id}`}
      aria-selected={selected}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', node.id);
        actions.dragStart(node.id);
      }}
      onDragEnd={() => actions.dragEnd()}
      onDragOver={(event) => {
        if (actions.dragOver(asChild)) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        actions.drop(asChild);
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {editing ? (
        <TitleEditor
          initialTitle={node.title}
          onCommit={(title, createSibling) => actions.commitEdit(node.id, title, createSibling)}
          onCancel={() => actions.cancelEdit(node.id)}
        />
      ) : (
        // Always as text: React escapes the title (never dangerouslySetInnerHTML).
        <span className="map-node-title" title={node.title}>
          {node.title}
        </span>
      )}
      {!editing && !node.pending && (
        <button
          type="button"
          className="map-node-edit nodrag nopan"
          aria-label={`Rename ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.startEdit(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          ✎
        </button>
      )}
      {!editing && !node.pending && (
        <button
          type="button"
          className={addClasses}
          aria-label={`Add an idea inside ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.createChild(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          +
        </button>
      )}
      {!editing && !node.pending && node.parent_id !== null && (
        <button
          type="button"
          className="map-node-delete nodrag nopan"
          aria-label={`Delete ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.select(node.id);
            actions.remove(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          🗑
        </button>
      )}
      {hiddenCount > 0 && (
        <span
          className={`map-node-hidden ${node.collapsed ? 'is-collapsed' : 'is-border'}`}
          aria-label={`${hiddenCount} hidden children`}
        >
          +{hiddenCount}
        </span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
