import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewCache } from './map/viewCache';
import { FakeApi } from './test/fakeApi';
import { renderApp, sampleApi } from './test/renderApp';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sesión', () => {
  it.each(['/', '/n/x'])(
    'criterio_3: sin sesión, %s muestra el login que lleva a /api/auth/login',
    async (path) => {
      const api = sampleApi();
      api.loggedIn = false;
      renderApp(path, api);
      const button = await screen.findByRole('link', { name: 'Entrar con Google' });
      expect(button).toHaveAttribute('href', '/api/auth/login');
      expect(api.callsTo('GET', /view/)).toHaveLength(0);
    },
  );

  it('criterio_3: un 401 posterior (sesión vencida) vuelve a la pantalla de login', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    fireEvent.click(await screen.findByTestId('node-b'));
    api.loggedIn = false;
    await user.keyboard('{F2}');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Sin sesión' } });
    fireEvent.blur(screen.getByLabelText('Título'));
    expect(await screen.findByRole('link', { name: 'Entrar con Google' })).toBeInTheDocument();
  });

  it('criterio_4: Salir llama al logout con X-CSRF, vacía la caché y muestra el login', async () => {
    const clear = vi.spyOn(ViewCache.prototype, 'clear');
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    await user.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByRole('link', { name: 'Entrar con Google' })).toBeInTheDocument();
    const [logout] = api.callsTo('POST', '/api/auth/logout');
    expect(logout.headers['X-CSRF']).toBe('1');
    expect(clear).toHaveBeenCalled();
  });

  it('si la API no responde se muestra un aviso', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url === '/api/me', 502);
    renderApp('/', api);
    expect(await screen.findByText('No se pudo conectar con la API.')).toBeInTheDocument();
  });

  it('una ruta desconocida muestra "No encontrado"', async () => {
    renderApp('/otra/cosa', sampleApi());
    expect(await screen.findByRole('heading', { name: 'No encontrado' })).toBeInTheDocument();
  });

  it('un error al pedir la ventana muestra un aviso', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url.includes('/view'), 500);
    renderApp('/n/f', api);
    expect(await screen.findByText('No se pudo cargar el mapa.')).toBeInTheDocument();
  });
});

describe('preferencia N', () => {
  it('criterio_16: elegir 5 llama a PATCH /api/me/settings y pide view?depth=5 del foco', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    const select = screen.getByRole('combobox', { name: 'Niveles visibles' });
    expect(select).toHaveValue('3');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    await user.selectOptions(select, '5');
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=5')).toHaveLength(1));
    const [patch] = api.callsTo('PATCH', '/api/me/settings');
    expect(patch.body).toEqual({ depth: 5 });
    expect(patch.headers['X-CSRF']).toBe('1');
  });

  it('criterio_16: si el PATCH falla vuelve al valor anterior y avisa', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url === '/api/me/settings', 500);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    const select = screen.getByRole('combobox', { name: 'Niveles visibles' });
    await user.selectOptions(select, '2');
    expect(await screen.findByRole('alert')).toHaveTextContent('niveles');
    expect(select).toHaveValue('3');
  });
});

describe('seguridad', () => {
  it('criterio_17: un título con HTML se ve como texto en el lienzo y en la miga de pan', async () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: malicious, sort_key: 'V' },
      { id: 'f', parent_id: 'root', title: malicious, sort_key: 'V' },
      { id: 'c', parent_id: 'f', title: malicious, sort_key: 'V' },
    ]);
    const { container } = renderApp('/n/f', api);
    expect(await screen.findByTestId('node-c')).toHaveTextContent(malicious);
    const crumbs = screen.getByRole('navigation', { name: 'Miga de pan' });
    expect(within(crumbs).getByRole('link', { name: malicious })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
