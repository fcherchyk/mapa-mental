import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, type NodeOut } from '../api/client';
import { useSession } from '../session';
import { cacheKey } from './viewCache';
import {
  countDescendants,
  fromView,
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

const CONFLICT_NOTICE = 'El nodo cambió en otro lado: se deshizo el cambio y se recargó el mapa.';
const FAILURE_NOTICE = 'No se pudo guardar el cambio: se deshizo.';

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

/** La caché no guarda nodos que todavía no existen en la API. */
function withoutPending(state: MapState): MapState {
  return Object.values(state.nodes)
    .filter((node) => node.pending)
    .reduce((current, node) => removeSubtree(current, node.id), state);
}

function failureNotice(error: unknown): string {
  return error instanceof ApiError && error.status === 409 ? CONFLICT_NOTICE : FAILURE_NOTICE;
}

export interface MapView {
  status: ViewStatus;
  state: MapState | null;
  selectedId: string | null;
  editingId: string | null;
  notice: string | null;
  select: (id: string) => void;
  startCreateChild: (parentId: string) => void;
  startEdit: (id: string) => void;
  commitEdit: (id: string, title: string, createSibling: boolean) => void;
  cancelEdit: (id: string) => void;
  toggleCollapse: (id: string) => void;
  remove: (id: string, onFocusDeleted: (parentId: string) => void) => void;
  dismissNotice: () => void;
}

/** Ventana del foco con edición optimista; los cambios a la API van de a uno, en orden. */
export function useMapView(focusId: string, depth: number): MapView {
  const { api, cache } = useSession();
  const key = cacheKey(focusId, depth);
  const [state, setState] = useState<MapState | null>(null);
  const [status, setStatus] = useState<ViewStatus>('loading');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const stateRef = useRef<MapState | null>(null);
  const keyRef = useRef(key);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const resolvedIds = useRef(new Map<string, string>());

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

  const reloadFromServer = useCallback(() => {
    cache.delete(keyRef.current);
    setReloads((count) => count + 1);
  }, [cache]);

  /** Aplica el cambio al instante y lo manda; si la API falla, lo revierte y recarga. */
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

  const startCreateChild = (parentId: string) => {
    const current = stateRef.current;
    const parent = current?.nodes[parentId];
    // El hijo de un nodo del borde o colapsado no se vería: hay que enfocarlo o expandirlo.
    if (!current || !parent || parent.pending || parent.collapsed || isBorder(current, parentId)) {
      return;
    }
    startNewNode(parentId, null);
  };

  const startEdit = (id: string) => {
    const node = currentNode(id);
    if (node && !node.pending) setEditingId(id);
  };

  /** sort_key del hermano anterior, ya creado en la API cuando le llega el turno en la cola. */
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
    // Al expandir, los hijos pueden no estar en la ventana: se vuelve a pedir.
    const needsReload = !collapsing && (current.childIds[id]?.length ?? 0) < node.child_count;
    mutate(
      (state) => patchNode(state, id, { collapsed: collapsing }),
      () => api.updateNode(id, { collapsed: collapsing, version: currentNode(id)?.version ?? 0 }),
      (state, updated: NodeOut) => {
        if (needsReload) queueMicrotask(reloadFromServer);
        return patchNode(state, id, updated);
      },
    );
  };

  const remove = (id: string, onFocusDeleted: (parentId: string) => void) => {
    const current = stateRef.current;
    const node = current?.nodes[id];
    if (!current || !node || node.pending || node.parent_id === null) return;
    const { count, exact } = countDescendants(current, id);
    if (count > 0) {
      const amount = exact ? `${count}` : `al menos ${count}`;
      if (!window.confirm(`¿Borrar «${node.title}» y sus ${amount} descendientes?`)) return;
    }
    const parentId = node.parent_id;
    if (id === current.focusId) {
      mutate(
        (state) => state,
        () => api.deleteNode(id),
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
      () => api.deleteNode(id),
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
    dismissNotice: () => setNotice(null),
  };
}
