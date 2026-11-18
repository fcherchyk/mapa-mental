import type { KeyboardEvent, ReactNode } from 'react';
import type { NodeOut, TaskStatus } from '../api/client';
import { STATUS_LABELS } from '../map/nodes/taskProps';
import { BoardCard } from './BoardCard';

interface BoardColumnProps {
  status: TaskStatus;
  tasks: NodeOut[];
  selectedId: string | null;
  draggingId: string | null;
  /** The gap under the pointer while a card is dragged over this column. */
  hoveredGap: number | null;
  onHoverGap: (gap: number | null) => void;
  onDropAtGap: (gap: number) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCardKeyDown: (id: string, event: KeyboardEvent<HTMLElement>) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  /** What the column shows after its cards: the To do column's editor and "Add task" button. */
  footer?: ReactNode;
}

/** One status column: its cards in board order and, while dragging, the gaps between them. */
export function BoardColumn({
  status,
  tasks,
  selectedId,
  draggingId,
  hoveredGap,
  onHoverGap,
  onDropAtGap,
  onSelect,
  onRemove,
  onCardKeyDown,
  onDragStart,
  onDragEnd,
  footer,
}: BoardColumnProps) {
  const label = STATUS_LABELS[status];
  const headingId = `board-column-${status}`;

  const gap = (index: number) =>
    draggingId && (
      <li
        className={`board-gap ${hoveredGap === index ? 'is-hovered' : ''}`}
        data-testid={`gap-${status}-${index}`}
        onDragOver={(event) => {
          event.preventDefault();
          onHoverGap(index);
        }}
        onDragLeave={() => onHoverGap(null)}
        onDrop={(event) => {
          // The column's own drop handler (its last gap) must not run too.
          event.preventDefault();
          event.stopPropagation();
          onDropAtGap(index);
        }}
      />
    );

  return (
    <section
      className={`board-column is-${status}`}
      aria-labelledby={headingId}
      data-testid={`column-${status}`}
      onDragOver={(event) => {
        // A drop anywhere in an empty column, or below its last card, goes to its last gap.
        if (draggingId) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!draggingId) return;
        event.preventDefault();
        onDropAtGap(tasks.length);
      }}
    >
      <h2 id={headingId}>
        {label} <span className="board-count">({tasks.length})</span>
      </h2>
      <ul className="board-cards" aria-label={label}>
        {tasks.map((task, index) => (
          <BoardCard
            key={task.id}
            task={task}
            selected={task.id === selectedId}
            dragging={task.id === draggingId}
            onSelect={() => onSelect(task.id)}
            onRemove={() => onRemove(task.id)}
            onKeyDown={(event) => onCardKeyDown(task.id, event)}
            onDragStart={() => onDragStart(task.id)}
            onDragEnd={onDragEnd}
            gapBefore={gap(index)}
          />
        ))}
        {gap(tasks.length)}
      </ul>
      {footer}
    </section>
  );
}
