import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPath, nodeElement, queryNode, renderApp, sampleApi } from './test/renderApp';

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

const deleteButton = (title: string) => screen.getByLabelText(`Delete ${title}`);
const option = (name: string) => screen.getByRole('button', { name });
const ALL = 'Delete everything from here';
const REPARENT = 'Delete only this one and move its children up';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('delete: visible button', () => {
  it('AC5: every non-root node has a delete button and the real root does not', async () => {
    renderApp('/', sampleApi());
    await screen.findByTestId('node-f');
    expect(deleteButton('Focus')).toBeInTheDocument();
    expect(screen.queryByLabelText('Delete My map')).not.toBeInTheDocument();
  });

  it('AC5: activating the button is the same as selecting and pressing Delete', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    await user.click(deleteButton('Idea B'));
    expect(queryNode('b')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/b')).toHaveLength(1));
  });
});

describe('delete: leaf', () => {
  it('AC6: a leaf is deleted without a dialog or window.confirm, in cascade mode', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a2');
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    expect(queryNode('a2')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a2')).toHaveLength(1));
  });

  it('AC6: a leaf deleted with the button is also deleted without asking', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-a2');
    await user.click(deleteButton('Idea A2'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a2')).toHaveLength(1));
  });
});

describe('delete: inner node', () => {
  it('AC7: opens an accessible dialog with three options and focus inside', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Idea A/);
    expect(dialog).toHaveTextContent('It has 2 descendants. What should we do with them?');
    expect(option(ALL)).toBeInTheDocument();
    expect(option(REPARENT)).toBeInTheDocument();
    expect(option('Cancel')).toHaveFocus();
    expect(confirm).not.toHaveBeenCalled();
    // Tab and Shift+Tab cycle through the options without leaving the dialog.
    await user.tab();
    expect(option(ALL)).toHaveFocus();
    await user.tab({ shift: true });
    expect(option('Cancel')).toHaveFocus();
    await user.tab({ shift: true });
    expect(option(REPARENT)).toHaveFocus();
  });

  it('AC7: a node with only hidden children (child_count > 0) also asks', async () => {
    const api = sampleApi();
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await selectNode('a');
    await user.keyboard('{Delete}');
    expect(screen.getByRole('dialog')).toHaveTextContent('at least 2');
  });

  it('AC8: "Delete everything from here" deletes the subtree and closes the dialog', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.click(option(ALL));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(queryNode('a')).not.toBeInTheDocument();
    expect(queryNode('a1')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/a')).toHaveLength(1));
  });

  it('AC9: "move its children up" uses children=reparent and fetches the window again', async () => {
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
    // a1 and a2 are children of f, in a's place (before b) and in their order.
    expect([...api.nodes.values()].filter((n) => n.parent_id === 'f').length).toBe(3);
    expect(api.children('f').map((n) => n.id)).toEqual(['a1', 'a2', 'b']);
  });

  it('AC10: Cancel deletes nothing and returns focus to the map', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.click(option('Cancel'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(nodeElement('a')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('AC10: Esc cancels and returns focus to the map', async () => {
    const { user, api } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Delete}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('AC11: deleting the inner focus with either mode navigates to its parent', async () => {
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
