import type { ChecklistItem, NodeOut, TaskProps, TaskStatus } from '../../api/client';
import { TASK_KIND } from './kinds';

/** Mirrors `api/app/node_types` (slice 4A, decision D6). */
export const CHECKLIST_MAX_ITEMS = 30;
export const ITEM_TEXT_MAX_LENGTH = 100;

// The kind registry lives in `kinds.ts` since slice 5; re-exported for the task modules.
export { allowsChildren, DEFAULT_KIND, TASK_KIND } from './kinds';

export function isTask(node: Pick<NodeOut, 'kind'> | undefined): boolean {
  return node?.kind === TASK_KIND;
}

export const STATUS_ORDER: TaskStatus[] = ['to_do', 'in_progress', 'done'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  to_do: 'To do',
  in_progress: 'In progress',
  done: 'Done',
};

export function defaultTaskProps(): TaskProps {
  return { status: 'to_do', checklist: [] };
}

/** What a node of this kind starts with on the client, before the API answers. */
export function propsForNewNode(kind: string): Record<string, unknown> {
  return kind === TASK_KIND ? { ...defaultTaskProps() } : {};
}

function isStatus(value: unknown): value is TaskStatus {
  return STATUS_ORDER.includes(value as TaskStatus);
}

function isItem(value: unknown): value is ChecklistItem {
  const item = value as ChecklistItem | null;
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.done === 'boolean'
  );
}

/**
 * A task's props, with every missing or unexpected value replaced by its default. The server
 * always answers complete props, so this only guards a node created on the client and anything
 * an older map may carry.
 */
export function taskPropsOf(node: Pick<NodeOut, 'props'> | undefined): TaskProps {
  const props = (node?.props ?? {}) as Partial<TaskProps>;
  return {
    status: isStatus(props.status) ? props.status : 'to_do',
    checklist: Array.isArray(props.checklist) ? props.checklist.filter(isItem) : [],
  };
}

export interface Progress {
  done: number;
  total: number;
}

export function progressOf(props: TaskProps): Progress {
  return {
    done: props.checklist.filter((item) => item.done).length,
    total: props.checklist.length,
  };
}

/** `props` as the API client carries it: an opaque record validated per kind on the server. */
export function asProps(props: TaskProps): Record<string, unknown> {
  return { ...props } as unknown as Record<string, unknown>;
}

/** A new checklist item; the id is the client's (decision D4) and the API only checks it is unique. */
export function newChecklistItem(text: string): ChecklistItem {
  return { id: crypto.randomUUID(), text, done: false };
}
