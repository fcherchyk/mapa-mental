import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '../components/Breadcrumb';
import { DeleteDialog } from '../components/DeleteDialog';
import { NotFound } from '../components/NotFound';
import { SettingsPanel } from '../components/SettingsPanel';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { pathFor, useSession } from '../session';
import { MapCanvas } from './MapCanvas';
import { NodeActionsContext, type NodeActions } from './nodes/nodeActions';
import { isRealRoot, moveSelection, type ArrowKey } from './tree';
import { useMapView } from './useMapView';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Keys on fields, buttons or links keep their normal behavior. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
  );
}

/**
 * Focus is not on any live element, or it stayed on the map editor that was just closed.
 * React Flow unmounts the editor one render later, so it may still be focused.
 */
function isFocusLost(canvas: HTMLElement | null): boolean {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) return true;
  return active instanceof HTMLInputElement && canvas !== null && canvas.contains(active);
}

export function MapPage() {
  const { me, depth, setDepth, logout } = useSession();
  const { nodeId } = useParams();
  const focusId = nodeId ?? me.root_node_id;
  const navigate = useNavigate();
  const view = useMapView(focusId, depth);
  const { state, selectedId, editingId } = view;
  const [helpOpen, setHelpOpen] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const wasEditing = useRef(false);

  // When an edit ends (pencil, +, Tab or F2) focus returns to the map so the shortcuts keep
  // working. If the edit opens a sibling (Enter), focus does not return until no edit is left.
  useEffect(() => {
    if (editingId) {
      wasEditing.current = true;
      return;
    }
    if (wasEditing.current && isFocusLost(canvasRef.current)) canvasRef.current?.focus();
    wasEditing.current = false;
  }, [editingId]);

  // When the delete dialog closes (any option) focus returns to the map.
  const deleting = view.deleteRequest !== null;
  const wasDeleting = useRef(false);
  useEffect(() => {
    if (!deleting && wasDeleting.current) canvasRef.current?.focus();
    wasDeleting.current = deleting;
  }, [deleting]);

  const goTo = (id: string) => navigate(pathFor(id, me.root_node_id));

  /** Double click: focuses the node; on the focus it goes up one level; on the real root, nothing. */
  const open = (id: string) => {
    if (!state || state.nodes[id]?.pending) return;
    if (id !== state.focusId) {
      goTo(id);
      return;
    }
    const parent = state.ancestors[state.ancestors.length - 1];
    if (!isRealRoot(state, id) && parent) goTo(parent.id);
  };

  const actions: NodeActions = {
    select: view.select,
    open,
    createChild: (id) => view.startCreateChild(id, goTo),
    startEdit: view.startEdit,
    remove: (id) => view.remove(id, goTo),
    commitEdit: view.commitEdit,
    cancelEdit: view.cancelEdit,
  };

  // No loaded children and none on the server: the hint invites adding the first idea.
  const rootIsEmpty =
    state !== null &&
    isRealRoot(state, state.focusId) &&
    state.nodes[state.focusId].child_count === 0 &&
    (state.childIds[state.focusId] ?? []).length === 0;

  const handleKey = (event: KeyboardEvent) => {
    if (!state || !selectedId || editingId || helpOpen || view.deleteRequest) return;
    if (isInteractiveTarget(event.target)) return;
    const handled = runShortcut(event.key, selectedId);
    if (handled) event.preventDefault();
  };

  const runShortcut = (key: string, id: string): boolean => {
    if (!state) return false;
    if (ARROW_KEYS.has(key)) {
      view.select(moveSelection(state, id, key as ArrowKey));
      return true;
    }
    switch (key) {
      case 'Tab':
        view.startCreateChild(id, goTo);
        return true;
      case 'Enter':
        if (id !== state.focusId) open(id);
        return true;
      case 'Backspace':
        open(state.focusId);
        return true;
      case 'F2':
        view.startEdit(id);
        return true;
      case ' ':
        view.toggleCollapse(id);
        return true;
      case 'Delete':
        view.remove(id, goTo);
        return true;
      default:
        return false;
    }
  };

  // The listener is replaced on every render so it sees the current state.
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  if (view.status === 'notFound') return <NotFound />;

  return (
    <div className="map-page">
      <header className="map-header">
        {state && (
          <Breadcrumb
            ancestors={state.ancestors}
            focusTitle={state.nodes[state.focusId]?.title ?? ''}
            rootId={me.root_node_id}
          />
        )}
        <div className="map-header-actions">
          <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
          <SettingsPanel depth={depth} onDepthChange={setDepth} />
          <span className="user-name">{me.name}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      {view.notice && (
        <div role="alert" className="notice">
          {view.notice}
          <button type="button" aria-label="Dismiss notice" onClick={view.dismissNotice}>
            ×
          </button>
        </div>
      )}
      <main className="map-canvas" ref={canvasRef} tabIndex={-1}>
        {view.status === 'error' && <p role="alert">Could not load the map.</p>}
        {!state && view.status === 'loading' && <p>Loading…</p>}
        {state && (
          <NodeActionsContext.Provider value={actions}>
            <MapCanvas state={state} selectedId={selectedId} editingId={editingId} />
          </NodeActionsContext.Provider>
        )}
        {rootIsEmpty && <p className="map-hint">Tap + or Tab to add an idea</p>}
      </main>
      {view.deleteRequest && (
        <DeleteDialog
          request={view.deleteRequest}
          onChoose={view.confirmRemove}
          onCancel={view.cancelRemove}
        />
      )}
    </div>
  );
}
