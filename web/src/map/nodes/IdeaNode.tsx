import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { DeleteButton, dragHandlers, nodeClasses } from './nodeChrome';
import { KindMenu } from './KindMenu';
import { TitleEditor } from './TitleEditor';

export function IdeaNode({ data }: NodeComponentProps) {
  const { node, isFocus, selected, editing, hiddenCount, draggable, menuOpen } = data;
  const actions = useNodeActions();
  // "+" always shows on the focus and the selected node; on the rest, on hover (CSS).
  const addClasses = ['map-node-add', 'nodrag', 'nopan', (isFocus || selected) && 'is-visible']
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={nodeClasses(data, 'is-idea')}
      data-testid={`node-${node.id}`}
      aria-selected={selected}
      draggable={draggable}
      {...dragHandlers(node, actions)}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {editing ? (
        <TitleEditor
          initialTitle={node.title}
          label="New idea title"
          onCommit={(title, createSibling) => actions.commitEdit(node.id, title, createSibling)}
          onCancel={() => actions.cancelEdit(node.id)}
        />
      ) : (
        // Always as text: React escapes the title (never dangerouslySetInnerHTML).
        <span className="map-node-title" title={node.title}>
          {node.title}
        </span>
      )}
      {/* One "+" for every kind: it opens the kind menu (slice 5, decision D8). */}
      {!editing && !node.pending && (
        <button
          type="button"
          className={addClasses}
          aria-label={`Add inside ${node.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            actions.toggleKindMenu(node.id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          +
        </button>
      )}
      {menuOpen && !editing && !node.pending && (
        <KindMenu
          parentTitle={node.title}
          onChoose={(kind) => actions.createChild(node.id, kind)}
          onClose={actions.closeKindMenu}
        />
      )}
      {!editing && <DeleteButton node={node} />}
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
