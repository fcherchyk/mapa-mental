import { createContext, useContext } from 'react';
import type { ApiClient, Me } from './api/client';
import type { ViewCache } from './map/viewCache';

export interface Session {
  api: ApiClient;
  cache: ViewCache;
  me: Me;
  depth: number;
  setDepth: (depth: number) => void;
  logout: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession fuera de SessionContext');
  return session;
}

/** Ruta de un nodo: la raíz del mapa vive en `/` (ADR 0008). */
export function pathFor(nodeId: string, rootId: string): string {
  return nodeId === rootId ? '/' : `/n/${nodeId}`;
}
