import { lazy, Suspense, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { NodeDetail } from '../../api/client';
import type { DocumentActions } from '../../map/useMapView';
import { CONTENT_MAX_LENGTH } from './documentLimits';

const RichDocumentEditor = lazy(() => import('./RichDocumentEditor'));

/** Idle time after the last change before the document saves itself (slice 5, decision D5). */
export const AUTOSAVE_DELAY_MS = 2000;

/** The last mode used, remembered per browser (decision D4). */
export const MODE_STORAGE_KEY = 'mindmap.documentEditorMode';

export type EditorMode = 'plain' | 'rich';

export const TOO_LONG_MESSAGE = `Over ${CONTENT_MAX_LENGTH.toLocaleString('en-US')} characters: shorten it to save.`;

export function storedMode(): EditorMode {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === 'plain' ? 'plain' : 'rich';
  } catch {
    return 'rich';
  }
}

function rememberMode(mode: EditorMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Private windows may refuse storage; the mode then lasts until the panel closes.
  }
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed' | 'tooLong' | 'conflict';

const STATUS_TEXT: Partial<Record<SaveState, string>> = {
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  tooLong: TOO_LONG_MESSAGE,
};

/** States in which closing the tab would lose text (decision D5). */
const UNSAVED: SaveState[] = ['dirty', 'saving', 'failed', 'tooLong', 'conflict'];

interface DocumentEditorProps {
  nodeId: string;
  detail: NodeDetail;
  actions: DocumentActions;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Focus the editor once it is ready: the document was just created (decision D9). */
  autoFocus: boolean;
  onAutoFocused: () => void;
  /** Gives the keyboard back to the map. */
  onDone: () => void;
}

/**
 * A document's body in the details panel (slice 5): raw Markdown in a textarea, or rich text with
 * a toolbar. The draft is always Markdown, whatever the mode.
 *
 * Saving (decision D5): on blur, after two idle seconds, and when the panel goes away; closing
 * the tab with unsaved text asks first. A `409` never throws the draft away: the user chooses to
 * overwrite the other change or to discard their own.
 */
export function DocumentEditor({
  nodeId,
  detail,
  actions,
  expanded,
  onToggleExpanded,
  autoFocus,
  onAutoFocused,
  onDone,
}: DocumentEditorProps) {
  const [mode, setMode] = useState<EditorMode>(storedMode);
  const [draft, setDraft] = useState(detail.content);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [linkError, setLinkError] = useState<string | null>(null);
  // A new revision remounts the rich editor: its content changed from outside (discard, mode).
  const [revision, setRevision] = useState(0);
  const draftRef = useRef(detail.content);
  const savedRef = useRef(detail.content);
  const inFlight = useRef(false);
  const inFlightContent = useRef<string | null>(null);
  const saveAgain = useRef(false);
  const conflict = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // The server's content changed underneath (a save answered, a reload): it is the new "saved".
  // An untouched draft follows it; a draft with changes is kept, so "Overwrite" can send it.
  useEffect(() => {
    const previous = savedRef.current;
    savedRef.current = detail.content;
    if (draftRef.current === previous) {
      draftRef.current = detail.content;
      setDraft(detail.content);
    }
  }, [detail.content]);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  const save = async (): Promise<void> => {
    clearTimer();
    if (conflict.current) return;
    const content = draftRef.current;
    if (content === savedRef.current) return;
    if (content.length > CONTENT_MAX_LENGTH) {
      setSaveState('tooLong');
      return;
    }
    if (inFlight.current) {
      saveAgain.current = true;
      return;
    }
    inFlight.current = true;
    inFlightContent.current = content;
    setSaveState('saving');
    const outcome = await actions.save(nodeId, content);
    inFlight.current = false;
    inFlightContent.current = null;
    if (!mounted.current) return;
    if (outcome === 'saved') {
      savedRef.current = content;
      setSaveState(draftRef.current === content ? 'saved' : 'dirty');
      if (saveAgain.current || draftRef.current !== content) {
        saveAgain.current = false;
        void save();
      }
      return;
    }
    saveAgain.current = false;
    if (outcome === 'conflict') conflict.current = true;
    setSaveState(outcome);
  };

  // Handlers registered once (unmount, beforeunload) must reach the latest closures.
  const saveRef = useRef(save);
  saveRef.current = save;

  const change = (next: string) => {
    draftRef.current = next;
    setDraft(next);
    if (conflict.current) return;
    if (next === savedRef.current) {
      clearTimer();
      setSaveState(inFlight.current ? 'saving' : 'idle');
      return;
    }
    setSaveState(next.length > CONTENT_MAX_LENGTH ? 'tooLong' : 'dirty');
    clearTimer();
    timer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_DELAY_MS);
  };

  // Text still unsaved when the panel goes away (another node, a new focus) is saved too; a
  // failure there can no longer be shown here, so the map reports it (decision D5).
  useEffect(
    () => () => {
      mounted.current = false;
      clearTimer();
      // A save in flight already carries its content; only what came after it is left.
      const sent = inFlightContent.current ?? savedRef.current;
      if (draftRef.current !== sent && draftRef.current.length <= CONTENT_MAX_LENGTH) {
        void actions.save(nodeId, draftRef.current, { detached: true });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on unmount
    [],
  );

  const unsaved = UNSAVED.includes(saveState);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need `returnValue` set to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // A document that was just created opens with its editor focused (decision D9).
  useEffect(() => {
    if (!autoFocus || mode !== 'plain') return;
    textareaRef.current?.focus();
    onAutoFocused();
  }, [autoFocus, mode, onAutoFocused]);

  const chooseMode = (next: EditorMode) => {
    if (next === mode) return;
    rememberMode(next);
    setLinkError(null);
    setMode(next);
    setRevision((count) => count + 1);
  };

  /** Escape never discards a document: it collapses the expanded editor, or saves and leaves. */
  const escape = () => {
    if (expanded) {
      onToggleExpanded();
      return;
    }
    void save();
    onDone();
  };

  const overwrite = async () => {
    const fresh = await actions.refresh(nodeId);
    if (!mounted.current || !fresh) {
      if (mounted.current) setSaveState('conflict');
      return;
    }
    conflict.current = false;
    // The refreshed content became "saved"; the draft stays and is sent with the new version.
    savedRef.current = fresh.content;
    if (draftRef.current === fresh.content) {
      setSaveState('saved');
      return;
    }
    await save();
  };

  const discard = async () => {
    const fresh = await actions.refresh(nodeId);
    if (!mounted.current || !fresh) return;
    conflict.current = false;
    savedRef.current = fresh.content;
    draftRef.current = fresh.content;
    setDraft(fresh.content);
    setRevision((count) => count + 1);
    setSaveState('idle');
  };

  /**
   * Tab writes a tab and Shift+Tab stays in the editor: the keyboard leaves it with Escape
   * (slice 5, decision D12). `insertText` keeps the browser's undo history; where it is missing
   * (tests), the text is spliced by hand.
   */
  const insertTab = (field: HTMLTextAreaElement) => {
    if (field.value.length >= CONTENT_MAX_LENGTH) return;
    const inserted =
      typeof document.execCommand === 'function' && document.execCommand('insertText', false, '\t');
    if (inserted) return;
    field.setRangeText('\t', field.selectionStart, field.selectionEnd, 'end');
    change(field.value);
  };

  const onTextareaKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.shiftKey) insertTab(event.currentTarget);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    escape();
  };

  return (
    <div
      className="document-editor"
      onBlur={(event) => {
        // Moving between the toolbar, the mode buttons and the text is not leaving the editor.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void save();
      }}
    >
      <div className="document-editor-bar">
        <div role="group" aria-label="Editor mode" className="document-modes">
          <button type="button" aria-pressed={mode === 'plain'} onClick={() => chooseMode('plain')}>
            Plain text
          </button>
          <button type="button" aria-pressed={mode === 'rich'} onClick={() => chooseMode('rich')}>
            Rich text
          </button>
        </div>
        <button
          type="button"
          className="document-expand"
          aria-pressed={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? 'Collapse editor' : 'Expand editor'}
        </button>
      </div>
      {mode === 'plain' ? (
        <textarea
          ref={textareaRef}
          className="document-plain"
          aria-label="Document"
          value={draft}
          maxLength={CONTENT_MAX_LENGTH}
          spellCheck
          onChange={(event) => change(event.target.value)}
          onKeyDown={onTextareaKey}
        />
      ) : (
        <Suspense fallback={<p className="details-status">Loading editor…</p>}>
          <RichDocumentEditor
            key={revision}
            initialContent={draft}
            onChange={change}
            onEscape={escape}
            onLinkError={setLinkError}
            autoFocus={autoFocus}
            onFocused={onAutoFocused}
          />
        </Suspense>
      )}
      {linkError && (
        <p role="alert" className="details-error">
          {linkError}
        </p>
      )}
      <div className="document-footer">
        <p className="details-status" role="status" aria-live="polite">
          {STATUS_TEXT[saveState] ?? ''}
        </p>
        <p className="details-counter">
          {draft.length.toLocaleString('en-US')} / {CONTENT_MAX_LENGTH.toLocaleString('en-US')}
        </p>
      </div>
      {saveState === 'failed' && (
        <p role="alert" className="details-error">
          Could not save the document.{' '}
          <button type="button" onClick={() => void save()}>
            Retry
          </button>
        </p>
      )}
      {saveState === 'conflict' && (
        <div role="alert" className="document-conflict">
          <p>This document changed elsewhere. Your text is kept here.</p>
          <button type="button" onClick={() => void overwrite()}>
            Overwrite
          </button>
          <button type="button" onClick={() => void discard()}>
            Discard mine and reload
          </button>
        </div>
      )}
    </div>
  );
}
