import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeApi, type FakeNode } from './test/fakeApi';
import { currentPath, nodeElement, queryNode, renderApp, sampleTree } from './test/renderApp';

// React Flow nodes stay `visibility: hidden` in jsdom: what is inside them is found by label.
const addButton = (title: string) => screen.getByLabelText(`Add inside ${title}`);
const queryAddButton = (title: string) => screen.queryByLabelText(`Add inside ${title}`);
const kindMenu = () => screen.getByRole('menu', { hidden: true });
const queryKindMenu = () => screen.queryByRole('menu', { hidden: true });
const menuItem = (label: string) => within(kindMenu()).getByLabelText(label);
const documentTitleInput = () => screen.getByLabelText('New document title');
const queryDocumentTitleInput = () => screen.queryByLabelText('New document title');
const createCalls = (api: FakeApi, parentId: string) =>
  api.callsTo('POST', `/api/nodes/${parentId}/children`);

const NOTES = '# Agenda\n\n- budget\n- hiring\n';

/** The sample map plus a document "Meeting notes" under the focus, after "Idea B". */
function withDocument(): FakeNode[] {
  return [
    ...sampleTree(),
    {
      id: 'd',
      parent_id: 'f',
      title: 'Meeting notes',
      sort_key: 'Z',
      kind: 'document',
      content: NOTES,
    },
  ];
}

const documentApi = () => new FakeApi(withDocument());

afterEach(() => vi.restoreAllMocks());

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

// --- S5_FE_AC1 to AC3: the kind menu ---------------------------------------------------------

describe('S5_FE_AC1: "+" opens the kind menu', () => {
  it('S5_FE_AC1: the menu lists Idea, Task and Document with their numbers, focused on the first', async () => {
    renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');

    expect(addButton('Idea A')).toHaveAttribute('aria-haspopup', 'menu');
    expect(addButton('Idea A')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(addButton('Idea A'));

    expect(kindMenu()).toHaveAttribute('aria-label', 'What to add inside Idea A');
    const items = within(kindMenu()).getAllByRole('menuitem', { hidden: true });
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Idea',
      'Task',
      'Document',
    ]);
    expect(items.map((item) => item.getAttribute('aria-keyshortcuts'))).toEqual(['1', '2', '3']);
    expect(items.map((item) => item.querySelector('kbd')?.textContent)).toEqual(['1', '2', '3']);
    expect(menuItem('Idea')).toHaveFocus();
    expect(addButton('Idea A')).toHaveAttribute('aria-expanded', 'true');
    // Opening the menu selects its idea, as the panel shows.
    expect(nodeElement('a')).toHaveClass('is-selected');
  });

  it('S5_FE_AC1: a second click on "+" closes the menu, and leaves have no "+"', async () => {
    renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');

    fireEvent.click(addButton('Focus'));
    expect(kindMenu()).toBeInTheDocument();
    fireEvent.click(addButton('Focus'));
    expect(queryKindMenu()).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();

    expect(queryAddButton('Meeting notes')).not.toBeInTheDocument();
  });
});

describe('S5_FE_AC2: Shift+Tab and the number keys', () => {
  it.each([
    ['1', 'New idea title', undefined],
    ['2', 'New task title', 'task'],
    ['3', 'New document title', 'document'],
  ])('S5_FE_AC2: Shift+Tab then %s opens "%s" and posts that kind', async (key, label, kind) => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('b');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(kindMenu()).toBeInTheDocument();
    await user.keyboard(key);

    expect(queryKindMenu()).not.toBeInTheDocument();
    const input = screen.getByLabelText(label);
    expect(input).toHaveFocus();
    await user.type(input, 'New one');
    fireEvent.blur(input);
    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));
    expect(createCalls(api, 'b')[0].body).toEqual(
      kind ? { title: 'New one', kind } : { title: 'New one' },
    );
  });

  it('S5_FE_AC2: the numbers and Escape work even when the focus stayed on the map', async () => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('b');

    // As seen in a real browser: the menu shows but the focus never reaches it.
    const focus = vi.spyOn(HTMLButtonElement.prototype, 'focus').mockImplementation(() => {});
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(kindMenu()).not.toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    expect(queryKindMenu()).not.toBeInTheDocument();
    expect(nodeElement('b')).toHaveClass('is-selected');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(kindMenu()).not.toContainElement(document.activeElement as HTMLElement);
    focus.mockRestore();
    await user.keyboard('3');
    expect(documentTitleInput()).toHaveFocus();
    await user.type(documentTitleInput(), 'From the map');
    fireEvent.blur(documentTitleInput());
    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));
    expect(createCalls(api, 'b')[0].body).toEqual({ title: 'From the map', kind: 'document' });
  });

  it('S5_FE_AC2: Shift+Tab on a task or a document opens nothing', async () => {
    const api = new FakeApi([
      ...withDocument(),
      { id: 't', parent_id: 'f', title: 'A task', sort_key: 'X', kind: 'task' },
    ]);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-d');

    for (const id of ['d', 't']) {
      await selectNode(id);
      await user.keyboard('{Shift>}{Tab}{/Shift}');
      expect(queryKindMenu()).not.toBeInTheDocument();
    }
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
  });
});

describe('S5_FE_AC3: closing and moving in the menu', () => {
  it('S5_FE_AC3: Escape closes the menu, creates nothing and gives the keyboard back to the map', async () => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard('{Escape}');

    expect(queryKindMenu()).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
    expect(nodeElement('a')).toHaveClass('is-selected');
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
  });

  it('S5_FE_AC3: Tab also closes it, and selecting another node closes it', async () => {
    const { user } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard('{Tab}');
    expect(queryKindMenu()).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();

    fireEvent.click(addButton('Idea A'));
    expect(kindMenu()).toBeInTheDocument();
    fireEvent.click(nodeElement('b'));
    expect(queryKindMenu()).not.toBeInTheDocument();
  });

  it('S5_FE_AC3: the arrows move between entries, wrapping, and Enter chooses', async () => {
    const { user } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard('{ArrowUp}');
    expect(menuItem('Document')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(menuItem('Task')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('New task title')).toHaveFocus();
  });

  it('S5_FE_AC3: a double click inside the menu does not focus the idea', async () => {
    renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');

    fireEvent.click(addButton('Idea A'));
    fireEvent.doubleClick(menuItem('Task'));

    expect(currentPath()).toBe('/n/f');
  });
});

// --- S5_FE_AC4 and AC5: creating documents ---------------------------------------------------

describe('S5_FE_AC4: creating a document', () => {
  it('S5_FE_AC4: Enter posts kind document, opens the panel and focuses the editor, with no sibling', async () => {
    localStorage.setItem('mindmap.documentEditorMode', 'plain');
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    fireEvent.click(addButton('Idea B'));
    fireEvent.click(menuItem('Document'));

    expect(documentTitleInput()).toHaveFocus();
    // The panel stays hidden while the title is typed (slice 3, decision D8).
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    await user.type(documentTitleInput(), 'Minutes{Enter}');

    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));
    expect(createCalls(api, 'b')[0].body).toEqual({ title: 'Minutes', kind: 'document' });
    expect(queryDocumentTitleInput()).not.toBeInTheDocument();
    const created = await screen.findByTestId('node-new-1');
    expect(created).toHaveClass('is-document');
    const panel = await screen.findByRole('complementary', { name: 'Document details' });
    await waitFor(() =>
      expect(within(panel).getByRole('textbox', { name: 'Document' })).toHaveFocus(),
    );
    expect(createCalls(api, 'b')).toHaveLength(1);
  });

  it('S5_FE_AC4: the editor takes the focus in rich mode too', async () => {
    localStorage.setItem('mindmap.documentEditorMode', 'rich');
    const { user } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('b');
    await user.keyboard('{Shift>}{Tab}{/Shift}3');
    await user.type(documentTitleInput(), 'Minutes{Enter}');

    const panel = await screen.findByRole('complementary', { name: 'Document details' });
    const editor = await within(panel).findByRole('textbox', { name: 'Document' });
    expect(editor).toHaveAttribute('contenteditable', 'true');
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it('S5_FE_AC4: leaving the title by blur creates the document without taking the focus', async () => {
    localStorage.setItem('mindmap.documentEditorMode', 'plain');
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('b');
    await user.keyboard('{Shift>}{Tab}{/Shift}3');
    await user.type(documentTitleInput(), 'Minutes');
    fireEvent.blur(documentTitleInput());

    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));
    const panel = await screen.findByRole('complementary', { name: 'Document details' });
    expect(within(panel).getByRole('textbox', { name: 'Document' })).not.toHaveFocus();
  });

  it('S5_FE_AC4: Escape on an empty title creates nothing', async () => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-f');
    await selectNode('b');
    await user.keyboard('{Shift>}{Tab}{/Shift}3');
    await user.keyboard('{Escape}');

    expect(queryDocumentTitleInput()).not.toBeInTheDocument();
    expect(createCalls(api, 'b')).toHaveLength(0);
  });
});

describe('S5_FE_AC5: creating a document under a border or collapsed idea', () => {
  it('S5_FE_AC5: on a border idea the focus moves one level toward it first', async () => {
    const api = documentApi();
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-a');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}3');

    await waitFor(() => expect(currentPath()).toBe('/n/a'));
    await waitFor(() => expect(documentTitleInput()).toBeInTheDocument());
    await user.type(documentTitleInput(), 'Under A{Enter}');
    await waitFor(() => expect(createCalls(api, 'a')).toHaveLength(1));
    expect(createCalls(api, 'a')[0].body).toEqual({ title: 'Under A', kind: 'document' });
  });

  it('S5_FE_AC5: a collapsed idea is expanded first', async () => {
    const api = documentApi();
    api.nodes.set('a', { ...api.nodes.get('a')!, collapsed: true });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-a');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}3');

    await waitFor(() => expect(api.nodes.get('a')!.collapsed).toBe(false));
    await waitFor(() => expect(documentTitleInput()).toBeInTheDocument());
  });
});

// --- S5_FE_AC6 and AC7: documents on the canvas ----------------------------------------------

describe('S5_FE_AC6: a document is drawn as a page', () => {
  it('S5_FE_AC6: page class and icon, its title, the delete button, and no "+" nor "+k"', async () => {
    renderApp('/n/f', documentApi());
    const node = await screen.findByTestId('node-d');

    expect(node).toHaveClass('map-node', 'is-document');
    expect(within(node).getByLabelText('Document')).toHaveTextContent('📄');
    expect(node).toHaveTextContent('Meeting notes');
    expect(within(node).getByLabelText('Delete Meeting notes')).toBeInTheDocument();
    expect(queryAddButton('Meeting notes')).not.toBeInTheDocument();
    expect(within(node).queryByLabelText(/hidden children/)).not.toBeInTheDocument();
    // The body never travels with the window nor shows on the canvas.
    expect(node).not.toHaveTextContent('Agenda');
  });
});

describe('S5_FE_AC7: a document is a leaf', () => {
  it('S5_FE_AC7: Tab and Space do nothing, and ArrowRight keeps the selection', async () => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');
    await selectNode('d');
    screen.getByRole('main').focus();

    await user.keyboard('{Tab}');
    await user.keyboard(' ');
    await user.keyboard('{ArrowRight}');

    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();
    expect(nodeElement('d')).toHaveClass('is-selected');
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(api.callsTo('PATCH', '/api/nodes/d')).toHaveLength(0);
  });

  it('S5_FE_AC7: double click and Enter navigate nowhere', async () => {
    const { user } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');
    await selectNode('d');

    fireEvent.doubleClick(nodeElement('d'));
    screen.getByRole('main').focus();
    await user.keyboard('{Enter}');

    expect(currentPath()).toBe('/n/f');
  });

  it('S5_FE_AC7: dropping an idea on a document is refused, and Alt+Right onto it sends nothing', async () => {
    const api = new FakeApi([
      ...withDocument(),
      { id: 'c', parent_id: 'f', title: 'Idea C', sort_key: 'ZZ' },
    ]);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-c');

    fireEvent.dragStart(nodeElement('c'));
    fireEvent.dragOver(nodeElement('d'));
    expect(nodeElement('d')).toHaveClass('is-drop-refused');
    fireEvent.drop(nodeElement('d'));
    fireEvent.dragEnd(nodeElement('c'));

    await selectNode('c');
    screen.getByRole('main').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    expect(api.callsTo('POST', /move/)).toHaveLength(0);
  });

  it('S5_FE_AC7: a document moves onto an idea like any node', async () => {
    const { api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');

    fireEvent.dragStart(nodeElement('d'));
    fireEvent.dragOver(nodeElement('a'));
    fireEvent.drop(nodeElement('a'));

    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/d/move')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/d/move')[0].body).toMatchObject({
      parent_id: 'a',
      place: 'last',
    });
  });

  it('S5_FE_AC7: deleting a document never asks', async () => {
    const { user, api } = renderApp('/n/f', documentApi());
    await screen.findByTestId('node-d');
    await selectNode('d');
    screen.getByRole('main').focus();

    await user.keyboard('{Delete}');

    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/d')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(queryNode('d')).not.toBeInTheDocument());
  });
});
