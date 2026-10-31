import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type NodeOut } from '../api/client';
import { useSession } from '../session';
import { cacheKey } from './viewCache';
import {
  childOfFocusToward,
  countDescendants,
  fromView,
  hasLoadedChildren,
  hiddenChildCount,
  insertChild,
  isBorder,
  patchNode,
  removeSubtree,
  replaceNode,
  selectionAfterDelete,
  visibleChildren,
  type MapNode,
  type MapState,
} from './tree';

export type ViewStatus = 'loading' | 'ready' | 'notFound' | 'error';

const CONFLICT_NOTICE = 'The idea changed elsewhere: the change was undone and the map reloaded.';
const FAILURE_NOTICE = 'Could not save the change: it was undone.';

/**
 * Creating a child that waits for the right window to arrive: the focus moved one level down
 * towards the node (`focusId`), or the collapsed node is being expanded (`expanding`).
 */
interface PendingCreate {
  parentId: string;
  focusId: string;
  goTo: (id: string) => void;
  expanding: boolean;
}

let temporaryIds = 0;

function newPendingNode(parentId: string, afterId: string | null): MapNode {
  temporaryIds += 1;
  return {
    id: `tmp-${temporaryIds}`,
    parent_id: parentId,
    kind: 'idea',
    title: '',
    sort_key: '',
    collapsed: false,
    props: {},
    version: 0,
    child_count: 0,
    pending: true,
    afterId,
  };
}

/** The cache does not store nodes that do not exist in the API yet. */
function withoutPending(state: MapState): MapState {
  return Object.values(state.nodes)
    .filter((node) => node.pending)
    .reduce((current, node) => removeSubtree(current, node.id), state);
}

function failureNotice(error: unknown): string {
  return error instanceof ApiError && error.status === 409 ? CONFLICT_NOTICE : FAILURE_NOTICE;
}

export type DeleteMode = 'cascade' | 'reparent';

/** Deletion of an inner node waiting for the user's choice in the dialog. */
export interface DeleteRequest {
  id: string;
  title: string;
  count: number;
  exact: boolean;
  onFocusDeleted: (parentId: string) => void;
}

export interface MapView {
  status: ViewStatus;
  state: MapState | null;
  selectedId: string | null;
  editingId: string | null;
  notice: string | null;
  select: (id: string) => void;
  startCreateChild: (parentId: string, goTo: (id: string) => void) => void;
  startEdit: (id: string) => void;
  commitEdit: (id: string, title: string, createSibling: boolean) => void;
  cancelEdit: (id: string) => void;
  toggleCollapse: (id: string) => void;
  remove: (id: string, onFocusDeleted: (parentId: string) => void) => void;
  deleteRequest: DeleteRequest | null;
  confirmRemove: (mode: DeleteMode) => void;
  cancelRemove: () => void;
  dismissNotice: () => void;
}

/** The focus's window with optimistic editing; API changes go one at a time, in order. */
export function useMapView(focusId: string, depth: number): MapView {
  const { api, cache } = useSession();
  const key = cacheKey(focusId, depth);
  const [state, setState] = useState<MapState | null>(null);
  const [status, setStatus] = useState<ViewStatus>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [reloads, setReloads] = useState(0);
  const stateRef = useRef<MapState | null>(null);
  const keyRef = useRef(key);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const resolvedIds = useRef(new Map<string, string>());
  const pendingCreate = useRef<PendingCreate | null>(null);

  const commit = useCallback((next: MapState | null) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    keyRef.current = key;
    const current = stateRef.current;
    const sameWindow = current?.focusId === focusId && current.depth === depth;
    const cached = cache.get(key);
    if (cached) {
      commit(cached);
      setStatus('ready');
      if (!sameWindow) setSelectedId(focusId);
      return;
    }
    if (!sameWindow) {
      commit(null);
      setStatus('loading');
    }
    let cancelled = false;
    api.getView(focusId, depth).then(
      (view) => {
        if (cancelled) return;
        const loaded = fromView(view, depth);
        cache.set(key, loaded);
        commit(loaded);
        setStatus('ready');
        if (!sameWindow) setSelectedId(focusId);
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
  }, [api, cache, commit, focusId, depth, key, reloads]);

  // Navigating to another focus cancels any pending creation that is not for that focus.
  useEffect(() => {
    if (pendingCreate.current && pendingCreate.current.focusId !== focusId) {
      pendingCreate.current = null;
    }
  }, [focusId]);

  const reloadFromServer = useCallback(() => {
    cache.delete(keyRef.current);
    setReloads((count) => count + 1);
  }, [cache]);

  /** Applies the change right away and sends it; if the API fails, reverts it and reloads. */
  const mutate = useCallback(
    <T>(
      apply: (state: MapState) => MapState,
      call: () => Promise<T>,
      onSuccess: (state: MapState, result: T) => MapState,
      revert?: (state: MapState) => MapState,
    ) => {
      const before = stateRef.current;
      if (!before) return;
      const windowKey = keyRef.current;
      commit(apply(before));
      const run = async () => {
        try {
          const result = await call();
          if (keyRef.current !== windowKey || !stateRef.current) {
            cache.clear();
            return;
          }
          const next = onSuccess(stateRef.current, result);
          commit(next);
          cache.clear();
          cache.set(windowKey, withoutPending(next));
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return;
          if (keyRef.current === windowKey && stateRef.current) {
            commit(revert ? revert(stateRef.current) : before);
          }
          setNotice(failureNotice(error));
          reloadFromServer();
        }
      };
      queueRef.current = queueRef.current.then(run);
    },
    [cache, commit, reloadFromServer],
  );

  const currentNode = (id: string): MapNode | undefined => stateRef.current?.nodes[id];

  const startNewNode = (parentId: string, afterId: string | null) => {
    const current = stateRef.current;
    if (!current) return;
    const node = newPendingNode(parentId, afterId);
    commit(insertChild(current, parentId, node, afterId));
    setSelectedId(node.id);
    setEditingId(node.id);
  };

  /** Changes `collapsed` in the API; when expanding, if children are missing, fetches them again. */
  const setCollapsed = (id: string, collapsing: boolean) => {
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node) return;
    const needsReload = !collapsing && !hasLoadedChildren(current, id);
    mutate(
      (state) => patchNode(state, id, { collapsed: collapsing }),
      () => api.updateNode(id, { collapsed: collapsing, version: currentNode(id)?.version ?? 0 }),
      (state, updated: NodeOut) => {
        if (needsReload) queueMicrotask(reloadFromServer);
        return patchNode(state, id, updated);
      },
    );
  };

  /**
   * Creates a child in edit mode. A child on the border or inside a collapsed node would not show:
   * on the border the focus moves one level down towards the node, and a collapsed node expands;
   * only then is the child created.
   */
  const startCreateChild = (parentId: string, goTo: (id: string) => void) => {
    const current = stateRef.current;
    const parent = current?.nodes[parentId];
    if (!current || !parent || parent.pending) return;
    if (isBorder(current, parentId)) {
      const step = childOfFocusToward(current, parentId);
      if (!step) return;
      pendingCreate.current = { parentId, focusId: step, goTo, expanding: false };
      goTo(step);
    } else if (parent.collapsed) {
      pendingCreate.current = { parentId, focusId: current.focusId, goTo, expanding: true };
      setCollapsed(parentId, false);
    } else {
      startNewNode(parentId, null);
    }
  };

  // Once the window the creation was waiting for arrives, go on with the child. If expanding
  // failed (the node is collapsed again), the creation is dropped.
  useEffect(() => {
    const pending = pendingCreate.current;
    if (!pending || !state || state.focusId !== pending.focusId) return;
    const parent = state.nodes[pending.parentId];
    if (!parent || parent.pending || (pending.expanding && parent.collapsed)) {
      pendingCreate.current = null;
      return;
    }
    if (pending.expanding && !hasLoadedChildren(state, parent.id)) return;
    pendingCreate.current = null;
    startCreateChild(parent.id, pending.goTo);
  });

  const startEdit = (id: string) => {
    const node = currentNode(id);
    if (node && !node.pending) setEditingId(id);
  };

  /** sort_key of the previous sibling, already created in the API when its turn in the queue comes. */
  const afterSortKey = (afterId: string | null | undefined): string | undefined => {
    if (!afterId) return undefined;
    const node = currentNode(resolvedIds.current.get(afterId) ?? afterId);
    return node && !node.pending ? node.sort_key : undefined;
  };

  const createNode = (node: MapNode, title: string) => {
    const parentId = node.parent_id as string;
    mutate(
      (current) => patchNode(current, node.id, { title }),
      () => {
        const after = afterSortKey(node.afterId);
        return api.createChild(
          parentId,
          after === undefined ? { title } : { title, after_sort_key: after },
        );
      },
      (current, created: NodeOut) => {
        resolvedIds.current.set(node.id, created.id);
        setSelectedId((selected) => (selected === node.id ? created.id : selected));
        return replaceNode(current, node.id, created);
      },
      (current) => removeSubtree(current, node.id),
    );
  };

  const renameNode = (id: string, title: string) => {
    mutate(
      (current) => patchNode(current, id, { title }),
      () => api.updateNode(id, { title, version: currentNode(id)?.version ?? 0 }),
      (current, updated: NodeOut) => patchNode(current, id, updated),
    );
  };

  const commitEdit = (id: string, rawTitle: string, createSibling: boolean) => {
    const node = currentNode(id);
    setEditingId(null);
    if (!node) return;
    const title = rawTitle.trim();
    if (node.pending) {
      if (!title) {
        cancelEdit(id);
        return;
      }
      createNode(node, title);
    } else if (title && title !== node.title) {
      renameNode(id, title);
    }
    if (createSibling && node.parent_id && id !== stateRef.current?.focusId) {
      startNewNode(node.parent_id, id);
    }
  };

  const cancelEdit = (id: string) => {
    setEditingId(null);
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node?.pending) return;
    setSelectedId(node.afterId ?? node.parent_id);
    commit(removeSubtree(current, id));
  };

  const toggleCollapse = (id: string) => {
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node || node.pending || isBorder(current, id)) return;
    const collapsing = !node.collapsed;
    if (collapsing ? visibleChildren(current, id).length === 0 : hiddenChildCount(current, id) === 0) {
      return;
    }
    setCollapsed(id, collapsing);
  };

  /** Leaf: deleted without asking. Inner node: opens the dialog and waits for the choice. */
  const remove = (id: string, onFocusDeleted: (parentId: string) => void) => {
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node || node.pending || node.parent_id === null) return;
    const { count, exact } = countDescendants(current, id);
    if (count === 0) {
      deleteNode(id, 'cascade', onFocusDeleted);
      return;
    }
    setDeleteRequest({ id, title: node.title, count, exact, onFocusDeleted });
  };

  const confirmRemove = (mode: DeleteMode) => {
    if (!deleteRequest) return;
    setDeleteRequest(null);
    deleteNode(deleteRequest.id, mode, deleteRequest.onFocusDeleted);
  };

  const cancelRemove = () => setDeleteRequest(null);

  const deleteNode = (
    id: string,
    mode: DeleteMode,
    onFocusDeleted: (parentId: string) => void,
  ) => {
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node || node.parent_id === null) return;
    const parentId = node.parent_id;
    const isFocus = id === current.focusId;
    const call = () => api.deleteNode(id, mode === 'reparent' ? { children: mode } : undefined);
    if (mode === 'reparent') {
      // Grandchildren move up a level and may enter the window: fetch it again, no optimism.
      const firstChild = current.childIds[id]?.[0];
      setSelectedId(firstChild ?? selectionAfterDelete(current, id));
      mutate(
        (state) => state,
        call,
        (state) => {
          queueMicrotask(isFocus ? () => onFocusDeleted(parentId) : reloadFromServer);
          return state;
        },
      );
      return;
    }
    if (isFocus) {
      mutate(
        (state) => state,
        call,
        (state) => {
          queueMicrotask(() => onFocusDeleted(parentId));
          return state;
        },
      );
      return;
    }
    setSelectedId(selectionAfterDelete(current, id));
    mutate(
      (state) => removeSubtree(state, id),
      call,
      (state) => state,
    );
  };

  return {
    status,
    state,
    selectedId: selectedId && state?.nodes[selectedId] ? selectedId : (state?.focusId ?? null),
    editingId,
    notice,
    select: setSelectedId,
    startCreateChild,
    startEdit,
    commitEdit,
    cancelEdit,
    toggleCollapse,
    remove,
    deleteRequest,
    confirmRemove,
    cancelRemove,
    dismissNotice: () => setNotice(null),
  };
}
