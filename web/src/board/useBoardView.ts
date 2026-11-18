import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type BoardPlace,
  type NodeDetail,
  type NodeOut,
  type TaskStatus,
} from '../api/client';
import { DetailCache, withoutDescription } from '../map/detailCache';
import { asProps, defaultTaskProps, TASK_KIND, taskPropsOf } from '../map/nodes/taskProps';
import type { DetailsChange, DetailState } from '../map/useMapView';
import { useSession } from '../session';
import { columnsOf, insertCard, moveCard } from './boardOrder';

export type BoardStatus = 'loading' | 'ready' | 'notFound' | 'error';

const CONFLICT_NOTICE = 'The task changed elsewhere: the change was undone and the board reloaded.';
const FAILURE_NOTICE = 'Could not save the change: it was undone.';

export interface BoardState {
  focus: NodeOut;
  ancestors: NodeOut[];
  /** Every task under the focus, in the map's board order (decision D2). */
  tasks: NodeOut[];
}

/** A card the API does not know yet: it is being typed in the To do column (decision D10). */
export interface PendingCard {
  id: string;
  afterId: string | null;
}

export interface BoardViewModel {
  status: BoardStatus;
  state: BoardState | null;
  selectedId: string | null;
  pending: PendingCard | null;
  notice: string | null;
  select: (id: string) => void;
  clearSelection: () => void;
  setStatus: (id: string, status: TaskStatus) => void;
  move: (id: string, status: TaskStatus, place: BoardPlace | null) => void;
  startCreate: () => void;
  commitCreate: (title: string, createAnother: boolean) => void;
  cancelCreate: () => void;
  remove: (id: string) => void;
  detailOf: (id: string) => DetailState | null;
  retryDetail: (id: string) => void;
  saveDetails: (id: string, change: DetailsChange) => void;
  dismissNotice: () => void;
}

let temporaryIds = 0;

function failureNotice(error: unknown): string {
  return error instanceof ApiError && error.status === 409 ? CONFLICT_NOTICE : FAILURE_NOTICE;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function replaceCard(tasks: NodeOut[], id: string, change: Partial<NodeOut>): NodeOut[] {
  return tasks.map((task) => (task.id === id ? { ...task, ...change } : task));
}

/**
 * The board of `focusId` with optimistic editing (slice 4B). It has no cache: every mount reads
 * the server (decision D13), and every change clears the map's window cache so the canvas is
 * fresh when the user switches back. Changes go one at a time, in order, as on the map.
 */
export function useBoardView(focusId: string): BoardViewModel {
  const { api, cache } = useSession();
  const [state, setState] = useState<BoardState | null>(null);
  const [status, setStatus] = useState<BoardStatus>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const details = useRef(new DetailCache());
  const [detailStatus, setDetailStatus] = useState<Record<string, 'loading' | 'error'>>({});
  const [, setDetailsRead] = useState(0);
  const stateRef = useRef<BoardState | null>(null);
  const focusRef = useRef(focusId);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  // Temporary ids of cards created in a chain, resolved to the API's when its turn comes.
  const resolvedIds = useRef(new Map<string, string>());

  const commit = useCallback((next: BoardState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    focusRef.current = focusId;
    if (stateRef.current?.focus.id !== focusId) {
      commit(null);
      setStatus('loading');
      setSelectedId(null);
      setPending(null);
    }
    let cancelled = false;
    api.getBoard(focusId).then(
      (board) => {
        if (cancelled) return;
        commit({ focus: board.focus, ancestors: board.ancestors, tasks: board.tasks });
        setStatus('ready');
      },
      (error: unknown) => {
        if (cancelled) return;
        const missing = error instanceof ApiError && [404, 422].includes(error.status);
        setStatus(missing ? 'notFound' : 'error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, commit, focusId, reloads]);

  const reloadFromServer = useCallback(() => setReloads((count) => count + 1), []);

  /** Applies the change right away and sends it; if the API fails, reverts it and reloads. */
  const mutate = useCallback(
    <T>(
      apply: (tasks: NodeOut[]) => NodeOut[],
      call: () => Promise<T>,
      onSuccess: (tasks: NodeOut[], result: T) => NodeOut[],
      onFailure?: () => void,
    ) => {
      const before = stateRef.current;
      if (!before) return;
      const focus = focusRef.current;
      commit({ ...before, tasks: apply(before.tasks) });
      const run = async () => {
        try {
          const result = await call();
          // The map's windows are stale now (decision D13).
          cache.clear();
          if (focusRef.current !== focus || !stateRef.current) return;
          commit({ ...stateRef.current, tasks: onSuccess(stateRef.current.tasks, result) });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          if (focusRef.current === focus && stateRef.current) {
            commit({ ...stateRef.current, tasks: before.tasks });
          }
          setNotice(failureNotice(error));
          onFailure?.();
          cache.clear();
          reloadFromServer();
        }
      };
      queueRef.current = queueRef.current.then(run);
    },
    [cache, commit, reloadFromServer],
  );

  const currentCard = (id: string): NodeOut | undefined =>
    stateRef.current?.tasks.find((task) => task.id === id);

  const versionOf = (id: string): number =>
    currentCard(id)?.version ?? details.current.get(id)?.version ?? 0;

  /** Alt+←/→ and the panel: the status changes and the rank is kept (decision D5). */
  const setCardStatus = (id: string, status: TaskStatus) => {
    const card = currentCard(id);
    if (!card || taskPropsOf(card).status === status) return;
    saveDetails(id, { props: { ...taskPropsOf(card), status } });
  };

  /** A drag or Alt+↑/↓: status and position in one `board-move` (decision D4). */
  const move = (id: string, status: TaskStatus, place: BoardPlace | null) => {
    if (!currentCard(id)) return;
    mutate(
      (tasks) => moveCard(tasks, id, status, place),
      () => api.boardMove(id, { status, place, version: versionOf(id) }),
      (tasks, moved: NodeOut) => {
        const known = details.current.get(id);
        if (known) details.current.set({ ...known, ...moved });
        return replaceCard(tasks, id, moved);
      },
    );
  };

  const lastToDoId = (): string | null => {
    const column = columnsOf(stateRef.current?.tasks ?? []).to_do;
    return column[column.length - 1]?.id ?? null;
  };

  const startCreate = () => {
    if (!stateRef.current || pending) return;
    temporaryIds += 1;
    setPending({ id: `tmp-board-${temporaryIds}`, afterId: lastToDoId() });
    setSelectedId(null);
  };

  const commitCreate = (rawTitle: string, createAnother: boolean) => {
    const current = pending;
    const board = stateRef.current;
    const title = rawTitle.trim();
    if (!current || !board) return;
    if (!title) {
      setPending(null);
      return;
    }
    const card: NodeOut = {
      id: current.id,
      parent_id: board.focus.id,
      kind: TASK_KIND,
      title,
      sort_key: '',
      collapsed: false,
      props: { ...defaultTaskProps() },
      version: 0,
      child_count: 0,
    };
    const afterId = current.afterId;
    mutate(
      (tasks) => insertCard(tasks, card, afterId),
      () => {
        // The previous card of the chain is created by now, with its real id.
        const after = afterId && (resolvedIds.current.get(afterId) ?? afterId);
        return api.createChild(board.focus.id, {
          title,
          kind: TASK_KIND,
          ...(after ? { board_place: { after_id: after } } : {}),
        });
      },
      (tasks, created: NodeOut) => {
        resolvedIds.current.set(current.id, created.id);
        const path = [...board.ancestors, board.focus].map(({ id, title }) => ({ id, title }));
        details.current.setCreated(created, path);
        return replaceCard(tasks, current.id, created);
      },
    );
    if (createAnother) {
      temporaryIds += 1;
      setPending({ id: `tmp-board-${temporaryIds}`, afterId: current.id });
    } else {
      setPending(null);
    }
  };

  const cancelCreate = () => setPending(null);

  /** Always a leaf, so never a dialog (decision D11). */
  const remove = (id: string) => {
    if (!currentCard(id)) return;
    setSelectedId((selected) => (selected === id ? null : selected));
    details.current.delete(id);
    mutate(
      (tasks) => tasks.filter((task) => task.id !== id),
      () => api.deleteNode(id),
      (tasks) => tasks,
    );
  };

  const loadDetail = (id: string) => {
    setDetailStatus((status) => ({ ...status, [id]: 'loading' }));
    api.getNode(id).then(
      (detail) => {
        details.current.set(detail);
        setDetailStatus((status) => withoutKey(status, id));
      },
      () => setDetailStatus((status) => ({ ...status, [id]: 'error' })),
    );
  };

  const detailOf = (id: string): DetailState | null => {
    if (!currentCard(id) || id.startsWith('tmp-')) return null;
    const detail = details.current.get(id);
    if (detail) return { status: 'ready', detail };
    return { status: detailStatus[id] === 'error' ? 'error' : 'loading' };
  };

  const visibleSelection =
    selectedId && state?.tasks.some((t) => t.id === selectedId) ? selectedId : null;
  useEffect(() => {
    if (!visibleSelection || visibleSelection.startsWith('tmp-')) return;
    if (details.current.get(visibleSelection) || detailStatus[visibleSelection]) return;
    loadDetail(visibleSelection);
  });

  /** The panel's saves: title and props show on the card at once; the description does not. */
  const saveDetails = (id: string, change: DetailsChange) => {
    if (!currentCard(id)) return;
    const { props, ...rest } = change;
    const body: { title?: string; description?: string; props?: Record<string, unknown> } =
      props === undefined ? rest : { ...rest, props: asProps(props) };
    const known = details.current.get(id);
    if (known) {
      details.current.set({ ...known, ...body });
      setDetailsRead((count) => count + 1);
    }
    const onCard: Partial<NodeOut> = {
      ...(body.title === undefined ? {} : { title: body.title }),
      ...(body.props === undefined ? {} : { props: body.props }),
    };
    mutate(
      (tasks) => (Object.keys(onCard).length === 0 ? tasks : replaceCard(tasks, id, onCard)),
      async () => {
        const updated = await api.updateNode(id, { ...body, version: versionOf(id) });
        if (body.title !== undefined) details.current.keepOnly(id);
        details.current.set(updated);
        setDetailsRead((count) => count + 1);
        return updated;
      },
      (tasks, updated: NodeDetail) => replaceCard(tasks, id, withoutDescription(updated)),
      () => {
        details.current.delete(id);
        setDetailStatus((status) => withoutKey(status, id));
      },
    );
  };

  return {
    status,
    state,
    selectedId: visibleSelection,
    pending,
    notice,
    select: setSelectedId,
    clearSelection: () => setSelectedId(null),
    setStatus: setCardStatus,
    move,
    startCreate,
    commitCreate,
    cancelCreate,
    remove,
    detailOf,
    retryDetail: loadDetail,
    saveDetails,
    dismissNotice: () => setNotice(null),
  };
}
