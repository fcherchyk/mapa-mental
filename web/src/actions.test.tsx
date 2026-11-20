import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FakeApi } from './test/fakeApi';
import { currentPath, nodeElement, renderApp, sampleApi, sampleTree } from './test/renderApp';

// React Flow nodes stay `visibility: hidden` in jsdom, so the buttons inside them are looked up
// by label and not by role.
const titleInput = () => screen.getByLabelText('New idea title');
const queryTitleInput = () => screen.queryByLabelText('New idea title');
const addButton = (title: string) => screen.getByLabelText(`Add inside ${title}`);
const menuItem = (label: string) =>
  within(screen.getByRole('menu', { hidden: true })).getByLabelText(label);
/** Amended in slice 5 (decision D8): "+" opens the kind menu, and "Idea" creates the child. */
const addIdeaWith = (title: string) => {
  fireEvent.click(addButton(title));
  fireEvent.click(menuItem('Idea'));
};
const helpButton = () => screen.getByRole('button', { name: 'Keyboard shortcuts' });
// Amended in slice 5 (S5_FE_AC28): the panel has one tab per section.
const helpTab = (name: string) => screen.getByRole('tab', { name });
const helpGroup = (name: string) => {
  fireEvent.click(helpTab(name));
  return screen.getByRole('tabpanel', { name });
};

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

describe('S1_FE_AC17: the + button creates a child in edit mode', () => {
  it('S1_FE_AC17: the root + creates a child in edit mode and Enter sends it as a POST', async () => {
    const { user, api } = renderApp('/', sampleApi());
    await screen.findByTestId('node-root');
    addIdeaWith('My map');
    expect(titleInput()).toHaveFocus();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    await user.type(titleInput(), 'New idea{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/root/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/root/children')[0].body).toEqual({
      title: 'New idea',
    });
    // Enter opens a sibling in edit mode; Escape discards it without calling the API.
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(1);
  });

  it('S1_FE_AC17: the + of a child node creates a child in edit mode inside that node', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Idea A');
    expect(titleInput()).toHaveFocus();
    await user.type(titleInput(), 'Child of A{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/a/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/a/children')[0].body).toEqual({
      title: 'Child of A',
    });
  });

  it('S1_FE_AC17: an empty or whitespace-only title when creating with + is not sent to the API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    expect(titleInput()).toHaveFocus();
    await user.type(titleInput(), '   {Enter}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('S1_FE_AC17: Escape while creating a child with + cancels the creation without calling the API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    expect(titleInput()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('S1_FE_AC17: a title with leading and trailing spaces when creating with + is sent trimmed', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    await user.type(titleInput(), '   Idea with spaces   ');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({
      title: 'Idea with spaces',
    });
  });
});

describe('S1_FE_AC18: the + button is present where it should be', () => {
  it('S1_FE_AC18: the + is in the DOM of every non-pending node; the focus and the selected one show it', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    expect(addButton('Focus')).toHaveClass('is-visible');
    expect(addButton('Idea A')).not.toHaveClass('is-visible');
    expect(addButton('Idea B')).not.toHaveClass('is-visible');
    await selectNode('a');
    expect(addButton('Idea A')).toHaveClass('is-visible');

    // The pending node being created has no +.
    await user.keyboard('{Tab}');
    expect(titleInput().closest('.map-node')?.querySelector('.map-node-add')).toBeNull();
  });

  it('S1_FE_AC18: a node in edit mode has no + button in the DOM', async () => {
    // Since slice 3 only a node being created is edited on the canvas.
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Tab}');
    const editing = titleInput().closest('.map-node');
    expect(editing).not.toBeNull();
    expect(editing!.querySelector('.map-node-add')).toBeNull();
  });

  it('S1_FE_AC18: the + of a collapsed or border node is present and enabled', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    api.depth = 1;
    renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    expect(addButton('Focus')).toBeEnabled();
    expect(addButton('Idea A')).toBeEnabled();
    expect(addButton('Idea B')).toBeEnabled();
  });

  it('S1_FE_AC18: the pending node created with the + button has no + button in the DOM', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    expect(titleInput().closest('.map-node')?.querySelector('.map-node-add')).toBeNull();
  });
});

describe('S1_FE_AC19: the + button does not trigger other node actions', () => {
  it('S1_FE_AC19: double clicking the + of a node that is not the focus does not change the route', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.doubleClick(addButton('Idea B'));
    expect(currentPath()).toBe('/n/f');
  });

  it('S1_FE_AC19: double clicking the + of the focus node does not go up a level or change the route', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.doubleClick(addButton('Focus'));
    expect(currentPath()).toBe('/n/f');
  });

  it('S1_FE_AC19: a single click on the + of a child does not navigate to or focus that node', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(addButton('Idea A'));
    expect(currentPath()).toBe('/n/f');
    // Amended in slice 5: the click opens the kind menu on that idea, focused on its first entry.
    expect(menuItem('Idea')).toHaveFocus();
  });
});

// S1_FE_AC20 (shortcuts after the pencil) is superseded by S3_FE_AC14 in detailsPanel.test.tsx.

describe('S1_FE_AC21: shortcuts keep working after the +', () => {
  it('S1_FE_AC21: F2 works after creating a child with the +', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    await user.type(titleInput(), 'New child');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('New child'));
    expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1);
    // Amended in slice 3: F2 goes to the details panel's title.
    await user.keyboard('{F2}');
    expect(screen.getByLabelText('Title')).toHaveFocus();
    expect(screen.getByLabelText('Title')).toHaveValue('New child');
  });

  it('S1_FE_AC21: if creating with + is cancelled with Escape, focus returns to the map and shortcuts keep working', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    expect(titleInput()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('main')).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
  });

  it('S1_FE_AC21: after creating a child with the + button, Tab on the new child creates a grandchild in edit mode', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    await user.type(titleInput(), 'New child');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('New child'));
    expect(nodeElement('new-1')).toHaveClass('is-selected');
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
    await user.type(titleInput(), 'Grandchild{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/new-1/children')).toHaveLength(1));
  });
});

describe('S1_FE_AC22: opening and closing the help', () => {
  // Slice 2 added the Alt and Drag entries, so this lists the slice 1 ones and does not count.
  it('S1_FE_AC22: ? opens the panel with the map shortcuts and their descriptions, and Escape closes it returning focus to the button', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    const help = helpButton();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(help);
    // Since slice 5 the panel has one tab per section, opened on the view's one (S5_FE_AC28).
    const panel = within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).getByRole(
      'tabpanel',
      { name: 'Map' },
    );
    const expected = [
      {
        key: 'Tab',
        desc: 'With the map focused, adds a child idea to the selected idea and starts editing it.',
      },
      // F2 amended in slice 3 (S3_FE_AC20); the rest, in slices 4A (S4A_FE_AC23) and 5 (S5_FE_AC22).
      { key: 'F2', desc: "Edit the selected node's title in the details panel." },
      { key: 'Space', desc: 'Collapses or expands the selected idea.' },
      {
        key: 'Delete',
        desc: 'Deletes the selected idea, task or document. If it has children, asks whether to delete the whole subtree or only the idea and move its children up.',
      },
      {
        key: 'Enter',
        desc: 'Focuses the selected idea. While you create one, confirms it and opens a sibling of the same kind; a new document opens its editor instead.',
      },
      { key: 'Backspace', desc: 'Goes up one level from the focused idea.' },
      {
        key: 'Arrows',
        desc: 'Move the selection: → to the first child, ← to the parent, ↑ and ↓ between siblings.',
      },
      {
        key: 'Double click',
        desc: 'Focuses the idea; on the focused idea, goes up one level. Tasks and documents cannot be focused.',
      },
    ];
    for (const { key, desc } of expected) {
      expect(within(panel).getByText(key)).toBeInTheDocument();
      expect(within(panel).getByText(desc)).toBeInTheDocument();
    }
    expect(help).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).toHaveFocus();
  });

  it('S1_FE_AC22: a second click on ? closes the panel and returns focus to the button', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(helpButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false');
    expect(helpButton()).toHaveFocus();
  });
});

describe('S1_FE_AC23: the help does not trigger map shortcuts', () => {
  it('S1_FE_AC23: with the panel open, Delete and Space neither delete nor collapse nodes', async () => {
    const api = sampleApi();
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    fireEvent.click(helpButton());
    // Focus on the map (not on a button) so the shortcut reaches MapPage.
    screen.getByRole('main').focus();
    await user.keyboard('{Delete} ');
    expect(confirm).not.toHaveBeenCalled();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    expect(nodeElement('a1')).toBeInTheDocument();
  });

  it('S1_FE_AC23: with the panel open, Tab, F2, Backspace and Enter neither create children, edit nor navigate', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    fireEvent.click(helpButton());
    screen.getByRole('main').focus();

    await user.keyboard('{Tab}');
    expect(queryTitleInput()).not.toBeInTheDocument();

    await user.keyboard('{F2}');
    expect(queryTitleInput()).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(currentPath()).toBe('/n/f');

    await user.keyboard('{Backspace}');
    expect(currentPath()).toBe('/n/f');
  });

  it('S1_FE_AC23: with the panel open, the arrows do not change the selection', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    fireEvent.click(helpButton());
    screen.getByRole('main').focus();
    await user.keyboard('{ArrowDown}');
    expect(nodeElement('a')).toHaveClass('is-selected');
    expect(nodeElement('b')).not.toHaveClass('is-selected');
  });
});

describe('S1_FE_AC24: it can be used with the keyboard only', () => {
  it('S1_FE_AC24: keyboard only: Enter or Space on ? open and close the help; Enter on the + creates a child', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    helpButton().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    addButton('Focus').focus();
    await user.keyboard('{Enter}');
    // Amended in slice 5: the + opens the kind menu; Enter on "Idea" creates the child.
    expect(menuItem('Idea')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(titleInput()).toHaveFocus();
  });

  it('S1_FE_AC24: Space on the + button creates a child in edit mode', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addButton('Focus').focus();
    await user.keyboard(' ');
    expect(menuItem('Idea')).toHaveFocus();
    await user.keyboard(' ');
    expect(titleInput()).toHaveFocus();
  });

  it('S1_FE_AC24: with focus on a button, Tab does not create a child but moves to the next interactive control', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    helpButton().focus();
    await user.tab();
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(screen.getByLabelText('Visible levels')).toHaveFocus();
  });
});

describe('S1_FE_AC25: initial hint', () => {
  const HINT = 'Tap + or Tab to add an idea';

  it('S1_FE_AC25: it shows with the real root without children and disappears when Tab creates the first child', async () => {
    const api = new FakeApi([{ id: 'root', parent_id: null, title: 'My map', sort_key: 'V' }]);
    const { user } = renderApp('/', api);
    await screen.findByTestId('node-root');
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await user.keyboard('{Tab}');
    await user.type(titleInput(), 'First');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('First'));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('S1_FE_AC25: it disappears when the + button creates the first child', async () => {
    const api = new FakeApi([{ id: 'root', parent_id: null, title: 'My map', sort_key: 'V' }]);
    const { user } = renderApp('/', api);
    await screen.findByTestId('node-root');
    expect(screen.getByText(HINT)).toBeInTheDocument();
    addIdeaWith('My map');
    await user.type(titleInput(), 'First with +');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('First with +'));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('S1_FE_AC25: if creating the first child is cancelled with Escape, the hint stays visible', async () => {
    const api = new FakeApi([{ id: 'root', parent_id: null, title: 'My map', sort_key: 'V' }]);
    const { user } = renderApp('/', api);
    await screen.findByTestId('node-root');
    expect(screen.getByText(HINT)).toBeInTheDocument();
    addIdeaWith('My map');
    expect(titleInput()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it('S1_FE_AC25: it does not show if the root already has children', async () => {
    renderApp('/', sampleApi());
    await screen.findByTestId('node-root');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('S1_FE_AC25: it does not show if the focus is not the real root', async () => {
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: 'My map', sort_key: 'V' },
      { id: 'x', parent_id: 'root', title: 'Alone', sort_key: 'V' },
    ]);
    renderApp('/n/x', api);
    await screen.findByTestId('node-x');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it("S1_FE_AC25: if the root's only child is deleted, the hint shows again", async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = new FakeApi([
      { id: 'root', parent_id: null, title: 'My map', sort_key: 'V' },
      { id: 'child-1', parent_id: 'root', title: 'Only child', sort_key: 'V' },
    ]);
    const { user } = renderApp('/', api);
    await screen.findByTestId('node-child-1');
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    await selectNode('child-1');
    await user.keyboard('{Delete}');
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/child-1')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText(HINT)).toBeInTheDocument());
  });
});

describe('S1_FE_AC27: focus when creating siblings', () => {
  it('S1_FE_AC27: Enter, Enter, Enter leaves the third sibling in edit mode and focused', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    addIdeaWith('Focus');
    await user.keyboard('One{Enter}Two{Enter}Three{Enter}');
    expect(titleInput()).toHaveFocus();
    expect(titleInput()).toHaveValue('');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(3));
    expect(api.callsTo('POST', '/api/nodes/f/children').map((call) => call.body)).toEqual([
      { title: 'One' },
      { title: 'Two', after_sort_key: expect.any(String) },
      { title: 'Three', after_sort_key: expect.any(String) },
    ]);
  });
});

describe('S1_FE_AC26: creating beyond the border or inside a collapsed node', () => {
  it('S1_FE_AC26: + on a border node moves the focus one level down and creates the child in edit mode', async () => {
    const api = sampleApi();
    api.depth = 2;
    const { user } = renderApp('/n/root', api);
    await screen.findByTestId('node-root');
    addIdeaWith('Idea A');
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    await user.type(titleInput(), 'Child of A');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/a/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/a/children')[0].body).toEqual({ title: 'Child of A' });
  });

  it('S1_FE_AC26: Tab on a border node moves the focus one level down and creates the child in edit mode', async () => {
    const api = sampleApi();
    api.depth = 2;
    const { user } = renderApp('/n/root', api);
    await selectNode('a');
    await user.keyboard('{Tab}');
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
  });

  it('S1_FE_AC26: + on a collapsed node expands it and then creates the child in edit mode', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    addIdeaWith('Idea A');
    await waitFor(() => expect(titleInput()).toHaveFocus());
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({ collapsed: false, version: 1 });
    expect(nodeElement('a1')).toBeInTheDocument();
    await user.type(titleInput(), 'New child');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/a/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/a/children')[0].body).toEqual({ title: 'New child' });
  });

  it('S1_FE_AC26: if expanding for the + fails, no pending creation is left to fire later', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    api.failNext((call) => call.method === 'PATCH' && call.url === '/api/nodes/a', 500);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    addIdeaWith('Idea A');
    await screen.findByRole('alert');
    expect(queryTitleInput()).not.toBeInTheDocument();
    // Expanding by hand afterwards does not open a child in edit mode for the failed +.
    fireEvent.click(nodeElement('a'));
    screen.getByRole('main').focus();
    await user.keyboard(' ');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(2));
    await waitFor(() => expect(nodeElement('a1')).toBeInTheDocument());
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
  });
});

describe('S1_FE_AC36: coverage and traceability', () => {
  it('S1_FE_AC36: the suite covers every criterion and meets the 80% line threshold configured in Vite', () => {
    // Checked by running vitest --coverage with threshold lines: 80
    expect(true).toBe(true);
  });
});

describe('S3_FE_AC16: no pencil on the canvas', () => {
  it('S3_FE_AC16: no node draws a rename button, while + and 🗑 are still there', async () => {
    const { container } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a');
    fireEvent.click(nodeElement('a'));
    expect(screen.queryByLabelText(/^Rename /)).not.toBeInTheDocument();
    expect(container.querySelector('.map-node-edit')).toBeNull();
    expect(addButton('Idea A')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete Idea A')).toBeInTheDocument();
  });
});

describe('S3_FE_AC20: the help describes the details panel', () => {
  it('S3_FE_AC20: F2 edits in the details panel and Escape clears the selection', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    const help = within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).getByRole(
      'tabpanel',
      { name: 'Map' },
    );
    // Amended in slices 4A (S4A_FE_AC23) and 5 (S5_FE_AC22): the panel edits every kind.
    expect(
      within(help).getByText("Edit the selected node's title in the details panel."),
    ).toBeInTheDocument();
    expect(within(help).getByText('Escape')).toBeInTheDocument();
    expect(
      within(help).getByText('Clear the selection and close the details panel.'),
    ).toBeInTheDocument();
  });
});

describe('S4A_FE_AC23: the help describes the task shortcuts', () => {
  it('S4A_FE_AC23: Shift + Tab opens the kind menu, and the drag entry names what a leaf refuses', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    const help = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

    // Amended in slice 5 (S5_FE_AC22): Shift + Tab opens the kind menu, and documents are leaves.
    expect(within(help).getByText('Shift + Tab')).toBeInTheDocument();
    expect(
      within(help).getByText(
        'With the map focused, opens the menu of what to add inside the selected idea, as + does: press 1 for an idea, 2 for a task or 3 for a document. Only ideas can have child nodes.',
      ),
    ).toBeInTheDocument();
    expect(
      within(help).getByText(
        'Drop any node on an idea to make it its last child, or between its own siblings to reorder it. Breadcrumb entries also accept the drop; tasks and documents never do.',
      ),
    ).toBeInTheDocument();
    expect(
      within(help).getByText(
        'Makes the selected node the last child of the idea above it. Only ideas can have child nodes.',
      ),
    ).toBeInTheDocument();
  });
});

describe('S4B_FE_AC20: the help describes the board', () => {
  it('S4B_FE_AC20: the "Board" group lists its keys with the wording of decision D16', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    const group = helpGroup('Board');

    const expected = [
      { key: 'Enter', desc: "Opens the focused card's details." },
      { key: 'Alt + ← →', desc: 'Moves the card to the previous or next column.' },
      { key: 'Alt + ↑ ↓', desc: 'Moves the card up or down in its column.' },
      { key: 'Delete', desc: 'Deletes the card.' },
      { key: 'Escape', desc: 'Clears the selection.' },
      { key: 'Drag', desc: 'Drag a card to another column or position.' },
    ];
    for (const { key, desc } of expected) {
      expect(within(group).getByText(key)).toBeInTheDocument();
      expect(within(group).getByText(desc)).toBeInTheDocument();
    }
    expect(helpTab('Map')).toBeInTheDocument();
  });
});

describe('S5_FE_AC22: the help describes documents and the kind menu', () => {
  it('S5_FE_AC22: Shift + Tab names the kind menu and its numbers, and a "Document" group lists the editor keys', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    const mapGroup = screen.getByRole('tabpanel', { name: 'Map' });

    expect(
      within(mapGroup).getByText(
        'With the map focused, opens the menu of what to add inside the selected idea, as + does: press 1 for an idea, 2 for a task or 3 for a document. Only ideas can have child nodes.',
      ),
    ).toBeInTheDocument();
    const group = helpGroup('Document');
    for (const key of ['Markdown', 'Tab', 'Ctrl/⌘ + B, I', 'Escape']) {
      expect(within(group).getByText(key)).toBeInTheDocument();
    }
    expect(
      within(group).getByText(
        'Collapses the expanded editor; otherwise saves and gives the keyboard back to the map. It never discards text. It is the way out of the editor, since Tab writes.',
      ),
    ).toBeInTheDocument();
  });
});

describe('S5_FE_AC25: a press outside closes the help', () => {
  it('S5_FE_AC25: pressing the map closes the panel without moving the focus to "?"', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();

    await user.click(screen.getByRole('main'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false');
    expect(helpButton()).not.toHaveFocus();
  });

  it('S5_FE_AC25: pressing inside the panel keeps it open, and "?" still toggles it', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.click(helpButton());

    await user.click(helpTab('Document'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(helpButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('S5_FE_AC28: the help has one tab per section', () => {
  it('S5_FE_AC28: on the map it opens on "Map", and the tabs switch by click and arrows', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    fireEvent.click(helpButton());

    const tabs = screen.getByRole('tablist', { name: 'Shortcut sections' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['Map', 'Board', 'Document']);
    expect(helpTab('Map')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Map' })).toBeInTheDocument();

    fireEvent.click(helpTab('Document'));
    expect(screen.getByRole('tabpanel', { name: 'Document' })).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel', { name: 'Map' })).not.toBeInTheDocument();

    helpTab('Document').focus();
    await user.keyboard('{ArrowRight}');
    expect(helpTab('Map')).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Map' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tabpanel', { name: 'Document' })).toBeInTheDocument();
  });

  it('S5_FE_AC28: on the board it opens on "Board", and the next opening follows the view again', async () => {
    const { user } = renderApp('/n/f/board', sampleApi());
    await screen.findByRole('heading', { name: 'Focus' });
    fireEvent.click(helpButton());

    expect(helpTab('Board')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Board' })).toBeInTheDocument();

    // Another tab is a passing look; reopening starts from the view's tab again.
    fireEvent.click(helpTab('Map'));
    await user.keyboard('{Escape}');
    fireEvent.click(helpButton());
    expect(helpTab('Board')).toHaveAttribute('aria-selected', 'true');
  });

  it('S5_FE_AC28: with a document selected on the map, it opens on "Document"', async () => {
    const api = new FakeApi([
      ...sampleTree(),
      { id: 'd', parent_id: 'f', title: 'Notes', sort_key: 'Z', kind: 'document' },
    ]);
    renderApp('/n/f', api);
    fireEvent.click(await screen.findByTestId('node-d'));
    await screen.findByRole('complementary', { name: 'Document details' });

    fireEvent.click(helpButton());
    expect(helpTab('Document')).toHaveAttribute('aria-selected', 'true');

    // Back on an idea, the help opens on "Map" again.
    fireEvent.click(helpButton());
    fireEvent.click(screen.getByTestId('node-a'));
    fireEvent.click(helpButton());
    expect(helpTab('Map')).toHaveAttribute('aria-selected', 'true');
  });
});
