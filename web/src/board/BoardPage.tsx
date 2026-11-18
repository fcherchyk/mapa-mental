import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useParams } from 'react-router';
import type { BoardPlace, TaskStatus } from '../api/client';
import { Breadcrumb } from '../components/Breadcrumb';
import { DetailsPanel } from '../components/DetailsPanel';
import { NotFound } from '../components/NotFound';
import { ShortcutsHelp } from '../components/ShortcutsHelp';
import { ViewToggle } from '../components/ViewToggle';
import { TitleEditor } from '../map/nodes/TitleEditor';
import { STATUS_ORDER } from '../map/nodes/taskProps';
import { boardPathFor, useSession } from '../session';
import { BoardColumn } from './BoardColumn';
import { columnsOf, placeBeside, placeForGap, statusBeside, statusOf } from './boardOrder';
import { useBoardView } from './useBoardView';

interface DragState {
  draggingId: string | null;
  hover: { status: TaskStatus; gap: number } | null;
}

const NO_DRAG: DragState = { draggingId: null, hover: null };

/** The kanban board of the focused node (slice 4B): its task descendants in three columns. */
export function BoardPage() {
  const { me, logout } = useSession();
  const { nodeId } = useParams();
  const focusId = nodeId ?? me.root_node_id;
  const board = useBoardView(focusId);
  const { state, selectedId, pending } = board;
  const [helpOpen, setHelpOpen] = useState(false);
  const [drag, setDrag] = useState<DragState>(NO_DRAG);
  const mainRef = useRef<HTMLElement>(null);
  const titleFieldRef = useRef<HTMLInputElement>(null);
  // The card that should hold keyboard focus after the next render: a card moved by Alt+arrows
  // is drawn again in another column, and a panel edit gives the keyboard back to its card.
  const focusCard = useRef<string | null>(null);

  useEffect(() => {
    const id = focusCard.current;
    if (!id) return;
    focusCard.current = null;
    const card = mainRef.current?.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    (card ?? mainRef.current)?.focus();
  });

  const focusSelectedOrBoard = () => {
    focusCard.current = selectedId;
    if (!selectedId) mainRef.current?.focus();
  };

  // Escape cancels a drag or clears the selection, anywhere on the page but inside a field.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || helpOpen) return;
      if (drag.draggingId) {
        setDrag(NO_DRAG);
        event.preventDefault();
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return;
      board.clearSelection();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const columns = columnsOf(state?.tasks ?? []);

  const dropAtGap = (status: TaskStatus, gap: number) => {
    const id = drag.draggingId;
    setDrag(NO_DRAG);
    if (!id || !state) return;
    const place = placeForGap(columns[status], gap, id);
    if (place === undefined) return;
    board.move(id, status, place);
  };

  /** Enter, Delete and Alt+arrows on a card (decisions D4 to D6 and D8). */
  const onCardKeyDown = (id: string, event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    const card = state?.tasks.find((task) => task.id === id);
    if (!card) return;
    if (event.altKey) {
      const status = statusOf(card);
      let place: BoardPlace | null | undefined;
      let next: TaskStatus | null = status;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        next = statusBeside(status, event.key === 'ArrowLeft' ? -1 : 1);
        place = null;
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        place = placeBeside(columns[status], id, event.key === 'ArrowUp' ? -1 : 1);
      } else {
        return;
      }
      event.preventDefault();
      if (next === null || place === undefined) return;
      focusCard.current = id;
      if (place === null) board.setStatus(id, next);
      else board.move(id, next, place);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      board.select(id);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      board.remove(id);
    }
  };

  if (board.status === 'notFound') return <NotFound />;

  const panelNode = state && selectedId ? state.tasks.find((t) => t.id === selectedId) : undefined;
  const panelDetail = panelNode && !pending ? board.detailOf(panelNode.id) : null;
  const focusTitle = state?.focus.title ?? '';

  const toDoFooter = (
    <div className="board-column-footer">
      {pending && (
        <div className="board-card is-pending" data-testid={`card-${pending.id}`}>
          <span className="map-node-status is-to_do" aria-hidden="true" />
          <TitleEditor
            key={pending.id}
            initialTitle=""
            label="New task title"
            onCommit={board.commitCreate}
            onCancel={board.cancelCreate}
          />
        </div>
      )}
      {!pending && (
        <button type="button" className="board-add" onClick={board.startCreate}>
          + Add task
        </button>
      )}
    </div>
  );

  return (
    <div className="map-page board-page">
      <header className="map-header">
        {state && (
          <Breadcrumb
            ancestors={state.ancestors}
            focusTitle={focusTitle}
            rootId={me.root_node_id}
            linkTo={boardPathFor}
          />
        )}
        <div className="map-header-actions">
          <ViewToggle focusId={focusId} rootId={me.root_node_id} current="board" />
          <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />
          <span className="user-name">{me.name}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      {board.notice && (
        <div role="alert" className="notice">
          {board.notice}
          <button type="button" aria-label="Dismiss notice" onClick={board.dismissNotice}>
            ×
          </button>
        </div>
      )}
      <div className="map-body">
        <main
          className="board"
          ref={mainRef}
          tabIndex={-1}
          onClick={(event) => {
            // A click on the board itself, not on a card or a control, clears the selection.
            if (event.target === event.currentTarget) board.clearSelection();
          }}
        >
          {board.status === 'error' && <p role="alert">Could not load the board.</p>}
          {!state && board.status === 'loading' && <p>Loading…</p>}
          {state && (
            <>
              <h1 className="board-title">{focusTitle}</h1>
              {state.tasks.length === 0 && !pending && (
                <p className="map-hint board-hint">No tasks under {focusTitle}</p>
              )}
              <div className="board-columns">
                {STATUS_ORDER.map((status) => (
                  <BoardColumn
                    key={status}
                    status={status}
                    tasks={columns[status]}
                    selectedId={selectedId}
                    draggingId={drag.draggingId}
                    hoveredGap={drag.hover?.status === status ? drag.hover.gap : null}
                    onHoverGap={(gap) =>
                      setDrag((current) => ({
                        ...current,
                        hover: gap === null ? null : { status, gap },
                      }))
                    }
                    onDropAtGap={(gap) => dropAtGap(status, gap)}
                    onSelect={board.select}
                    onRemove={board.remove}
                    onCardKeyDown={onCardKeyDown}
                    onDragStart={(id) => setDrag({ draggingId: id, hover: null })}
                    onDragEnd={() => setDrag(NO_DRAG)}
                    footer={status === 'to_do' ? toDoFooter : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </main>
        {panelNode && panelDetail && (
          <DetailsPanel
            nodeId={panelNode.id}
            kind={panelNode.kind}
            title={panelNode.title}
            detail={panelDetail}
            titleRef={titleFieldRef}
            onSave={board.saveDetails}
            onRetry={board.retryDetail}
            onDone={focusSelectedOrBoard}
          />
        )}
      </div>
    </div>
  );
}
