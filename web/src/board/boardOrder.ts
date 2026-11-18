import type { BoardPlace, NodeOut, TaskStatus } from '../api/client';
import { STATUS_ORDER, taskPropsOf } from '../map/nodes/taskProps';

/**
 * Pure rules of the board (slice 4B). The board holds one list of tasks in the map's global
 * order (decision D2); the columns are views over it, so reordering inside a column is reordering
 * inside that list.
 */

export type Columns = Record<TaskStatus, NodeOut[]>;

export function statusOf(task: NodeOut): TaskStatus {
  return taskPropsOf(task).status;
}

export function columnsOf(tasks: NodeOut[]): Columns {
  const columns: Columns = { to_do: [], in_progress: [], done: [] };
  for (const task of tasks) columns[statusOf(task)].push(task);
  return columns;
}

/** The column to the left or right; `null` at the edges (decision D6). */
export function statusBeside(status: TaskStatus, direction: -1 | 1): TaskStatus | null {
  return STATUS_ORDER[STATUS_ORDER.indexOf(status) + direction] ?? null;
}

/**
 * The `place` for dropping `draggedId` at gap `gap` of `column` (gap `i` is right before the
 * column's `i`-th card). `undefined` when the drop would change nothing; `null` when the column
 * has no other card, so only the status changes (decision D5).
 */
export function placeForGap(
  column: NodeOut[],
  gap: number,
  draggedId: string,
): BoardPlace | null | undefined {
  const from = column.findIndex((task) => task.id === draggedId);
  if (from !== -1 && (gap === from || gap === from + 1)) return undefined;
  const others = column.filter((task) => task.id !== draggedId);
  if (others.length === 0) return null;
  const to = from !== -1 && gap > from ? gap - 1 : gap;
  return to === 0 ? { before_id: others[0].id } : { after_id: others[to - 1].id };
}

/** The `place` for Alt+↑ or Alt+↓ inside a column; `undefined` at the top or bottom. */
export function placeBeside(
  column: NodeOut[],
  id: string,
  direction: -1 | 1,
): BoardPlace | undefined {
  const index = column.findIndex((task) => task.id === id);
  const neighbour = column[index + direction];
  if (index === -1 || !neighbour) return undefined;
  return direction === -1 ? { before_id: neighbour.id } : { after_id: neighbour.id };
}

/** The list after a card changes status and, with `place`, position; the rest keeps its order. */
export function moveCard(
  tasks: NodeOut[],
  id: string,
  status: TaskStatus,
  place: BoardPlace | null,
): NodeOut[] {
  const card = tasks.find((task) => task.id === id);
  if (!card) return tasks;
  const moved = { ...card, props: { ...taskPropsOf(card), status } };
  if (place === null) return tasks.map((task) => (task.id === id ? moved : task));
  const rest = tasks.filter((task) => task.id !== id);
  const anchorId = 'before_id' in place ? place.before_id : place.after_id;
  const anchor = rest.findIndex((task) => task.id === anchorId);
  if (anchor === -1) return tasks.map((task) => (task.id === id ? moved : task));
  const at = 'before_id' in place ? anchor : anchor + 1;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

/** Inserts a new card right after `afterId`, or at the end of the list when there is none. */
export function insertCard(tasks: NodeOut[], card: NodeOut, afterId: string | null): NodeOut[] {
  const index = afterId ? tasks.findIndex((task) => task.id === afterId) : -1;
  const at = index === -1 ? tasks.length : index + 1;
  return [...tasks.slice(0, at), card, ...tasks.slice(at)];
}
