import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeApi } from './test/fakeApi';
import { currentPath, nodeElement, renderApp, sampleApi } from './test/renderApp';

// Los nodos de React Flow quedan `visibility: hidden` en jsdom, así que los botones dentro de
// ellos se buscan por etiqueta y no por rol.
const titleInput = () => screen.getByLabelText('Título');
const queryTitleInput = () => screen.queryByLabelText('Título');
const addButton = (title: string) => screen.getByLabelText(`Agregar idea dentro de ${title}`);
const helpButton = () => screen.getByRole('button', { name: 'Atajos de teclado' });

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

describe('botón +', () => {
  it('CA1: el + de la raíz crea un hijo en edición y Enter lo manda a POST', async () => {
    const { user, api } = renderApp('/', sampleApi());
    await screen.findByTestId('node-root');
    fireEvent.click(addButton('Mi mapa'));
    expect(titleInput()).toHaveFocus();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    await user.type(titleInput(), 'Nueva idea{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/root/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/root/children')[0].body).toEqual({
      title: 'Nueva idea',
    });
    // Enter abre un hermano en edición; Escape lo descarta sin llamar a la API.
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(1);
  });

  it('CA2: el + está en el DOM de cada nodo no pendiente; el foco y el seleccionado lo muestran', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    expect(addButton('Foco')).toHaveClass('is-visible');
    expect(addButton('Idea A')).not.toHaveClass('is-visible');
    expect(addButton('Idea B')).not.toHaveClass('is-visible');
    await selectNode('a');
    expect(addButton('Idea A')).toHaveClass('is-visible');

    // El nodo pendiente que se está creando no tiene +.
    await user.keyboard('{Tab}');
    expect(titleInput().closest('.map-node')?.querySelector('.map-node-add')).toBeNull();
  });

  it('CA2: el + de un nodo colapsado o del borde aparece deshabilitado', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    api.depth = 1;
    renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    expect(addButton('Foco')).toBeEnabled();
    expect(addButton('Idea A')).toBeDisabled();
    expect(addButton('Idea B')).toBeDisabled();
  });

  it('CA3: el doble click en el + de un nodo que no es el foco no cambia la ruta', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.doubleClick(addButton('Idea B'));
    expect(currentPath()).toBe('/n/f');
  });

  it('CA4: atajos funcionan tras el lápiz: al confirmar, el foco vuelve al mapa y Tab crea un hijo', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Renombrar Foco'));
    await user.clear(titleInput());
    await user.type(titleInput(), 'Foco nuevo{Enter}');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/f')).toHaveLength(1));
    expect(screen.getByRole('main')).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
    await user.type(titleInput(), 'Hijo');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
  });

  it('CA4: atajos funcionan tras el lápiz: Enter abre un hermano con el foco ahí; Escape devuelve el foco al mapa', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Renombrar Idea A'));
    await user.type(titleInput(), '{Enter}');
    expect(titleInput()).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
    await user.keyboard('{Tab}');
    await user.type(titleInput(), 'Hijo de A');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/a/children')).toHaveLength(1));
  });

  it('CA4: si la edición del lápiz se cancela con Escape, el foco vuelve al mapa', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Renombrar Idea B'));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
  });

  it('CA5: F2 funciona después de crear un hijo con el +', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Agregar idea dentro de Foco'));
    await user.type(titleInput(), 'Hijo nuevo');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('Hijo nuevo'));
    expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1);
    await user.keyboard('{F2}');
    expect(titleInput()).toHaveValue('Hijo nuevo');
  });
});

describe('ayuda de atajos', () => {
  it('CA6: ? abre el panel con los atajos y Escape lo cierra devolviendo el foco al botón', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    const help = helpButton();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    const panel = screen.getByRole('dialog', { name: 'Atajos de teclado' });
    for (const key of ['Tab', 'F2', 'Espacio', 'Supr', 'Enter', 'Retroceso', 'Flechas']) {
      expect(within(panel).getByText(key)).toBeInTheDocument();
    }
    expect(within(panel).getByText('Doble click')).toBeInTheDocument();
    expect(help).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).toHaveFocus();
  });

  it('CA6: un segundo click en ? cierra el panel', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(helpButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('CA7: con el panel abierto, Supr y Espacio no borran ni colapsan nodos', async () => {
    const api = sampleApi();
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    fireEvent.click(helpButton());
    // El foco en el mapa (no en un botón) para que el atajo llegue a MapPage.
    screen.getByRole('main').focus();
    await user.keyboard('{Delete} ');
    expect(confirm).not.toHaveBeenCalled();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    expect(nodeElement('a1')).toBeInTheDocument();
  });

  it('CA8: se usa solo con teclado: Enter o Espacio sobre ? abren y cierran la ayuda; Enter sobre el + crea un hijo', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    helpButton().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    addButton('Foco').focus();
    await user.keyboard('{Enter}');
    expect(titleInput()).toHaveFocus();
  });
});

describe('pista inicial', () => {
  const HINT = 'Tocá + o Tab para agregar una idea';

  it('CA9: se ve con la raíz real sin hijos y desaparece al crear el primer hijo', async () => {
    const api = new FakeApi([{ id: 'root', parent_id: null, title: 'Mi mapa', sort_key: 'V' }]);
    const { user } = renderApp('/', api);
    await screen.findByTestId('node-root');
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await user.keyboard('{Tab}');
    await user.type(titleInput(), 'Primera');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('Primera'));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('CA9: no aparece si la raíz ya tiene hijos', async () => {
    renderApp('/', sampleApi());
    await screen.findByTestId('node-root');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('CA9: no aparece si el foco no es la raíz real', async () => {
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: 'Mi mapa', sort_key: 'V' },
      { id: 'x', parent_id: 'root', title: 'Solo', sort_key: 'V' },
    ]);
    renderApp('/n/x', api);
    await screen.findByTestId('node-x');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
