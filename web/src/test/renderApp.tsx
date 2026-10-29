import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { FakeApi, type FakeNode } from './fakeApi';

function HistoryProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <output data-testid="location">{location.pathname}</output>
      <button type="button" onClick={() => navigate(-1)}>
        historial-atras
      </button>
    </div>
  );
}

/** Monta la SPA en `path` contra una API simulada. */
export function renderApp(path: string, api: FakeApi) {
  vi.stubGlobal('fetch', api.fetch);
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <HistoryProbe />
    </MemoryRouter>,
  );
  return { ...result, user, api };
}

export const currentPath = () => screen.getByTestId('location').textContent;

export const nodeElement = (id: string) => screen.getByTestId(`node-${id}`);

export const queryNode = (id: string) => screen.queryByTestId(`node-${id}`);

/** Mapa de ejemplo: raíz › F › (A › A1, A2), B. */
export function sampleTree(): FakeNode[] {
  return [
    { id: 'root', parent_id: null, title: 'Mi mapa', sort_key: 'V' },
    { id: 'f', parent_id: 'root', title: 'Foco', sort_key: 'V' },
    { id: 'a', parent_id: 'f', title: 'Idea A', sort_key: 'F' },
    { id: 'b', parent_id: 'f', title: 'Idea B', sort_key: 'Q' },
    { id: 'a1', parent_id: 'a', title: 'Idea A1', sort_key: 'F' },
    { id: 'a2', parent_id: 'a', title: 'Idea A2', sort_key: 'Q' },
  ];
}

export function sampleApi(): FakeApi {
  return new FakeApi(sampleTree());
}
