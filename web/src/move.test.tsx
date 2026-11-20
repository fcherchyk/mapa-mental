import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FakeApi } from './test/fakeApi';
import { currentPath, nodeElement, queryNode, renderApp, sampleApi } from './test/renderApp';

const moveCalls = (api: FakeApi) => api.callsTo('POST', /\/move$/);

const dragStart = (id: string) => fireEvent.dragStart(nodeElement(id));

/** A whole gesture: pick the node up, hover the target and let it go. */
function dragTo(id: string, target: HTMLElement): void {
  dragStart(id);
  fireEvent.dragOver(target);
  fireEvent.drop(target);
}

const gapZone = (afterId: string | null) => screen.getByTestId(`gap-${afterId ?? 'first'}`);

/**
 * The drawn order of the given ids. The layout emits a parent after its subtree, so the full
 * list is in post-order; siblings keep their own order in it, which is what these tests read.
 */
const drawnOrder = (ids: string[]) =>
  screen
    .getAllByTestId(/^node-/)
    .map((element) => element.dataset.testid!.replace('node-', ''))
    .filter((id) => ids.includes(id));

const childIdsIn = (api: FakeApi, parentId: string) =>
  api.children(parentId).map((node) => node.id);

describe('starting the gesture', () => {
  /**
   * React Flow's pan handler is attached to the pane the nodes live in. If a mousedown on a node
   * reaches it, d3-zoom calls d3-drag's `dragDisable`, which registers a capture-phase listener
   * on the window that cancels every `dragstart`: the node can never be picked up. The `nopan`
   * class on the node is what keeps the pan filter away from it.
   */
  it('S2_FE_AC21: pressing a node does not cancel the drag the browser is about to start', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    const node = nodeElement('b');

    // `dragDisable` registers its listener on the event's `view`, so the press has to carry one.
    // jsdom refuses a `view` in the MouseEvent constructor, and d3 only ever calls
    // `addEventListener` on it, so a plain event with the window attached is enough.
    const press = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'view', { value: globalThis.window });
      fireEvent(node, event);
    };

    press('mousedown');

    const dragstart = new Event('dragstart', { bubbles: true, cancelable: true });
    node.dispatchEvent(dragstart);
    expect(dragstart.defaultPrevented).toBe(false);
    press('mouseup');
  });

  it('S2_FE_AC21: a node is marked so the canvas does not pan when it is dragged', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    expect(nodeElement('b')).toHaveClass('nopan');
    expect(nodeElement('b')).toHaveAttribute('draggable', 'true');
  });
});

describe('dragging onto another idea', () => {
  it('S2_FE_AC4: dropping on a node sends place "last" and makes it that node is child', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragTo('b', nodeElement('a'));

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].url).toBe('/api/nodes/b/move');
    expect(moveCalls(api)[0].body).toEqual({ parent_id: 'a', place: 'last', version: 1 });
    expect(moveCalls(api)[0].headers['X-CSRF']).toBe('1');
    await waitFor(() => expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2', 'b']));
    expect(childIdsIn(api, 'f')).toEqual(['a']);
  });

  it('S2_FE_AC6: dropping on a collapsed node appends without expanding it', async () => {
    const api = sampleApi();
    api.nodes.set('a', { ...api.nodes.get('a')!, collapsed: true });
    renderApp('/n/f', api);
    await screen.findByTestId('node-b');
    expect(queryNode('a1')).not.toBeInTheDocument();

    dragTo('b', nodeElement('a'));

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'a', place: 'last' });
    await waitFor(() => expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2', 'b']));
    // It stays collapsed, so the three children are counted but not drawn.
    expect(api.nodes.get('a')!.collapsed).toBe(true);
    await waitFor(() => expect(screen.getByLabelText('3 hidden children')).toBeInTheDocument());
    expect(queryNode('b')).not.toBeInTheDocument();
  });

  it('S2_FE_AC6: dropping on a border node appends to it as well', async () => {
    const api = sampleApi();
    api.depth = 1;
    renderApp('/n/f', api);
    await screen.findByTestId('node-b');

    dragTo('b', nodeElement('a'));

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'a', place: 'last' });
    await waitFor(() => expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2', 'b']));
  });
});

describe('dragging into a gap', () => {
  it('S2_FE_AC5: dropping in a gap sends an after_id and reorders the siblings', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('a');
    fireEvent.drop(gapZone('b'));

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toEqual({
      parent_id: 'f',
      place: { after_id: 'b' },
      version: 1,
    });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['b', 'a']));
  });

  it('S2_FE_AC5: the gap before the first sibling sends place "first"', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('b');
    fireEvent.drop(gapZone(null));

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'f', place: 'first' });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['b', 'a']));
  });

  it('S2_FE_AC3: the gaps shown are only the ones that would move the node', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('a');

    // Order a, b: for a only the gap after b moves it anywhere.
    expect(screen.getByLabelText('Move after "Idea B"')).toBeInTheDocument();
    expect(screen.queryByLabelText('Move before "Idea A"')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gap-a')).not.toBeInTheDocument();
  });

  it('S2_FE_AC9: no gap is drawn until a drag starts, and the one under the pointer lights up', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    expect(screen.queryByTestId('gap-first')).not.toBeInTheDocument();
    dragStart('b');
    const gap = screen.getByTestId('gap-first');
    expect(gap).toBeInTheDocument();
    expect(gap).not.toHaveClass('is-hovered');

    fireEvent.dragOver(gap);

    expect(screen.getByTestId('gap-first')).toHaveClass('is-hovered');
  });
});

describe('the breadcrumb as a drop target', () => {
  it('S2_FE_AC7: dropping on an ancestor moves the idea into it', async () => {
    const { api } = renderApp('/n/a', sampleApi());
    await screen.findByTestId('node-a1');
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });

    dragStart('a1');
    const entry = within(breadcrumb).getByText('Focus').closest('li')!;
    fireEvent.dragOver(entry);
    fireEvent.drop(entry);

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'f', place: 'last' });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['a', 'b', 'a1']));
  });

  it('S2_FE_AC13: an idea moved out of the window disappears, with a notice', async () => {
    renderApp('/n/a', sampleApi());
    await screen.findByTestId('node-a1');
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });

    dragStart('a1');
    fireEvent.drop(within(breadcrumb).getByText('Focus').closest('li')!);

    await waitFor(() => expect(queryNode('a1')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('moved into "Focus"');
    // The selection falls back to the parent it left.
    expect(nodeElement('a')).toHaveAttribute('aria-selected', 'true');
    expect(currentPath()).toBe('/n/a');
  });
});

describe('drops that are refused', () => {
  it('S2_FE_AC8: a node cannot be dropped on itself or on its own descendant', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a1');

    dragTo('a', nodeElement('a'));
    dragTo('a', nodeElement('a1'));

    expect(moveCalls(api)).toHaveLength(0);
    expect(childIdsIn(api, 'f')).toEqual(['a', 'b']);
  });

  it('S2_FE_AC8: dropping on the parent it is already last in calls nothing', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragTo('b', nodeElement('f'));

    expect(moveCalls(api)).toHaveLength(0);
  });

  it('S2_FE_AC9: a refused target is marked apart from a valid one', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a1');

    dragStart('a');
    expect(nodeElement('a')).toHaveClass('is-dragging');

    fireEvent.dragOver(nodeElement('a1'));
    expect(nodeElement('a1')).toHaveClass('is-drop-refused');

    fireEvent.dragOver(nodeElement('b'));
    expect(nodeElement('b')).toHaveClass('is-drop-target');
    expect(nodeElement('a1')).not.toHaveClass('is-drop-refused');
  });

  it('S2_FE_AC10: Escape cancels the drag and nothing is sent', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('a');
    expect(screen.getByTestId('gap-b')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByTestId('gap-b')).not.toBeInTheDocument();
    expect(nodeElement('a')).not.toHaveClass('is-dragging');
    expect(moveCalls(api)).toHaveLength(0);
  });

  it('S2_FE_AC10: letting go outside any target sends nothing', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('a');
    fireEvent.dragEnd(nodeElement('a'));

    expect(moveCalls(api)).toHaveLength(0);
    expect(nodeElement('a')).not.toHaveClass('is-dragging');
  });

  it('S2_FE_AC18: a drag that ends where it began does not focus or navigate', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    dragStart('b');
    fireEvent.dragEnd(nodeElement('b'));

    expect(currentPath()).toBe('/n/f');
    expect(moveCalls(api)).toHaveLength(0);
    expect(api.callsTo('GET', '/api/nodes/b/view?depth=3')).toHaveLength(0);
  });
});

describe('optimism and rollback', () => {
  it('S2_FE_AC11: a reorder inside the parent is drawn before the API answers', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    expect(drawnOrder(['a', 'b'])).toEqual(['a', 'b']);

    dragStart('a');
    fireEvent.drop(gapZone('b'));

    // Already redrawn, with the request still on its way.
    expect(drawnOrder(['a', 'b'])).toEqual(['b', 'a']);
    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
  });

  it('S2_FE_AC11: if the reorder fails it goes back and says so', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    api.failNext((call) => /\/move$/.test(call.url), 409);

    dragStart('a');
    fireEvent.drop(gapZone('b'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('The idea changed elsewhere');
    await waitFor(() => expect(drawnOrder(['a', 'b'])).toEqual(['a', 'b']));
    expect(childIdsIn(api, 'f')).toEqual(['a', 'b']);
  });

  it('S2_FE_AC12: a move to another parent reads the window again', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    const before = api.callsTo('GET', '/api/nodes/f/view?depth=3').length;

    dragTo('b', nodeElement('a'));

    await waitFor(() =>
      expect(api.callsTo('GET', '/api/nodes/f/view?depth=3').length).toBeGreaterThan(before),
    );
    // b is drawn inside a now, after its new siblings.
    await waitFor(() => expect(drawnOrder(['a1', 'a2', 'b'])).toEqual(['a1', 'a2', 'b']));
    expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2', 'b']);
  });

  it('S2_FE_AC12: if the move to another parent fails, nothing changes and it says so', async () => {
    const { api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    api.failNext((call) => /\/move$/.test(call.url), 500);

    dragTo('b', nodeElement('a'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the change');
    expect(childIdsIn(api, 'f')).toEqual(['a', 'b']);
    await waitFor(() => expect(drawnOrder(['a', 'b'])).toEqual(['a', 'b']));
    expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2']);
  });
});

describe('moving with the keyboard', () => {
  const select = async (id: string) => {
    fireEvent.click(nodeElement(id));
    expect(nodeElement(id)).toHaveClass('is-selected');
    screen.getByRole('main').focus();
  };

  it('S2_FE_AC14: Alt+ArrowDown and Alt+ArrowUp reorder among siblings', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('a');

    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'f', place: { after_id: 'b' } });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['b', 'a']));

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');

    await waitFor(() => expect(moveCalls(api)).toHaveLength(2));
    expect(moveCalls(api)[1].body).toMatchObject({ parent_id: 'f', place: 'first' });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['a', 'b']));
  });

  it('S2_FE_AC14: at the ends of the sibling list the arrows do nothing', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('a');

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await select('b');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(moveCalls(api)).toHaveLength(0);
    expect(childIdsIn(api, 'f')).toEqual(['a', 'b']);
  });

  it('S2_FE_AC15: Alt+ArrowRight makes it the last child of the idea above', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('b');

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'a', place: 'last' });
    await waitFor(() => expect(childIdsIn(api, 'a')).toEqual(['a1', 'a2', 'b']));
  });

  it('S2_FE_AC15: with no idea above, Alt+ArrowRight does nothing', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('a');

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    expect(moveCalls(api)).toHaveLength(0);
  });

  it('S2_FE_AC16: Alt+ArrowLeft takes it out, as the last child of its grandparent', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a1');
    await select('a1');

    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');

    await waitFor(() => expect(moveCalls(api)).toHaveLength(1));
    expect(moveCalls(api)[0].body).toMatchObject({ parent_id: 'f', place: 'last' });
    await waitFor(() => expect(childIdsIn(api, 'f')).toEqual(['a', 'b', 'a1']));
  });

  it('S2_FE_AC16: an idea whose parent is the focus cannot be taken out', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('a');

    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');

    expect(moveCalls(api)).toHaveLength(0);
  });

  it('S2_FE_AC14: the arrows alone still move the selection, not the ideas', async () => {
    const { api, user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');
    await select('a');

    await user.keyboard('{ArrowDown}');

    expect(moveCalls(api)).toHaveLength(0);
    expect(nodeElement('b')).toHaveClass('is-selected');
  });
});

describe('the shortcuts panel', () => {
  it('S2_FE_AC17: it lists the Alt shortcuts and the drag gesture', async () => {
    renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-b');

    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));

    // The map's group of the panel; the board has its own since slice 4B (S4B_FE_AC20).
    const panel = within(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).getByRole(
      'tabpanel',
      { name: 'Map' },
    );
    for (const keys of ['Alt + ↑ ↓', 'Alt + →', 'Alt + ←', 'Drag']) {
      expect(within(panel).getByText(keys)).toBeInTheDocument();
    }
    expect(
      // Amended in slices 4A (S4A_FE_AC23) and 5 (S5_FE_AC22): every kind moves with these keys.
      within(panel).getByText('Move the selected node up or down among its siblings.'),
    ).toBeInTheDocument();
  });
});
