import { Handle, Position } from '@xyflow/react';
import { useNodeActions, type NodeComponentProps } from './nodeActions';
import { DeleteButton, dragHandlers, nodeClasses } from './nodeChrome';
import { TASK_KIND } from './taskProps';
import { TitleEditor } from './TitleEditor';

export function IdeaNode({ data }: NodeComponentProps) {
  const { node, isFocus, selected, editing, hiddenCount, draggable } = data;
  const actions = useNodeActions();
  // The create buttons always show on the focus and the selected node; on the rest, on hover (CSS).
  const addClasses = (extra: string) =>
    ['map-node-add', extra, 'nodrag', 'nopan', (isFocus || selected) && 'is-visible']
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
      {!editing && !node.pending && (
        <button
          type="button"
          className={addClasses('')}
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
      {/* Only ideas offer it: a task takes no children (slice 4A, decision D9). */}
      {!editing && !node.pending && (
        <button
          type="button"
          className={addClasses('map-node-add-task')}
          aria-label={`Add a task inside ${node.title}`}
          onClick={(event) => {
            event.stopPropagation();
            actions.createChild(node.id, TASK_KIND);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          ☑
        </button>
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
