import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '../components/Breadcrumb';
import { NotFound } from '../components/NotFound';
import { SettingsPanel } from '../components/SettingsPanel';
import { pathFor, useSession } from '../session';
import { MapCanvas } from './MapCanvas';
import { NodeActionsContext, type NodeActions } from './nodes/nodeActions';
import { isRealRoot, moveSelection, type ArrowKey } from './tree';
import { useMapView } from './useMapView';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Teclas sobre campos, botones o enlaces siguen su comportamiento normal. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
  );
}

export function MapPage() {
  const { me, depth, setDepth, logout } = useSession();
  const { nodeId } = useParams();
  const focusId = nodeId ?? me.root_node_id;
  const navigate = useNavigate();
  const view = useMapView(focusId, depth);
  const { state, selectedId, editingId } = view;

  const goTo = (id: string) => navigate(pathFor(id, me.root_node_id));

  /** Doble click: enfoca el nodo; sobre el foco sube un nivel; en la raíz real no hace nada. */
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
    startEdit: view.startEdit,
    commitEdit: view.commitEdit,
    cancelEdit: view.cancelEdit,
  };

  const handleKey = (event: KeyboardEvent) => {
    if (!state || !selectedId || editingId || isInteractiveTarget(event.target)) return;
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
        view.startCreateChild(id);
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

  // El listener se reemplaza en cada render para ver el estado actual.
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
          <SettingsPanel depth={depth} onDepthChange={setDepth} />
          <span className="user-name">{me.name}</span>
          <button type="button" onClick={logout}>
            Salir
          </button>
        </div>
      </header>
      {view.notice && (
        <div role="alert" className="notice">
          {view.notice}
          <button type="button" aria-label="Cerrar aviso" onClick={view.dismissNotice}>
            ×
          </button>
        </div>
      )}
      <main className="map-canvas">
        {view.status === 'error' && <p role="alert">No se pudo cargar el mapa.</p>}
        {!state && view.status === 'loading' && <p>Cargando…</p>}
        {state && (
          <NodeActionsContext.Provider value={actions}>
            <MapCanvas state={state} selectedId={selectedId} editingId={editingId} />
          </NodeActionsContext.Provider>
        )}
      </main>
    </div>
  );
}
