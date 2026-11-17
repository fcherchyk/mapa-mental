import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentPath, nodeElement, renderApp, sampleApi } from './test/renderApp';

// Slice 3: the selected node's details, edited in a panel on the right.

const panel = () => screen.getByRole('complementary', { name: 'Idea details' });
const queryPanel = () => screen.queryByRole('complementary', { name: 'Idea details' });
const titleField = () => within(panel()).getByLabelText('Title');
const descriptionField = () => within(panel()).getByLabelText('Description');
const inlineTitle = () => screen.getByLabelText('New idea title');
const map = () => screen.getByRole('main');

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

/** Selects the node and waits for its description to arrive. */
const openDetails = async (id: string, title: string) => {
  await selectNode(id);
  await waitFor(() => expect(titleField()).toHaveValue(title));
  await waitFor(() => expect(descriptionField()).toBeEnabled());
};

const apiWithDescriptions = () => {
  const api = sampleApi();
  api.nodes.get('a')!.description = 'About A';
  api.nodes.get('b')!.description = 'About B';
  return api;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the panel', () => {
  it('S3_FE_AC1: selecting a node opens the panel with its title and its description from GET', async () => {
    const api = apiWithDescriptions();
    renderApp('/n/f', api);
    await selectNode('a');
    expect(titleField()).toHaveValue('Idea A');
    // The title is known from the window; the description waits for its request.
    expect(descriptionField()).toBeDisabled();
    await waitFor(() => expect(descriptionField()).toHaveValue('About A'));
    expect(descriptionField()).toBeEnabled();
    expect(api.callsTo('GET', '/api/nodes/a')).toHaveLength(1);
  });

  it('S3_FE_AC1: with nothing selected there is no panel', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await screen.findByTestId('node-f');
    // On load the focus is selected, so the panel is already open (agreed in the spec review).
    expect(panel()).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(queryPanel()).not.toBeInTheDocument();
  });

  it('S3_FE_AC2: the panel follows the arrows, keeps the keyboard on the map and reuses the cache', async () => {
    const api = apiWithDescriptions();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.keyboard('{ArrowDown}');
    expect(nodeElement('b')).toHaveClass('is-selected');
    expect(titleField()).toHaveValue('Idea B');
    await waitFor(() => expect(descriptionField()).toHaveValue('About B'));
    expect(titleField()).not.toHaveFocus();
    expect(descriptionField()).not.toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(descriptionField()).toHaveValue('About A');
    expect(api.callsTo('GET', '/api/nodes/a')).toHaveLength(1);
  });

  it('S3_FE_AC3: Escape on the map and a click on the empty canvas clear the selection', async () => {
    const { user, container } = renderApp('/n/f', sampleApi());
    await selectNode('a');
    await user.keyboard('{Escape}');
    expect(queryPanel()).not.toBeInTheDocument();
    expect(nodeElement('a')).not.toHaveClass('is-selected');
    // The arrows bring the selection back, on the focus.
    await user.keyboard('{ArrowRight}');
    expect(nodeElement('f')).toHaveClass('is-selected');
    expect(panel()).toBeInTheDocument();
    await selectNode('b');
    fireEvent.click(container.querySelector('.react-flow__pane')!);
    expect(queryPanel()).not.toBeInTheDocument();
  });

  it('S3_FE_AC4: a failed load shows an error with Retry; the title stays editable', async () => {
    const api = apiWithDescriptions();
    api.failNext((call) => call.method === 'GET' && call.url === '/api/nodes/b', 500);
    const { user } = renderApp('/n/f', api);
    await selectNode('b');
    expect(await within(panel()).findByRole('alert')).toHaveTextContent(
      'Could not load the description.',
    );
    expect(titleField()).toBeEnabled();
    expect(descriptionField()).toBeDisabled();
    await user.click(within(panel()).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(descriptionField()).toHaveValue('About B'));
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('editing in the panel', () => {
  it('S3_FE_AC5: the title is saved on blur, trimmed, and shows on the canvas', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('b', 'Idea B');
    await user.clear(titleField());
    await user.type(titleField(), '  New B  ');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    fireEvent.blur(titleField());
    expect(nodeElement('b')).toHaveTextContent('New B');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/b')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/b')[0].body).toEqual({ title: 'New B', version: 1 });
    expect(titleField()).toHaveValue('New B');
  });

  it('S3_FE_AC5: Enter saves the title; an unchanged title sends nothing', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('b', 'Idea B');
    titleField().focus();
    fireEvent.blur(titleField());
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    await user.type(titleField(), '!{Enter}');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/b')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/b')[0].body).toEqual({ title: 'Idea B!', version: 1 });
    // Enter in the panel never creates a sibling (decision D5).
    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();
  });

  it('S3_FE_AC6: an empty title is not sent; it shows an error and restores the saved title', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('b', 'Idea B');
    await user.clear(titleField());
    await user.type(titleField(), '   ');
    fireEvent.blur(titleField());
    expect(within(panel()).getByRole('alert')).toHaveTextContent("Title can't be empty");
    expect(titleField()).toHaveValue('Idea B');
    expect(nodeElement('b')).toHaveTextContent('Idea B');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
  });

  it('S3_FE_AC7: the description keeps its line breaks and is saved on blur', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(descriptionField(), 'Line 1{Enter}  Line 2');
    expect(descriptionField()).toHaveValue('Line 1\n  Line 2');
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    fireEvent.blur(descriptionField());
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({
      description: 'Line 1\n  Line 2',
      version: 1,
    });
    expect(api.nodes.get('a')!.description).toBe('Line 1\n  Line 2');
  });

  it('S3_FE_AC7: an unchanged description sends nothing', async () => {
    const api = apiWithDescriptions();
    renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    descriptionField().focus();
    fireEvent.blur(descriptionField());
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
  });

  it('S3_FE_AC8: the description is capped at 1000 characters, with a counter', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await openDetails('a', 'Idea A');
    expect(descriptionField()).toHaveAttribute('maxLength', '1000');
    expect(within(panel()).getByText('0 / 1000')).toBeInTheDocument();
    await user.type(descriptionField(), 'abc');
    expect(within(panel()).getByText('3 / 1000')).toBeInTheDocument();
  });

  it('S3_FE_AC9: changing the selection saves the pending change against the previous node', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(descriptionField(), 'For A');
    // A plain click event, with no blur first: the panel switching node must save by itself.
    fireEvent.click(nodeElement('b'));
    expect(titleField()).toHaveValue('Idea B');
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/a')[0].body).toEqual({
      description: 'For A',
      version: 1,
    });
    expect(api.callsTo('PATCH', '/api/nodes/b')).toHaveLength(0);
  });

  it('S3_FE_AC10: saves to one node go in order, each with the version the previous one returned', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(titleField(), ' 2');
    fireEvent.blur(titleField());
    await user.type(descriptionField(), 'Text');
    fireEvent.blur(descriptionField());
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/a')).toHaveLength(2));
    expect(api.callsTo('PATCH', '/api/nodes/a').map((call) => call.body)).toEqual([
      { title: 'Idea A 2', version: 1 },
      { description: 'Text', version: 2 },
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('S3_FE_AC11: a failed description save rolls back, notifies and reads the detail again', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 409);
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(descriptionField(), 'Lost');
    fireEvent.blur(descriptionField());
    expect(await screen.findByText(/changed elsewhere/)).toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/a')).toHaveLength(2));
    await waitFor(() => expect(descriptionField()).toHaveValue(''));
    await waitFor(() => expect(api.callsTo('GET', '/api/nodes/f/view?depth=3')).toHaveLength(2));
  });

  it('S3_FE_AC11: a failed title save puts the old title back on the canvas and in the panel', async () => {
    const api = sampleApi();
    api.failNext((call) => call.method === 'PATCH', 500);
    const { user } = renderApp('/n/f', api);
    await openDetails('b', 'Idea B');
    await user.clear(titleField());
    await user.type(titleField(), 'Broken{Enter}');
    expect(await screen.findByText(/it was undone/)).toBeInTheDocument();
    await waitFor(() => expect(nodeElement('b')).toHaveTextContent('Idea B'));
    expect(titleField()).toHaveValue('Idea B');
  });

  it('S3_FE_AC12: Escape discards the change, sends nothing and gives the keyboard back to the map', async () => {
    const api = apiWithDescriptions();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(descriptionField(), ' and more{Escape}');
    expect(descriptionField()).toHaveValue('About A');
    expect(map()).toHaveFocus();
    await user.type(titleField(), 'zzz{Escape}');
    expect(titleField()).toHaveValue('Idea A');
    expect(map()).toHaveFocus();
    expect(api.callsTo('PATCH', /nodes/)).toHaveLength(0);
    // Escape in a field is the panel's: the selection stays.
    expect(panel()).toBeInTheDocument();
    expect(nodeElement('a')).toHaveClass('is-selected');
  });

  it('S3_FE_AC13: while a field has focus the map shortcuts do not run', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    descriptionField().focus();
    await user.keyboard(' {Delete}{Backspace}{ArrowDown}{ArrowLeft}{F2}{Alt>}{ArrowUp}{/Alt}');
    await user.tab();
    titleField().focus();
    await user.keyboard('{End} {Delete}{ArrowRight}{ArrowLeft}{Alt>}{ArrowDown}{/Alt}');
    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.calls.filter((call) => !['GET', 'PATCH'].includes(call.method))).toHaveLength(0);
    expect(api.callsTo('PATCH', /nodes/).some((call) => 'collapsed' in (call.body as object))).toBe(
      false,
    );
    expect(currentPath()).toBe('/n/f');
    expect(nodeElement('a')).toHaveClass('is-selected');
  });

  it('S3_FE_AC14: after Enter or Escape in the panel, Tab, F2 and Space work on the map again', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('a', 'Idea A');
    await user.type(titleField(), '!{Enter}');
    expect(map()).toHaveFocus();
    await user.keyboard('{F2}');
    expect(titleField()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(map()).toHaveFocus();
    await user.keyboard(' ');
    await waitFor(() =>
      expect(api.callsTo('PATCH', '/api/nodes/a').map((call) => call.body)).toContainEqual({
        collapsed: true,
        version: 2,
      }),
    );
    descriptionField().focus();
    await user.keyboard('{Escape}');
    expect(map()).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(inlineTitle()).toHaveFocus();
  });
});

describe('F2 and creation', () => {
  it('S3_FE_AC15: F2 puts the focus on the panel title with its text selected; nothing opens on the canvas', async () => {
    const { user } = renderApp('/n/f', sampleApi());
    await selectNode('b');
    await user.keyboard('{F2}');
    const field = titleField() as HTMLInputElement;
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 'Idea B'.length]);
    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();
  });

  it('S3_FE_AC17: inline creation chains siblings without the panel, then hands over to it', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await selectNode('f');
    await user.keyboard('{Tab}');
    expect(queryPanel()).not.toBeInTheDocument();
    await user.type(inlineTitle(), 'One{Enter}');
    expect(queryPanel()).not.toBeInTheDocument();
    expect(inlineTitle()).toHaveFocus();
    await user.type(inlineTitle(), 'Two{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/f/children')).toHaveLength(2));
    await user.keyboard('{Escape}');
    expect(map()).toHaveFocus();
    await waitFor(() => expect(nodeElement('new-2')).toHaveClass('is-selected'));
    expect(titleField()).toHaveValue('Two');
    expect(descriptionField()).toHaveValue('');
    expect(descriptionField()).toBeEnabled();
    expect(api.callsTo('GET', /^\/api\/nodes\/new-/)).toHaveLength(0);
  });

  it('S3_FE_AC18: the root is edited in the panel like any node, and the panel offers no delete', async () => {
    const api = sampleApi();
    const { user } = renderApp('/', api);
    await openDetails('root', 'My map');
    await user.type(descriptionField(), 'Everything');
    fireEvent.blur(descriptionField());
    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/root')).toHaveLength(1));
    expect(api.nodes.get('root')!.description).toBe('Everything');
    expect(within(panel()).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('S3_FE_AC19: deleting the selected node drops its unsaved change and moves the panel on', async () => {
    const api = sampleApi();
    const { user } = renderApp('/n/f', api);
    await openDetails('b', 'Idea B');
    await user.type(descriptionField(), 'Never saved');
    // A plain click event, with no blur first, as the panel is about to lose its node.
    fireEvent.click(screen.getByLabelText('Delete Idea B'));
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/b')).toHaveLength(1));
    expect(api.callsTo('PATCH', '/api/nodes/b')).toHaveLength(0);
    expect(titleField()).not.toHaveValue('Idea B');
  });
});
