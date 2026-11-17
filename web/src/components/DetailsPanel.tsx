import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import type { DetailState, DetailsChange } from '../map/useMapView';

export const DESCRIPTION_MAX_LENGTH = 1000;
const EMPTY_TITLE_ERROR = "Title can't be empty";

interface DetailsPanelProps {
  nodeId: string;
  /** The title as the canvas shows it: the window is its source of truth. */
  title: string;
  detail: DetailState;
  titleRef: RefObject<HTMLInputElement | null>;
  onSave: (id: string, change: DetailsChange) => void;
  onRetry: (id: string) => void;
  /** Gives the keyboard back to the map (S3_FE_AC14). */
  onDone: () => void;
}

/**
 * The selected node's title and description, always editable (slice 3). Each field saves when it
 * loses focus with a value different from the last saved one (decision D4); Escape discards and
 * Enter in the title saves, both giving the keyboard back to the map (decision D5).
 */
export function DetailsPanel(props: DetailsPanelProps) {
  // A new node starts from a clean slate: drafts, errors and "last saved" all belong to one node.
  return <DetailsForm key={props.nodeId} {...props} />;
}

function DetailsForm({ nodeId, title, detail, titleRef, onSave, onRetry, onDone }: DetailsPanelProps) {
  const savedDescription = detail.status === 'ready' ? detail.detail.description : '';
  const [titleDraft, setTitleDraft] = useState(title);
  const [descriptionDraft, setDescriptionDraft] = useState(savedDescription);
  const [titleError, setTitleError] = useState<string | null>(null);
  // Refs, not state: blur runs right after Escape or Enter changed the draft, before a re-render.
  const drafts = useRef({ title, description: savedDescription });
  const saved = useRef({ title, description: savedDescription });
  const editing = useRef({ title: false, description: false });

  // Values that change underneath (a save answered, a rollback, the detail arrived) replace the
  // draft unless the user is typing in that field.
  useEffect(() => {
    saved.current.title = title;
    if (!editing.current.title) {
      drafts.current.title = title;
      setTitleDraft(title);
    }
  }, [title]);
  useEffect(() => {
    saved.current.description = savedDescription;
    if (!editing.current.description) {
      drafts.current.description = savedDescription;
      setDescriptionDraft(savedDescription);
    }
  }, [savedDescription]);

  const saveTitle = () => {
    editing.current.title = false;
    const next = drafts.current.title.trim();
    if (!next) {
      setTitleError(EMPTY_TITLE_ERROR);
      drafts.current.title = saved.current.title;
      setTitleDraft(saved.current.title);
      return;
    }
    drafts.current.title = next;
    setTitleDraft(next);
    if (next === saved.current.title) return;
    saved.current.title = next;
    onSave(nodeId, { title: next });
  };

  const saveDescription = () => {
    editing.current.description = false;
    if (detail.status !== 'ready') return;
    const next = drafts.current.description;
    if (next === saved.current.description) return;
    saved.current.description = next;
    onSave(nodeId, { description: next });
  };

  // A field still focused when the panel goes away (another node, the panel closing) is saved too.
  const saveTitleRef = useRef(saveTitle);
  const saveDescriptionRef = useRef(saveDescription);
  saveTitleRef.current = saveTitle;
  saveDescriptionRef.current = saveDescription;
  useEffect(
    () => () => {
      if (editing.current.title) saveTitleRef.current();
      if (editing.current.description) saveDescriptionRef.current();
    },
    [],
  );

  const discard = (field: 'title' | 'description') => {
    drafts.current[field] = saved.current[field];
    if (field === 'title') {
      setTitleDraft(saved.current.title);
      setTitleError(null);
    } else {
      setDescriptionDraft(saved.current.description);
    }
    editing.current[field] = false;
    onDone();
  };

  const onTitleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitle();
      onDone();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      discard('title');
    }
  };

  const onDescriptionKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      discard('description');
    }
  };

  // Escape in a field is the panel's, not the map's "clear the selection".
  const stop = (event: KeyboardEvent) => event.stopPropagation();

  return (
    <aside className="details-panel" aria-label="Idea details" onKeyDown={stop}>
      <label className="details-field">
        <span>Title</span>
        <input
          ref={titleRef}
          value={titleDraft}
          aria-invalid={titleError !== null}
          aria-describedby={titleError ? 'details-title-error' : undefined}
          onFocus={() => (editing.current.title = true)}
          onChange={(event) => {
            editing.current.title = true;
            drafts.current.title = event.target.value;
            setTitleDraft(event.target.value);
            setTitleError(null);
          }}
          onBlur={() => editing.current.title && saveTitle()}
          onKeyDown={onTitleKey}
        />
      </label>
      {titleError && (
        <p id="details-title-error" role="alert" className="details-error">
          {titleError}
        </p>
      )}
      <label className="details-field">
        <span>Description</span>
        <textarea
          value={descriptionDraft}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={8}
          disabled={detail.status !== 'ready'}
          onFocus={() => (editing.current.description = true)}
          onChange={(event) => {
            editing.current.description = true;
            drafts.current.description = event.target.value;
            setDescriptionDraft(event.target.value);
          }}
          onBlur={() => editing.current.description && saveDescription()}
          onKeyDown={onDescriptionKey}
        />
      </label>
      <p className="details-counter" aria-live="polite">
        {descriptionDraft.length} / {DESCRIPTION_MAX_LENGTH}
      </p>
      {detail.status === 'loading' && <p className="details-status">Loading…</p>}
      {detail.status === 'error' && (
        <p role="alert" className="details-error">
          Could not load the description.{' '}
          <button type="button" onClick={() => onRetry(nodeId)}>
            Retry
          </button>
        </p>
      )}
    </aside>
  );
}
