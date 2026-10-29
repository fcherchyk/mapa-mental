import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FakeNode } from './test/fakeApi';
import { FakeApi } from './test/fakeApi';
import {
  currentPath,
  nodeElement,
  queryNode,
  renderApp,
  sampleApi,
  sampleTree,
} from './test/renderApp';

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

// Los nodos de React Flow quedan `visibility: hidden` en jsdom (no se miden), así que se buscan
// por etiqueta y no por rol.
const titleInput = () => screen.getByLabelText('Título');
const queryTitleInput = () => screen.queryByLabelText('Título');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('crear nodos', () => {
  it('criterio_10: Tab crea al instante un hijo en edición y al confirmar llama a POST', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    await user.type(titleInput(), 'Nueva idea');
    fireEvent.blur(titleInput());
    await screen.findByText('Nueva idea');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({ title: 'Nueva idea' });
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('Nueva idea'));
  });

  it('criterio_10: Enter confirma y crea un hermano con after_sort_key del nodo editado', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{F2}');
    await user.keyboard('{Enter}');
    await user.type(titleInput(), 'Hermana{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({
      title: 'Hermana',
      after_sort_key: 'F',
    });
    // El hermano de un nodo recién creado usa el sort_key que le asignó la API.
    await user.type(titleInput(), 'Tercera{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(2));
    expect(api.callsTo('POST', '/api/nodes/f/children')[1].body).toEqual({
      title: 'Tercera',
      after_sort_key: 'FV',
    });
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
  });

  it('criterio_10: un título vacío o con solo espacios no se envía', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), '   {Enter}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('criterio_10: un título con espacios en los extremos se envía recortado', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), '   Espacios recortados   ');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({
      title: 'Espacios recortados',
    });
  });

  it('criterio_10: Escape durante la creación cancela el nuevo nodo sin llamar a la API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    expect(titleInput()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('Tab sobre un nodo del borde no crea un hijo que quedaría oculto', async () => {
    const api = sampleApi();
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard('{Tab}');
    expect(queryTitleInput()).not.toBeInTheDocument();
  });
});

describe('renombrar', () => {
  it('criterio_11: F2 y confirmar llaman a PATCH con title y version; toma la nueva versión', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    await user.type(titleInput(), 'Renombrada');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({
      title: 'Renombrada',
      version: 1,
    });
    expect(nodeElement('a')).toHaveTextContent('Renombrada');
    await user.keyboard(' ');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(2));
    expect(api.callsTo('PATCH', '/api/nodes/a')[1].body).toEqual({ collapsed: true, version: 2 });
  });

  it('criterio_11: el lápiz entra en edición', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Renombrar Idea B'));
    await user.clear(titleInput());
    await user.type(titleInput(), 'Otra B{Escape}');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    expect(nodeElement('b')).toHaveTextContent('Idea B');
  });

  it('criterio_11: durante la edición Retroceso, Supr, Espacio y flechas actúan sobre el texto', async () => {
    const { user, api } = renderApp('/n/a', sampleApi());
    const confirm = vi.spyOn(window, 'confirm');
    await selectNode('a1');
    await user.keyboard('{F2}');
    await user.keyboard('{End}{Backspace}{ArrowLeft}{ArrowRight}{Delete} x');
    expect(titleInput()).toHaveValue('Idea A x');
    expect(currentPath()).toBe('/n/a');
    expect(confirm).not.toHaveBeenCalled();
    expect(api.calls.filter((call) => call.method !== 'GET')).toHaveLength(0);
    expect(nodeElement('a1')).toHaveClass('is-selected');
  });

  it('un título vacío al renombrar deja el título anterior sin llamar a la API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('b');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    fireEvent.blur(titleInput());
    expect(nodeElement('b')).toHaveTextContent('Idea B');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
  });
});

describe('colapsar', () => {
  it('criterio_12: Espacio oculta los hijos y llama a PATCH; otra vez los muestra', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard(' ');
    expect(queryNode('a1')).not.toBeInTheDocument();
    expect(nodeElement('a')).toHaveTextContent('+2');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({ collapsed: true, version: 1 });
    await user.keyboard(' ');
    expect(nodeElement('a1')).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(2));
    expect(api.callsTo('PATCH', '/api/nodes/a')[1].body).toEqual({ collapsed: false, version: 2 });
  });

  it('criterio_12: una ventana con collapsed: true no dibuja esos hijos; expandir los pide', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    const { user } = renderApp('/n/f', api);
    expect(await screen.findByTestId('node-a')).toHaveTextContent('+2');
    expect(nodeElement('a').querySelector('.is-collapsed')).not.toBeNull();
    expect(queryNode('a1')).not.toBeInTheDocument();
    await selectNode('a');
    await user.keyboard(' ');
    expect(await screen.findByTestId('node-a1')).toBeInTheDocument();
    expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2);
  });

  it('Espacio sobre un nodo sin hijos no hace nada', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('b');
    await user.keyboard(' ');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
  });
});

function treeWithSevenDescendants(): FakeNode[] {
  const node = (id: string, parent: string, sortKey = 'V') => ({
    id,
    parent_id: parent,
    title: `Nodo ${id}`,
    sort_key: sortKey,
  });
  return [
    ...sampleTree(),
    node('x', 'f', 'Z'),
    node('x1', 'x', '1'),
    node('x2', 'x', '2'),
    node('x3', 'x', '3'),
    node('x11', 'x1', '1'),
    node('x12', 'x1', '2'),
    node('x21', 'x2'),
    node('x31', 'x3'),
  ];
}

describe('borrar', () => {
  it('criterio_13: Supr pide confirmación con la cantidad de descendientes', async () => {
    const api = new FakeApi(treeWithSevenDescendants());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const { user } = renderApp('/n/f', api);
    await selectNode('x');
    await user.keyboard('{Delete}');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('7'));
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(nodeElement('x')).toBeInTheDocument();

    confirm.mockReturnValueOnce(true);
    await user.keyboard('{Delete}');
    expect(queryNode('x')).not.toBeInTheDocument();
    expect(queryNode('x11')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/x')).toHaveLength(1));
    expect(api.callsTo('DELETE', '/api/nodes/x')[0].headers['X-CSRF']).toBe('1');
    // Queda seleccionado el hermano anterior.
    expect(nodeElement('b')).toHaveClass('is-selected');
  });

  it('criterio_13: si hay niveles sin cargar, la confirmación dice "al menos"', async () => {
    const api = new FakeApi(treeWithSevenDescendants());
    api.depth = 2;
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = renderApp('/n/f', api);
    await selectNode('x');
    await user.keyboard('{Delete}');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('al menos 7'));
  });

  it('criterio_13: un nodo sin descendientes se borra sin confirmación', async () => {
    const api = sampleApi();
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', api);
    await selectNode('a2');
    await user.keyboard('{Delete}');
    expect(confirm).not.toHaveBeenCalled();
    expect(queryNode('a2')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a2')).toHaveLength(1));
    expect(nodeElement('a1')).toHaveClass('is-selected');
  });

  it('criterio_13: Supr sobre la raíz no hace nada', async () => {
    const api = sampleApi();
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/', api);
    await selectNode('root');
    await user.keyboard('{Delete}');
    expect(confirm).not.toHaveBeenCalled();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
  });

  it('borrar el foco lleva a su padre', async () => {
    const api = sampleApi();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = renderApp('/n/a', api);
    await screen.findByTestId('node-a');
    await user.keyboard('{Delete}');
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    expect(await screen.findByTestId('node-f')).toBeInTheDocument();
    expect(queryNode('a')).not.toBeInTheDocument();
  });
});

describe('selección con flechas', () => {
  it('criterio_14: → primer hijo, ← padre, ↑ y ↓ hermanos; fuera de lo visible no cambia', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    const expectSelected = (id: string) => expect(nodeElement(id)).toHaveClass('is-selected');
    await screen.findByTestId('node-f');
    expectSelected('f');
    await user.keyboard('{ArrowLeft}');
    expectSelected('f');
    await user.keyboard('{ArrowUp}');
    expectSelected('f');
    await user.keyboard('{ArrowRight}');
    expectSelected('a');
    await user.keyboard('{ArrowUp}');
    expectSelected('a');
    await user.keyboard('{ArrowDown}');
    expectSelected('b');
    await user.keyboard('{ArrowDown}');
    expectSelected('b');
    await user.keyboard('{ArrowRight}');
    expectSelected('b');
    await user.keyboard('{ArrowUp}{ArrowRight}');
    expectSelected('a1');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expectSelected('f');
  });

  it('criterio_14: flecha derecha sobre un nodo colapsado o del borde no cambia la selección', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    const expectSelected = (id: string) => expect(nodeElement(id)).toHaveClass('is-selected');
    await screen.findByTestId('node-f');
    await user.keyboard('{ArrowRight}');
    expectSelected('a');
    // 'a' está colapsado y en el borde: no tiene hijos visibles
    await user.keyboard('{ArrowRight}');
    expectSelected('a');
  });
});

describe('optimista con reversión', () => {
  it('criterio_15: un renombre con 409 vuelve al título anterior, avisa y vuelve a pedir la ventana', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 409);
    const { user } = renderApp('/n/f', api);
    await selectNode('b');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    await user.type(titleInput(), 'Cambio');
    fireEvent.blur(titleInput());
    expect(await screen.findByRole('alert')).toHaveTextContent('cambió');
    expect(nodeElement('b')).toHaveTextContent('Idea B');
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('criterio_15: una creación con 5xx desaparece y avisa', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'POST', 500);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), 'Falla');
    fireEvent.blur(titleInput());
    expect(await screen.findByRole('alert')).toHaveTextContent('se deshizo');
    expect(screen.queryByText('Falla')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });

  it('criterio_15: un colapso con 422 vuelve a mostrar los hijos', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 422);
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard(' ');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(nodeElement('a1')).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });

  it('criterio_15: un borrado con 5xx devuelve el nodo', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'DELETE', 503);
    const { user } = renderApp('/n/f', api);
    await selectNode('b');
    await user.keyboard('{Delete}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(nodeElement('b')).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });
});
