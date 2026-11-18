import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '../components/Breadcrumb';
import { DeleteDialog } from '../components/DeleteDialog';
import { DetailsPanel } from '../components/DetailsPanel';
import { NotFound } from '../components/NotFound';
import { SettingsPanel } from '../components/SettingsPanel';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { ViewToggle } from '../components/ViewToggle';
import { pathFor, useSession } from '../session';
import { isUsefulTarget, type DropTarget } from './dropTarget';
import { MapCanvas, type DragState } from './MapCanvas';
import { NodeActionsContext, type NodeActions } from './nodes/nodeActions';
import { allowsChildren, TASK_KIND } from './nodes/taskProps';
import { isRealRoot, moveSelection, visibleChildren, type ArrowKey } from './tree';
import { useMapView } from './useMapView';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Keys on fields, buttons or links keep their normal behavior. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
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
  const [drag, setDrag] = useState<DragState>({ draggingId: null, hover: null });
  const canvasRef = useRef<HTMLElement>(null);
  const wasEditing = useRef(false);

  const titleFieldRef = useRef<HTMLInputElement>(null);
  const focusMap = () => canvasRef.current?.focus();

  // When an inline creation ends (+ or Tab) focus returns to the map so the shortcuts keep
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
      // A leaf kind has nothing to show when focused (slice 4A, decision D10).
      if (!allowsChildren(state.nodes[id]?.kind ?? '')) return;
      goTo(id);
      return;
    }
    const parent = state.ancestors[state.ancestors.length - 1];
    if (!isRealRoot(state, id) && parent) goTo(parent.id);
  };

  /** Runs a move if the target is allowed and would change something (S2_FE_AC8). */
  const applyMove = (draggedId: string, target: DropTarget): boolean => {
    if (!state || !isUsefulTarget(state, draggedId, target)) return false;
    view.move(draggedId, target);
    return true;
  };

  const endDrag = () => setDrag({ draggingId: null, hover: null });

  const actions: NodeActions = {
    select: view.select,
    open,
    createChild: (id, kind) => view.startCreateChild(id, goTo, kind),
    clearSelection: view.clearSelection,
    remove: (id) => view.remove(id, goTo),
    commitEdit: view.commitEdit,
    cancelEdit: view.cancelEdit,
    dragStart: (id) => {
      view.select(id);
      setDrag({ draggingId: id, hover: null });
    },
    dragEnd: endDrag,
    dragOver: (target) => {
      if (!drag.draggingId || !state) return false;
      setDrag((current) => ({ ...current, hover: target }));
      return isUsefulTarget(state, drag.draggingId, target);
    },
    drop: (target) => {
      const draggedId = drag.draggingId;
      endDrag();
      if (draggedId) applyMove(draggedId, target);
    },
  };

  // No loaded children and none on the server: the hint invites adding the first idea.
  const rootIsEmpty =
    state !== null &&
    isRealRoot(state, state.focusId) &&
    state.nodes[state.focusId].child_count === 0 &&
    (state.childIds[state.focusId] ?? []).length === 0;

  /**
   * Alt + arrows move the selected idea (S2_FE_AC14 to AC16). Out of the sibling list, and
   * through the keyboard too, a new parent always takes the idea as its last child (decision D3).
   */
  const moveWithKeyboard = (id: string, key: ArrowKey): boolean => {
    if (!state) return false;
    const parentId = state.nodes[id]?.parent_id;
    if (!parentId || id === state.focusId) return true;
    const siblings = visibleChildren(state, parentId);
    const index = siblings.indexOf(id);
    if (key === 'ArrowUp') {
      const afterId = index >= 2 ? siblings[index - 2] : null;
      if (index > 0) applyMove(id, { kind: 'sibling', parentId, afterId });
      return true;
    }
    if (key === 'ArrowDown') {
      const next = siblings[index + 1];
      if (next) applyMove(id, { kind: 'sibling', parentId, afterId: next });
      return true;
    }
    if (key === 'ArrowRight') {
      const previous = siblings[index - 1];
      if (previous) applyMove(id, { kind: 'child', parentId: previous });
      return true;
    }
    const grandparentId = state.nodes[parentId]?.parent_id;
    // Outdenting past the focus is not possible: its parent is not on the canvas.
    if (grandparentId && parentId !== state.focusId) {
      applyMove(id, { kind: 'child', parentId: grandparentId });
    }
    return true;
  };

  const handleKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && drag.draggingId) {
      endDrag();
      event.preventDefault();
      return;
    }
    if (!state || editingId || helpOpen || view.deleteRequest) return;
    if (isInteractiveTarget(event.target)) return;
    if (!selectedId) {
      // Nothing selected (decision D7): the arrows bring the selection back, on the focus.
      if (ARROW_KEYS.has(event.key) && !event.altKey) {
        view.select(state.focusId);
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Escape') {
      view.clearSelection();
      event.preventDefault();
      return;
    }
    if (event.altKey) {
      if (!ARROW_KEYS.has(event.key)) return;
      if (moveWithKeyboard(selectedId, event.key as ArrowKey)) event.preventDefault();
      return;
    }
    // Shift+Tab creates a task where Tab creates an idea (slice 4A, decision D9).
    if (event.key === 'Tab' && event.shiftKey) {
      view.startCreateChild(selectedId, goTo, TASK_KIND);
      event.preventDefault();
      return;
    }
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
        // Editing happens in the details panel (S3_FE_AC15).
        titleFieldRef.current?.focus();
        titleFieldRef.current?.select();
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

  // The panel shows the selection, except while a node is being created inline (decision D8).
  const selectedNode = state && selectedId ? state.nodes[selectedId] : undefined;
  const panelNode = selectedNode && !selectedNode.pending && !editingId ? selectedNode : undefined;
  const panelDetail = panelNode ? view.detailOf(panelNode.id) : null;

  if (view.status === 'notFound') return <NotFound />;

  return (
    <div className="map-page">
      <header className="map-header">
        {state && (
          <Breadcrumb
            ancestors={state.ancestors}
            focusTitle={state.nodes[state.focusId]?.title ?? ''}
            rootId={me.root_node_id}
            onDropOn={
              drag.draggingId ? (parentId) => actions.drop({ kind: 'child', parentId }) : undefined
            }
            acceptsDrop={(parentId) =>
              Boolean(
                drag.draggingId &&
                state &&
                isUsefulTarget(state, drag.draggingId, { kind: 'child', parentId }),
              )
            }
          />
        )}
        <div className="map-header-actions">
          <ViewToggle focusId={focusId} rootId={me.root_node_id} current="map" />
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
      <div className="map-body">
        <main className="map-canvas" ref={canvasRef} tabIndex={-1}>
          {view.status === 'error' && <p role="alert">Could not load the map.</p>}
          {!state && view.status === 'loading' && <p>Loading…</p>}
          {state && (
            <NodeActionsContext.Provider value={actions}>
              <MapCanvas state={state} selectedId={selectedId} editingId={editingId} drag={drag} />
            </NodeActionsContext.Provider>
          )}
          {rootIsEmpty && <p className="map-hint">Tap + or Tab to add an idea</p>}
        </main>
        {panelNode && panelDetail && (
          <DetailsPanel
            nodeId={panelNode.id}
            kind={panelNode.kind}
            title={panelNode.title}
            detail={panelDetail}
            titleRef={titleFieldRef}
            onSave={view.saveDetails}
            onRetry={view.retryDetail}
            onDone={focusMap}
          />
        )}
      </div>
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
