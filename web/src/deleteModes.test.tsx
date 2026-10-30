import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPath, nodeElement, queryNode, renderApp, sampleApi } from './test/renderApp';

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

const deleteButton = (title: string) => screen.getByLabelText(`Borrar ${title}`);
const option = (name: string) => screen.getByRole('button', { name });
const ALL = 'Borrar todo a partir de acá';
const REPARENT = 'Borrar solo este y subir sus hijos';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('borrar: botón visible', () => {
  it('CA5: cada nodo no raíz tiene botón de borrar y la raíz real no', async () => {
    renderApp('/', sampleApi());
    await screen.findByTestId('node-f');
    expect(deleteButton('Foco')).toBeInTheDocument();
    expect(screen.queryByLabelText('Borrar Mi mapa')).not.toBeInTheDocument();
  });

  it('CA5: activar el botón equivale a seleccionar y pulsar Supr', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.click(deleteButton('Idea B'));
    expect(queryNode('b')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/b')).toHaveLength(1));
  });
});

describe('borrar: hoja', () => {
  it('CA6: una hoja se borra sin diálogo ni window.confirm, en modo cascade', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a2');
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(queryNode('a2')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a2')).toHaveLength(1));
  });

  it('CA6: una hoja con el botón también se borra sin preguntar', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a2');
    await user.click(deleteButton('Idea A2'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a2')).toHaveLength(1));
  });
});

describe('borrar: nodo intermedio', () => {
  it('CA7: abre un diálogo accesible con tres opciones y el foco adentro', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Idea A/);
    expect(dialog).toHaveTextContent('2');
    expect(option(ALL)).toBeInTheDocument();
    expect(option(REPARENT)).toBeInTheDocument();
    expect(option('Cancelar')).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
    // Tab y Shift+Tab recorren las opciones sin salir del diálogo.
    await user.tab();
    expect(option(ALL)).toHaveFocus();
    await user.tab({ shift: true });
    expect(option('Cancelar')).toHaveFocus();
    await user.tab({ shift: true });
    expect(option(REPARENT)).toHaveFocus();
  });

  it('CA7: un nodo con hijos solo ocultos (child_count > 0) también pregunta', async () => {
    const api = sampleApi();
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard('{Delete}');
    expect(screen.getByRole('dialog')).toHaveTextContent('al menos 2');
  });

  it('CA8: «Borrar todo a partir de acá» borra el subárbol y cierra el diálogo', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.click(option(ALL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(queryNode('a')).not.toBeInTheDocument();
    expect(queryNode('a1')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a')).toHaveLength(1));
  });

  it('CA9: «subir sus hijos» usa children=reparent y pide la ventana de nuevo', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.click(option(REPARENT));
    await waitFor(() =>
      expect(api.callsTo('DELETE', '/api/nodes/a?children=reparent')).toHaveLength(1),
    );
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
    await waitFor(() => expect(queryNode('a')).not.toBeInTheDocument());
    expect(nodeElement('a1')).toBeInTheDocument();
    expect(nodeElement('a2')).toBeInTheDocument();
    // a1 y a2 son hijos de f, en el lugar de a (antes de b) y en su orden.
    expect([...api.nodes.values()].filter((n) => n.parent_id === 'f').length).toBe(3);
    expect(api.children('f').map((n) => n.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('CA10: Cancelar no borra nada y devuelve el foco al mapa', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.click(option('Cancelar'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(nodeElement('a')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('CA10: Esc cancela y devuelve el foco al mapa', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('CA11: borrar el foco intermedio con cualquier modo navega a su padre', async () => {
    for (const choice of [ALL, REPARENT]) {
      const { user, unmount } = renderApp('/n/a', sampleApi());
      await screen.findByTestId('node-a');
      await user.keyboard('{Delete}');
      await user.click(option(choice));
      await waitFor(() => expect(currentPath()).toBe('/n/f'));
      expect(await screen.findByTestId('node-f')).toBeInTheDocument();
      expect(queryNode('a')).not.toBeInTheDocument();
      unmount();
    }
  });
});
