import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router';
import { ApiError, createApiClient, type Me } from './api/client';
import { LoginScreen } from './components/LoginScreen';
import { NotFound } from './components/NotFound';
import { MapPage } from './map/MapPage';
import { ViewCache } from './map/viewCache';
import { SessionContext, type Session } from './session';

const DEFAULT_DEPTH = 3;

type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'unavailable' }
  | { status: 'ready'; me: Me };

export function App() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const cache = useMemo(() => new ViewCache(), []);
  const api = useMemo(
    () =>
      createApiClient(() => {
        cache.clear();
        setSession({ status: 'anonymous' });
      }),
    [cache],
  );

  useEffect(() => {
    api.getMe().then(
      (me) => setSession({ status: 'ready', me }),
      (error: unknown) => {
        const anonymous = error instanceof ApiError && error.status === 401;
        setSession({ status: anonymous ? 'anonymous' : 'unavailable' });
      },
    );
  }, [api]);

  const setMeDepth = useCallback((depth: number) => {
    setSession((current) =>
      current.status === 'ready'
        ? { ...current, me: { ...current.me, settings: { ...current.me.settings, depth } } }
        : current,
    );
  }, []);

  const contextValue = useMemo<Session | null>(() => {
    if (session.status !== 'ready') return null;
    const depth = session.me.settings.depth ?? DEFAULT_DEPTH;
    return {
      api,
      cache,
      me: session.me,
      depth,
      setDepth: (next) => {
        setMeDepth(next);
        api.patchSettings({ depth: next }).catch(() => {
          setMeDepth(depth);
          setNotice('No se pudo guardar la cantidad de niveles.');
        });
      },
      logout: () => {
        api.logout().catch(() => undefined);
        cache.clear();
        setSession({ status: 'anonymous' });
      },
    };
  }, [api, cache, session, setMeDepth]);

  if (session.status === 'loading') return <p className="centered-screen">Cargando…</p>;
  if (session.status === 'anonymous') return <LoginScreen />;
  if (session.status === 'unavailable' || !contextValue) {
    return <p className="centered-screen">No se pudo conectar con la API.</p>;
  }

  return (
    <SessionContext.Provider value={contextValue}>
      {notice && (
        <div role="alert" className="notice">
          {notice}
        </div>
      )}
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/n/:nodeId" element={<MapPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SessionContext.Provider>
  );
}
