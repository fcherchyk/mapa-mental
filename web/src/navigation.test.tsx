import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { currentPath, nodeElement, queryNode, renderApp, sampleApi } from './test/renderApp';

describe('navegación por foco', () => {
  it('criterio_5: /n/X pide la ventana con la profundidad del usuario y dibuja X como foco', async () => {
    const api = sampleApi();
    renderApp('/n/f', api);
    expect(await screen.findByTestId('node-f')).toHaveClass('is-focus');
    expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(1);
    expect(nodeElement('a1')).toBeInTheDocument();
  });

  it('criterio_5: / usa root_node_id de /api/me', async () => {
    const api = sampleApi();
    renderApp('/', api);
    expect(await screen.findByTestId('node-root')).toHaveClass('is-focus');
    expect(api.callsTo('GET', '/api/nodes/root/view?depth=3')).toHaveLength(1);
  });

  it('criterio_5: un 404 muestra "No encontrado" con enlace a /', async () => {
    const api = sampleApi();
    renderApp('/n/ajeno', api);
    expect(await screen.findByRole('heading', { name: 'No encontrado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('criterio_5: un 422 (id que no es UUID) también muestra "No encontrado"', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url.startsWith('/api/nodes/f/view'), 422);
    renderApp('/n/f', api);
    expect(await screen.findByRole('heading', { name: 'No encontrado' })).toBeInTheDocument();
  });

  it('criterio_5: atrás en el historial vuelve al foco anterior desde la caché', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    fireEvent.doubleClick(await screen.findByTestId('node-a'));
    await waitFor(() => expect(currentPath()).toBe('/n/a'));
    expect(await screen.findByTestId('node-a')).toHaveClass('is-focus');
    await user.click(screen.getByRole('button', { name: 'historial-atras' }));
    await waitFor(() => expect(nodeElement('f')).toHaveClass('is-focus'));
    expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(1);
  });

  it('criterio_7: doble click sobre un nodo que no es el foco navega a /n/<id>', async () => {
    renderApp('/n/f', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-b'));
    await waitFor(() => expect(currentPath()).toBe('/n/b'));
  });

  it('criterio_7: doble click sobre el foco sube a su padre, o a / si el padre es la raíz', async () => {
    renderApp('/n/a', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-a'));
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    fireEvent.doubleClick(await screen.findByTestId('node-f'));
    await waitFor(() => expect(currentPath()).toBe('/'));
  });

  it('criterio_7: doble click sobre la raíz real no cambia la URL', async () => {
    renderApp('/', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-root'));
    expect(currentPath()).toBe('/');
    expect(nodeElement('root')).toHaveClass('is-focus');
  });

  it('criterio_8: la miga de pan muestra ancestros y foco en orden y enfoca al clickear', async () => {
    const { user } = renderApp('/n/a1', sampleApi());
    const crumbs = await screen.findByRole('navigation', { name: 'Miga de pan' });
    await waitFor(() =>
      expect([...crumbs.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
        'Mi mapa',
        'Foco',
        'Idea A',
        'Idea A1',
      ]),
    );
    await user.click(screen.getByRole('link', { name: 'Foco' }));
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    await user.click(await screen.findByRole('link', { name: 'Mi mapa' }));
    await waitFor(() => expect(currentPath()).toBe('/'));
  });

  it('criterio_8: Enter enfoca el seleccionado y Retroceso sube como el doble click', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByText('Idea B'));
    expect(nodeElement('b')).toHaveClass('is-selected');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(currentPath()).toBe('/n/b'));
    expect(await screen.findByTestId('node-b')).toHaveClass('is-focus');
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(currentPath()).toBe('/'));
    await screen.findByTestId('node-root');
    await user.keyboard('{Backspace}');
    expect(currentPath()).toBe('/');
  });

  it('criterio_9: el borde muestra +k, no dibuja el nivel siguiente y no se expande', async () => {
    const api = sampleApi();
    for (let i = 1; i <= 4; i++) {
      api.nodes.set(`b${i}`, {
        id: `b${i}`,
        parent_id: 'b',
        title: `Hoja ${i}`,
        sort_key: `${i}`,
        collapsed: false,
        version: 1,
      });
    }
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    const border = await screen.findByTestId('node-b');
    expect(border).toHaveTextContent('+4');
    expect(queryNode('b1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Idea B'));
    await user.keyboard(' ');
    expect(queryNode('b1')).not.toBeInTheDocument();
    expect(api.callsTo('PATCH', '/api/nodes/b')).toHaveLength(0);
  });

  it('criterio_9: un nodo del borde sin hijos no muestra indicador', async () => {
    const api = sampleApi();
    api.depth = 1;
    renderApp('/n/a', api);
    const leaf = await screen.findByTestId('node-a1');
    expect(leaf.querySelector('.map-node-hidden')).toBeNull();
  });
});
