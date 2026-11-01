import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { currentPath, nodeElement, queryNode, renderApp, sampleApi } from './test/renderApp';

describe('focus navigation', () => {
  it("criterion_5: /n/X requests the window with the user's depth and draws X as the focus", async () => {
    const api = sampleApi();
    renderApp('/n/f', api);
    expect(await screen.findByTestId('node-f')).toHaveClass('is-focus');
    expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(1);
    expect(nodeElement('a1')).toBeInTheDocument();
  });

  it('criterion_5: / uses root_node_id from /api/me', async () => {
    const api = sampleApi();
    renderApp('/', api);
    expect(await screen.findByTestId('node-root')).toHaveClass('is-focus');
    expect(api.callsTo('GET', '/api/nodes/root/view?depth=3')).toHaveLength(1);
  });

  it('criterion_5: a 404 shows "Not found" with a link to /', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/someone-elses', api);
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Back to the start' });
    expect(link).toHaveAttribute('href', '/');
    await user.click(link);
    await waitFor(() => expect(currentPath()).toBe('/'));
    expect(await screen.findByTestId('node-root')).toHaveClass('is-focus');
  });

  it('criterion_5: a 422 (an id that is not a UUID) also shows "Not found"', async () => {
    const api = sampleApi();
    api.failNext((call) => call.url.startsWith('/api/nodes/f/view'), 422);
    renderApp('/n/f', api);
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('criterion_5: going back in history returns to the previous focus from the cache', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    fireEvent.doubleClick(await screen.findByTestId('node-a'));
    await waitFor(() => expect(currentPath()).toBe('/n/a'));
    expect(await screen.findByTestId('node-a')).toHaveClass('is-focus');
    await user.click(screen.getByRole('button', { name: 'history-back' }));
    await waitFor(() => expect(nodeElement('f')).toHaveClass('is-focus'));
    expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(1);
  });

  it('criterion_7: double click on a node that is not the focus navigates to /n/<id>', async () => {
    renderApp('/n/f', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-b'));
    await waitFor(() => expect(currentPath()).toBe('/n/b'));
  });

  it('criterion_7: double click on the focus goes up to its parent, or to / if the parent is the root', async () => {
    renderApp('/n/a', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-a'));
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    fireEvent.doubleClick(await screen.findByTestId('node-f'));
    await waitFor(() => expect(currentPath()).toBe('/'));
  });

  it('criterion_7: double click on the real root does not change the URL', async () => {
    renderApp('/', sampleApi());
    fireEvent.doubleClick(await screen.findByTestId('node-root'));
    expect(currentPath()).toBe('/');
    expect(nodeElement('root')).toHaveClass('is-focus');
  });

  it('criterion_8: the breadcrumb shows the ancestors and the focus in order and focuses on click', async () => {
    const { user } = renderApp('/n/a1', sampleApi());
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    await waitFor(() =>
      expect([...crumbs.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
        'My map',
        'Focus',
        'Idea A',
        'Idea A1',
      ]),
    );
    await user.click(screen.getByRole('link', { name: 'Focus' }));
    await waitFor(() => expect(currentPath()).toBe('/n/f'));
    await user.click(await screen.findByRole('link', { name: 'My map' }));
    await waitFor(() => expect(currentPath()).toBe('/'));
  });

  it('criterion_8: Enter focuses the selected node and Backspace goes up like the double click', async () => {
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

  it('criterion_9: the border shows +k, does not draw the next level and does not expand', async () => {
    const api = sampleApi();
    for (let i = 1; i <= 4; i++) {
      api.nodes.set(`b${i}`, {
        id: `b${i}`,
        parent_id: 'b',
        title: `Leaf ${i}`,
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
    // A direct click on the indicator does not expand it in place either
    fireEvent.click(screen.getByText('+4'));
    expect(queryNode('b1')).not.toBeInTheDocument();
  });

  it('criterion_9: a border node without children shows no indicator', async () => {
    const api = sampleApi();
    api.depth = 1;
    renderApp('/n/a', api);
    const leaf = await screen.findByTestId('node-a1');
    expect(leaf.querySelector('.map-node-hidden')).toBeNull();
  });
});
