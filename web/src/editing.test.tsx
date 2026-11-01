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

// React Flow nodes stay `visibility: hidden` in jsdom (they are not measured), so they are
// looked up by label and not by role.
const titleInput = () => screen.getByLabelText('Title');
const queryTitleInput = () => screen.queryByLabelText('Title');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('creating nodes', () => {
  it('criterion_10: Tab instantly creates a child in edit mode and confirming calls POST', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    expect(titleInput()).toHaveFocus();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    await user.type(titleInput(), 'New idea');
    fireEvent.blur(titleInput());
    await screen.findByText('New idea');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({ title: 'New idea' });
    await waitFor(() => expect(nodeElement('new-1')).toHaveTextContent('New idea'));
  });

  it("criterion_10: Enter confirms and creates a sibling with the edited node's after_sort_key", async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{F2}');
    await user.keyboard('{Enter}');
    await user.type(titleInput(), 'Sibling{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({
      title: 'Sibling',
      after_sort_key: 'F',
    });
    // The sibling of a just-created node uses the sort_key the API assigned to it.
    await user.type(titleInput(), 'Third{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(2));
    expect(api.callsTo('POST', '/api/nodes/f/children')[1].body).toEqual({
      title: 'Third',
      after_sort_key: 'FV',
    });
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
  });

  it('criterion_10: an empty or whitespace-only title is not sent', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), '   {Enter}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('criterion_10: a title with leading and trailing spaces is sent trimmed', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), '   Trimmed spaces   ');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/f/children')[0].body).toEqual({
      title: 'Trimmed spaces',
    });
  });

  it('criterion_10: Escape during creation cancels the new node without calling the API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    expect(titleInput()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(queryTitleInput()).not.toBeInTheDocument();
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(nodeElement('f')).toHaveClass('is-selected');
  });

  it('Tab on a border node moves the focus one level down and creates the child in edit mode', async () => {
    const api = sampleApi();
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard('{Tab}');
    await waitFor(() => expect(currentPath()).toBe('/n/a'));
    await waitFor(() => expect(queryTitleInput()).toHaveFocus());
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
  });
});

describe('renaming', () => {
  it('criterion_11: F2 and confirming call PATCH with title and version; it takes the new version', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    await user.type(titleInput(), 'Renamed');
    fireEvent.blur(titleInput());
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({
      title: 'Renamed',
      version: 1,
    });
    expect(nodeElement('a')).toHaveTextContent('Renamed');
    await user.keyboard(' ');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(2));
    expect(api.callsTo('PATCH', '/api/nodes/a')[1].body).toEqual({ collapsed: true, version: 2 });
  });

  it('criterion_11: the pencil starts editing', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    fireEvent.click(await screen.findByLabelText('Rename Idea B'));
    await user.clear(titleInput());
    await user.type(titleInput(), 'Another B{Escape}');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    expect(nodeElement('b')).toHaveTextContent('Idea B');
  });

  it('criterion_11: while editing, Backspace, Delete, Space and the arrows act on the text', async () => {
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

  it('an empty title when renaming keeps the previous title without calling the API', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('b');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    fireEvent.blur(titleInput());
    expect(nodeElement('b')).toHaveTextContent('Idea B');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
  });
});

describe('collapsing', () => {
  it('criterion_12: Space hides the children and calls PATCH; again shows them', async () => {
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

  it('criterion_12: a window with collapsed: true does not draw those children; expanding fetches them', async () => {
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

  it('Space on a node without children does nothing', async () => {
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
    title: `Node ${id}`,
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

describe('deleting', () => {
  it('criterion_13: Delete opens the dialog with the number of descendants', async () => {
    const api = new FakeApi(treeWithSevenDescendants());
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', api);
    await selectNode('x');
    await user.keyboard('{Delete}');
    expect(screen.getByRole('dialog')).toHaveTextContent('7');
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(nodeElement('x')).toBeInTheDocument();

    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Delete everything from here' }));
    expect(queryNode('x')).not.toBeInTheDocument();
    expect(queryNode('x11')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/x')).toHaveLength(1));
    expect(api.callsTo('DELETE', '/api/nodes/x')[0].headers['X-CSRF']).toBe('1');
    // The previous sibling stays selected.
    expect(nodeElement('b')).toHaveClass('is-selected');
  });

  it('criterion_13: if there are unloaded levels, the dialog says "at least"', async () => {
    const api = new FakeApi(treeWithSevenDescendants());
    api.depth = 2;
    const { user } = renderApp('/n/f', api);
    await selectNode('x');
    await user.keyboard('{Delete}');
    expect(screen.getByRole('dialog')).toHaveTextContent('at least 7');
  });

  it('criterion_13: a node without descendants is deleted without confirmation', async () => {
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

  it('criterion_13: Delete on the root does nothing', async () => {
    const api = sampleApi();
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/', api);
    await selectNode('root');
    await user.keyboard('{Delete}');
    expect(confirm).not.toHaveBeenCalled();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
  });

  it('deleting the focus goes to its parent', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/a', api);
    await screen.findByTestId('node-a');
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Delete everything from here' }));
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    expect(await screen.findByTestId('node-f')).toBeInTheDocument();
    expect(queryNode('a')).not.toBeInTheDocument();
  });
});

describe('selection with arrows', () => {
  it('criterion_14: → first child, ← parent, ↑ and ↓ siblings; outside the visible area it does not change', async () => {
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

  it('criterion_14: right arrow on a collapsed or border node does not change the selection', async () => {
    const api = sampleApi();
    api.nodes.get('a')!.collapsed = true;
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    const expectSelected = (id: string) => expect(nodeElement(id)).toHaveClass('is-selected');
    await screen.findByTestId('node-f');
    await user.keyboard('{ArrowRight}');
    expectSelected('a');
    // 'a' is collapsed and on the border: it has no visible children
    await user.keyboard('{ArrowRight}');
    expectSelected('a');
  });
});

describe('optimistic with rollback', () => {
  it('criterion_15: a rename with 409 goes back to the previous title, notifies and fetches the window again', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 409);
    const { user } = renderApp('/n/f', api);
    await selectNode('b');
    await user.keyboard('{F2}');
    await user.clear(titleInput());
    await user.type(titleInput(), 'Change');
    fireEvent.blur(titleInput());
    expect(await screen.findByRole('alert')).toHaveTextContent('changed elsewhere');
    expect(nodeElement('b')).toHaveTextContent('Idea B');
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('criterion_15: a creation with 5xx disappears and notifies', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'POST', 500);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    await user.keyboard('{Tab}');
    await user.type(titleInput(), 'Failure');
    fireEvent.blur(titleInput());
    expect(await screen.findByRole('alert')).toHaveTextContent('it was undone');
    expect(screen.queryByText('Failure')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });

  it('criterion_15: a collapse with 422 shows the children again', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 422);
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard(' ');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(nodeElement('a1')).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });

  it('criterion_15: a delete with 5xx brings the node back', async () => {
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
