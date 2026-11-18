import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { ChecklistItem } from '../api/client';
import {
  CHECKLIST_MAX_ITEMS,
  ITEM_TEXT_MAX_LENGTH,
  newChecklistItem,
} from '../map/nodes/taskProps';

const EMPTY_ITEM_ERROR = "Item text can't be empty";

interface ChecklistEditorProps {
  checklist: ChecklistItem[];
  /** Saves the whole list: a task's props always travel together (slice 4A, decision D5). */
  onChange: (checklist: ChecklistItem[]) => void;
  /** Gives the keyboard back to the map, as the other panel fields do (S3_FE_AC14). */
  onDone: () => void;
}

/**
 * A task's checklist (slice 4A, decision D13): add, toggle, rename, remove and reorder by
 * dragging. Every change replaces the whole list, which the panel sends as one `PATCH`.
 */
export function ChecklistEditor({ checklist, onChange, onDone }: ChecklistEditorProps) {
  const [newText, setNewText] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overGap, setOverGap] = useState<number | null>(null);
  const full = checklist.length >= CHECKLIST_MAX_ITEMS;

  const endDrag = () => {
    setDraggingId(null);
    setOverGap(null);
  };

  // Escape cancels the drag, as it does on the map (S2_FE_AC10).
  useEffect(() => {
    if (!draggingId) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') endDrag();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [draggingId]);

  const addItem = () => {
    const text = newText.trim();
    setNewText('');
    if (!text || full) return;
    onChange([...checklist, newChecklistItem(text)]);
  };

  const replaceItem = (id: string, change: Partial<ChecklistItem>) => {
    onChange(checklist.map((item) => (item.id === id ? { ...item, ...change } : item)));
  };

  const removeItem = (id: string) => {
    onChange(checklist.filter((item) => item.id !== id));
  };

  /** Moves the dragged item to the gap at `gap`; the two gaps around it change nothing. */
  const dropAt = (gap: number) => {
    const id = draggingId;
    endDrag();
    if (!id) return;
    const from = checklist.findIndex((item) => item.id === id);
    if (from === -1 || gap === from || gap === from + 1) return;
    const rest = checklist.filter((item) => item.id !== id);
    const to = gap > from ? gap - 1 : gap;
    onChange([...rest.slice(0, to), checklist[from], ...rest.slice(to)]);
  };

  const gap = (index: number) =>
    draggingId && (
      <li
        className={`checklist-gap ${overGap === index ? 'is-hovered' : ''}`}
        data-testid={`checklist-gap-${index}`}
        onDragOver={(event) => {
          event.preventDefault();
          setOverGap(index);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dropAt(index);
        }}
      />
    );

  const onNewItemKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addItem();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setNewText('');
      onDone();
    }
  };

  return (
    <div className="checklist">
      <ul className="checklist-items" aria-label="Checklist">
        {checklist.map((item, index) => (
          <ChecklistRow
            key={item.id}
            item={item}
            gapBefore={gap(index)}
            dragging={item.id === draggingId}
            onDragStart={() => setDraggingId(item.id)}
            onDragEnd={endDrag}
            onToggle={() => replaceItem(item.id, { done: !item.done })}
            onRename={(text) => replaceItem(item.id, { text })}
            onRemove={() => removeItem(item.id)}
            onDone={onDone}
          />
        ))}
        {gap(checklist.length)}
      </ul>
      <label className="details-field">
        <span>New item</span>
        <input
          value={newText}
          disabled={full}
          maxLength={ITEM_TEXT_MAX_LENGTH}
          onChange={(event) => setNewText(event.target.value)}
          onKeyDown={onNewItemKey}
          onBlur={addItem}
        />
      </label>
      <p className="details-counter" aria-live="polite">
        {checklist.length} / {CHECKLIST_MAX_ITEMS}
      </p>
    </div>
  );
}

interface ChecklistRowProps {
  item: ChecklistItem;
  gapBefore: ReactNode;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRemove: () => void;
  onDone: () => void;
}

function ChecklistRow({
  item,
  gapBefore,
  dragging,
  onDragStart,
  onDragEnd,
  onToggle,
  onRename,
  onRemove,
  onDone,
}: ChecklistRowProps) {
  const [draft, setDraft] = useState(item.text);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: blur runs right after Escape changed the draft, before a re-render.
  const current = useRef(item.text);
  const editing = useRef(false);

  // The saved text changing underneath (a rollback, another save) replaces the draft unless the
  // user is typing in it, the same rule the title and description follow (slice 3).
  useEffect(() => {
    if (editing.current) return;
    current.current = item.text;
    setDraft(item.text);
  }, [item.text]);

  const save = () => {
    editing.current = false;
    const text = current.current.trim();
    if (!text) {
      setError(EMPTY_ITEM_ERROR);
      current.current = item.text;
      setDraft(item.text);
      return;
    }
    current.current = text;
    setDraft(text);
    if (text !== item.text) onRename(text);
  };

  const discard = () => {
    editing.current = false;
    current.current = item.text;
    setDraft(item.text);
    setError(null);
    onDone();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      discard();
    }
  };

  return (
    <>
      {gapBefore}
      <li
        className={`checklist-item ${dragging ? 'is-dragging' : ''}`}
        draggable
        onDragStart={(event) => {
          event.dataTransfer?.setData('text/plain', item.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <span className="checklist-handle" aria-hidden="true">
          ⠿
        </span>
        <input type="checkbox" aria-label={item.text} checked={item.done} onChange={onToggle} />
        <input
          className="checklist-text"
          aria-label={`Edit ${item.text}`}
          aria-invalid={error !== null}
          value={draft}
          maxLength={ITEM_TEXT_MAX_LENGTH}
          onFocus={() => (editing.current = true)}
          onChange={(event) => {
            editing.current = true;
            current.current = event.target.value;
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={() => editing.current && save()}
          onKeyDown={onKeyDown}
        />
        <button type="button" aria-label={`Remove ${item.text}`} onClick={onRemove}>
          ×
        </button>
        {error && (
          <p role="alert" className="details-error">
            {error}
          </p>
        )}
      </li>
    </>
  );
}
