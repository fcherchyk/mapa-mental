import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import type { NodeOut } from '../api/client';
import { progressOf, STATUS_LABELS, taskPropsOf } from '../map/nodes/taskProps';

interface BoardCardProps {
  task: NodeOut;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  /** The insertion gap drawn above the card while another one is dragged. */
  gapBefore?: ReactNode;
}

/**
 * A task as a card (slice 4B, decision D7): the title, the status stripe and the checklist
 * progress as on the canvas, and a 🗑. It is focusable, and its keys are handled by the page.
 */
export function BoardCard({
  task,
  selected,
  dragging,
  onSelect,
  onRemove,
  onKeyDown,
  onDragStart,
  onDragEnd,
  gapBefore,
}: BoardCardProps) {
  const props = taskPropsOf(task);
  const { done, total } = progressOf(props);
  const pending = task.version === 0;

  return (
    <>
      {gapBefore}
      <li
        className={[
          'board-card',
          selected && 'is-selected',
          dragging && 'is-dragging',
          pending && 'is-pending',
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={`card-${task.id}`}
        data-card-id={task.id}
        data-status={props.status}
        tabIndex={pending ? -1 : 0}
        draggable={!pending}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        onDragStart={(event: DragEvent) => {
          event.dataTransfer?.setData('text/plain', task.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <span
          className={`map-node-status is-${props.status}`}
          aria-label={`Status: ${STATUS_LABELS[props.status]}`}
        />
        <span className="board-card-title">{task.title}</span>
        {total > 0 && (
          <span className="map-node-progress" aria-label={`${done} of ${total} done`}>
            {done}/{total}
          </span>
        )}
        {!pending && (
          <button
            type="button"
            className="board-card-delete"
            aria-label={`Delete ${task.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            🗑
          </button>
        )}
      </li>
    </>
  );
}
