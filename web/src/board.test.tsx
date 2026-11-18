import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeApi, type FakeNode } from './test/fakeApi';
import { currentPath, renderApp, sampleTree } from './test/renderApp';

// Slice 4B: the kanban board of the focused node.

const item = (id: string, text: string, done = false) => ({ id, text, done });

/**
 * The sample map plus tasks: root › F › (A › (A1 › T3 done), A2, T1 to do), B, T2 in progress;
 * root › X › T4 to do. Tree order of the tasks: T3, T1, T2, T4.
 */
function boardTree(): FakeNode[] {
  return [
    ...sampleTree(),
    {
      id: 't3',
      parent_id: 'a1',
      title: 'Deep task',
      sort_key: 'F',
      kind: 'task',
      props: { status: 'done' },
    },
    {
      id: 't1',
      parent_id: 'a',
      title: 'Write spec',
      sort_key: 'Z',
      kind: 'task',
      props: { status: 'to_do', checklist: [item('1', 'Draft', true), item('2', 'Review')] },
    },
    {
      id: 't2',
      parent_id: 'f',
      title: 'Review PR',
      sort_key: 'Z',
      kind: 'task',
      props: { status: 'in_progress' },
    },
    { id: 'x', parent_id: 'root', title: 'Other', sort_key: 'Z' },
    { id: 't4', parent_id: 'x', title: 'Outside', sort_key: 'F', kind: 'task' },
  ];
}

const boardApi = () => new FakeApi(boardTree());

/** Three tasks A, B, C in To do under the focus, in that order. */
function abcApi(): FakeApi {
  return new FakeApi([
    ...sampleTree(),
    { id: 'ta', parent_id: 'f', title: 'A', sort_key: 'X', kind: 'task' },
    { id: 'tb', parent_id: 'f', title: 'B', sort_key: 'Y', kind: 'task' },
    { id: 'tc', parent_id: 'f', title: 'C', sort_key: 'Z', kind: 'task' },
  ]);
}

const board = () => screen.getByRole('main');
const card = (id: string) => screen.getByTestId(`card-${id}`);
const queryCard = (id: string) => screen.queryByTestId(`card-${id}`);
const column = (status: string) => screen.getByTestId(`column-${status}`);
const columnTitles = (status: string) =>
  within(column(status))
    .queryAllByRole('listitem')
    .filter((li) => li.classList.contains('board-card'))
    .map((li) => li.querySelector('.board-card-title')?.textContent);
const gap = (status: string, index: number) => screen.getByTestId(`gap-${status}-${index}`);
const panel = () => screen.getByRole('complementary', { name: 'Task details' });
const queryPanel = () => screen.queryByRole('complementary', { name: 'Task details' });
const addTaskButton = () => screen.getByRole('button', { name: '+ Add task' });
const newTaskInput = () => screen.getByLabelText('New task title');
const boardCalls = (api: FakeApi, id: string) => api.callsTo('GET', `/api/nodes/${id}/board`);
const moveCalls = (api: FakeApi, id: string) => api.callsTo('POST', `/api/nodes/${id}/board-move`);
const patchCalls = (api: FakeApi, id: string) => api.callsTo('PATCH', `/api/nodes/${id}`);
const mutations = (api: FakeApi) => api.calls.filter((call) => call.method !== 'GET');

const openBoard = async (path: string, api: FakeApi, firstCard: string) => {
  const result = renderApp(path, api);
  await screen.findByTestId(`card-${firstCard}`);
  return result;
};

// --- S4B_FE_AC1: routes -----------------------------------------------------------------------

describe('S4B_FE_AC1: board routes', () => {
  it('S4B_FE_AC1: /board requests the root board and draws its title and the three columns', async () => {
    const api = boardApi();
    await openBoard('/board', api, 't1');

    expect(boardCalls(api, 'root')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'My map' })).toBeInTheDocument();
    for (const name of ['To do', 'In progress', 'Done']) {
      expect(screen.getByRole('list', { name })).toBeInTheDocument();
    }
    expect(columnTitles('to_do')).toEqual(['Write spec', 'Outside']);
  });

  it('S4B_FE_AC1: /n/X/board requests the board of X and only its descendants show', async () => {
    const api = boardApi();
    await openBoard('/n/f/board', api, 't1');

    expect(boardCalls(api, 'f')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Focus' })).toBeInTheDocument();
    expect(columnTitles('to_do')).toEqual(['Write spec']);
    expect(columnTitles('in_progress')).toEqual(['Review PR']);
    expect(columnTitles('done')).toEqual(['Deep task']);
    expect(queryCard('t4')).not.toBeInTheDocument();
    expect(currentPath()).toBe('/n/f/board');
  });

  it('S4B_FE_AC1: an unknown node shows "Not found"', async () => {
    renderApp('/n/nope/board', boardApi());

    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });
});

// --- S4B_FE_AC2: the toggle -------------------------------------------------------------------

describe('S4B_FE_AC2: the Map | Board toggle', () => {
  it('S4B_FE_AC2: switches between /n/X and /n/X/board, marks the current one and keeps history', async () => {
    const api = boardApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-f');
    const view = () => screen.getByRole('navigation', { name: 'View' });
    expect(within(view()).getByRole('link', { name: 'Map' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(view()).getByRole('link', { name: 'Board' })).not.toHaveAttribute('aria-current');
    expect(screen.getByLabelText('Visible levels')).toBeInTheDocument();

    await user.click(within(view()).getByRole('link', { name: 'Board' }));
    await screen.findByTestId('card-t1');
    expect(currentPath()).toBe('/n/f/board');
    expect(within(view()).getByRole('link', { name: 'Board' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByLabelText('Visible levels')).not.toBeInTheDocument();

    await user.click(within(view()).getByRole('link', { name: 'Map' }));
    await screen.findByTestId('node-f');
    expect(currentPath()).toBe('/n/f');

    await user.click(screen.getByText('history-back'));
    await screen.findByTestId('card-t1');
    expect(currentPath()).toBe('/n/f/board');
  });

  it('S4B_FE_AC2: from the root map the toggle goes to /board', async () => {
    const { user } = renderApp('/', boardApi());
    await screen.findByTestId('node-root');

    await user.click(screen.getByRole('link', { name: 'Board' }));

    await screen.findByTestId('card-t1');
    expect(currentPath()).toBe('/board');
  });
});

// --- S4B_FE_AC3: breadcrumb -------------------------------------------------------------------

describe('S4B_FE_AC3: the breadcrumb on the board', () => {
  it("S4B_FE_AC3: an ancestor opens that ancestor's board, the root's at /board", async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/a/board', api, 't1');
    const crumbs = () => screen.getByRole('navigation', { name: 'Breadcrumb' });

    await user.click(within(crumbs()).getByRole('link', { name: 'Focus' }));
    await screen.findByTestId('card-t2');
    expect(currentPath()).toBe('/n/f/board');

    await user.click(within(crumbs()).getByRole('link', { name: 'My map' }));
    await screen.findByTestId('card-t4');
    expect(currentPath()).toBe('/board');
    expect(boardCalls(api, 'root')).toHaveLength(1);
  });
});

// --- S4B_FE_AC4 and AC5: cards, columns, empty board ---------------------------------------------

describe('S4B_FE_AC4: columns and cards', () => {
  it('S4B_FE_AC4: a card shows title, stripe, progress and the column its count', async () => {
    await openBoard('/n/f/board', boardApi(), 't1');

    const spec = card('t1');
    expect(spec).toHaveAttribute('data-status', 'to_do');
    expect(within(spec).getByLabelText('Status: To do')).toHaveClass('is-to_do');
    expect(within(spec).getByLabelText('1 of 2 done')).toHaveTextContent('1/2');
    expect(within(card('t2')).queryByLabelText(/done$/)).not.toBeInTheDocument();
    expect(within(card('t3')).getByLabelText('Status: Done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'To do (1)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Done (1)' })).toBeInTheDocument();
  });

  it('S4B_FE_AC4: cards follow the order the API returns, not the tree', async () => {
    const api = boardApi();
    api.nodes.get('t4')!.board_rank = 0.5;

    await openBoard('/board', api, 't1');

    expect(columnTitles('to_do')).toEqual(['Outside', 'Write spec']);
  });
});

describe('S4B_FE_AC5: empty board', () => {
  it('S4B_FE_AC5: three empty columns, the hint and the "Add task" button', async () => {
    renderApp('/n/b/board', boardApi());

    expect(await screen.findByText('No tasks under Idea B')).toBeInTheDocument();
    for (const status of ['to_do', 'in_progress', 'done']) {
      expect(columnTitles(status)).toEqual([]);
    }
    expect(addTaskButton()).toBeInTheDocument();
  });
});

// --- S4B_FE_AC6 and AC7: selection and the panel -----------------------------------------------

describe('S4B_FE_AC6: click opens the panel', () => {
  it('S4B_FE_AC6: click or Enter selects the card and opens "Task details"; Escape or an empty click closes it', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    expect(queryPanel()).not.toBeInTheDocument();

    fireEvent.click(card('t1'));
    expect(card('t1')).toHaveClass('is-selected');
    await waitFor(() => expect(within(panel()).getByLabelText('Title')).toHaveValue('Write spec'));

    fireEvent.doubleClick(card('t1'));
    expect(currentPath()).toBe('/n/f/board');
    expect(panel()).toBeInTheDocument();

    fireEvent.click(board());
    expect(queryPanel()).not.toBeInTheDocument();
    expect(card('t1')).not.toHaveClass('is-selected');

    card('t2').focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(within(panel()).getByLabelText('Title')).toHaveValue('Review PR'));

    await user.keyboard('{Escape}');
    expect(queryPanel()).not.toBeInTheDocument();
    expect(mutations(api)).toHaveLength(0);
  });
});

describe('S4B_FE_AC7: panel edits reach the card', () => {
  it('S4B_FE_AC7: renaming, changing the status and toggling an item update the card', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    fireEvent.click(card('t1'));
    const title = await within(panel()).findByLabelText('Title');
    await waitFor(() => expect(within(panel()).getByLabelText('Description')).toBeEnabled());

    await user.clear(title);
    await user.type(title, 'Write the spec{Enter}');
    expect(within(card('t1')).getByText('Write the spec')).toBeInTheDocument();
    await waitFor(() => expect(patchCalls(api, 't1')).toHaveLength(1));

    await user.click(within(panel()).getByRole('radio', { name: 'Done' }));
    expect(card('t1')).toHaveAttribute('data-status', 'done');
    expect(columnTitles('done')).toEqual(['Deep task', 'Write the spec']);
    await waitFor(() => expect(patchCalls(api, 't1')).toHaveLength(2));
    expect(patchCalls(api, 't1')[1].body).toEqual({
      props: { status: 'done', checklist: [item('1', 'Draft', true), item('2', 'Review')] },
      version: 2,
    });

    await user.click(within(panel()).getByRole('checkbox', { name: 'Review' }));
    expect(within(card('t1')).getByLabelText('2 of 2 done')).toBeInTheDocument();
    await waitFor(() => expect(patchCalls(api, 't1')).toHaveLength(3));
    expect(moveCalls(api, 't1')).toHaveLength(0);
  });
});

// --- S4B_FE_AC9 and AC10: dragging ------------------------------------------------------------

describe('S4B_FE_AC9: drag to another column', () => {
  it('S4B_FE_AC9: a drop after a card sends board-move with status and after_id and redraws at once', async () => {
    const api = boardApi();
    await openBoard('/n/f/board', api, 't1');

    fireEvent.dragStart(card('t1'));
    fireEvent.dragOver(gap('in_progress', 1));
    expect(gap('in_progress', 1)).toHaveClass('is-hovered');
    fireEvent.drop(gap('in_progress', 1));

    expect(columnTitles('in_progress')).toEqual(['Review PR', 'Write spec']);
    expect(columnTitles('to_do')).toEqual([]);
    await waitFor(() => expect(moveCalls(api, 't1')).toHaveLength(1));
    expect(moveCalls(api, 't1')[0].body).toEqual({
      status: 'in_progress',
      place: { after_id: 't2' },
      version: 1,
    });
    expect(moveCalls(api, 't1')[0].headers['X-CSRF']).toBe('1');
  });

  it('S4B_FE_AC9: the top gap sends before_id, and an empty column sends no place', async () => {
    const api = boardApi();
    await openBoard('/n/f/board', api, 't1');

    fireEvent.dragStart(card('t1'));
    fireEvent.drop(gap('done', 0));
    await waitFor(() => expect(moveCalls(api, 't1')).toHaveLength(1));
    expect(moveCalls(api, 't1')[0].body).toMatchObject({
      status: 'done',
      place: { before_id: 't3' },
    });
    expect(columnTitles('done')).toEqual(['Write spec', 'Deep task']);

    fireEvent.dragStart(card('t2'));
    fireEvent.drop(column('to_do'));
    await waitFor(() => expect(moveCalls(api, 't2')).toHaveLength(1));
    const body = moveCalls(api, 't2')[0].body as { status: string; place?: unknown };
    expect(body.status).toBe('to_do');
    expect(body.place ?? null).toBeNull();
    expect(columnTitles('to_do')).toEqual(['Review PR']);
  });
});

describe('S4B_FE_AC10: drag within a column', () => {
  it('S4B_FE_AC10: dropping A after C sends after_id C and the column reads B, C, A', async () => {
    const api = abcApi();
    await openBoard('/n/f/board', api, 'ta');

    fireEvent.dragStart(card('ta'));
    fireEvent.drop(gap('to_do', 3));

    expect(columnTitles('to_do')).toEqual(['B', 'C', 'A']);
    await waitFor(() => expect(moveCalls(api, 'ta')).toHaveLength(1));
    expect(moveCalls(api, 'ta')[0].body).toEqual({
      status: 'to_do',
      place: { after_id: 'tc' },
      version: 1,
    });
  });

  it('S4B_FE_AC10: dropping on its own gaps or pressing Escape sends nothing', async () => {
    const api = abcApi();
    const { user } = await openBoard('/n/f/board', api, 'ta');

    fireEvent.dragStart(card('ta'));
    fireEvent.drop(gap('to_do', 0));
    fireEvent.dragStart(card('ta'));
    fireEvent.drop(gap('to_do', 1));
    fireEvent.dragStart(card('tb'));
    expect(screen.getByTestId('gap-to_do-0')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('gap-to_do-0')).not.toBeInTheDocument();

    expect(mutations(api)).toHaveLength(0);
    expect(columnTitles('to_do')).toEqual(['A', 'B', 'C']);
  });
});

// --- S4B_FE_AC11 and AC12: Alt + arrows ---------------------------------------------------------

describe('S4B_FE_AC11: Alt+←/→ change the status', () => {
  it('S4B_FE_AC11: Alt+→ sends PATCH with the next status, moves the card and keeps focus', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');

    card('t2').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    expect(columnTitles('done')).toEqual(['Deep task', 'Review PR']);
    expect(card('t2')).toHaveFocus();
    await waitFor(() => expect(patchCalls(api, 't2')).toHaveLength(1));
    expect(patchCalls(api, 't2')[0].body).toEqual({
      props: { status: 'done', checklist: [] },
      version: 1,
    });

    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(columnTitles('in_progress')).toEqual(['Review PR']);
    await waitFor(() => expect(patchCalls(api, 't2')).toHaveLength(2));
    expect(patchCalls(api, 't2')[1].body).toMatchObject({ props: { status: 'in_progress' } });
    expect(moveCalls(api, 't2')).toHaveLength(0);
  });

  it('S4B_FE_AC11: Alt+→ on Done and Alt+← on To do send nothing', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');

    card('t3').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    card('t1').focus();
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');

    expect(mutations(api)).toHaveLength(0);
    expect(columnTitles('done')).toEqual(['Deep task']);
    expect(columnTitles('to_do')).toEqual(['Write spec']);
  });
});

describe('S4B_FE_AC12: Alt+↑/↓ reorder', () => {
  it('S4B_FE_AC12: Alt+↑ on B sends before_id A, Alt+↓ sends after_id C, both keep the status', async () => {
    const api = abcApi();
    const { user } = await openBoard('/n/f/board', api, 'ta');

    card('tb').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(columnTitles('to_do')).toEqual(['B', 'A', 'C']);
    expect(card('tb')).toHaveFocus();
    await waitFor(() => expect(moveCalls(api, 'tb')).toHaveLength(1));
    expect(moveCalls(api, 'tb')[0].body).toEqual({
      status: 'to_do',
      place: { before_id: 'ta' },
      version: 1,
    });

    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(columnTitles('to_do')).toEqual(['A', 'C', 'B']);
    await waitFor(() => expect(moveCalls(api, 'tb')).toHaveLength(3));
    expect(moveCalls(api, 'tb')[2].body).toMatchObject({ place: { after_id: 'tc' } });
  });

  it('S4B_FE_AC12: Alt+↑ on the first card and Alt+↓ on the last send nothing', async () => {
    const api = abcApi();
    const { user } = await openBoard('/n/f/board', api, 'ta');

    card('ta').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    card('tc').focus();
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

    expect(mutations(api)).toHaveLength(0);
    expect(columnTitles('to_do')).toEqual(['A', 'B', 'C']);
  });
});

// --- S4B_FE_AC13: failures ---------------------------------------------------------------------

describe('S4B_FE_AC13: move failure rolls back', () => {
  it('S4B_FE_AC13: a 409 on board-move puts the card back, shows a notice and reads the board again', async () => {
    const api = boardApi();
    await openBoard('/n/f/board', api, 't1');
    api.failNext((call) => call.url.endsWith('/board-move'), 409);

    fireEvent.dragStart(card('t1'));
    fireEvent.drop(gap('in_progress', 1));
    expect(columnTitles('in_progress')).toEqual(['Review PR', 'Write spec']);

    await screen.findByRole('alert');
    await waitFor(() => expect(boardCalls(api, 'f')).toHaveLength(2));
    await waitFor(() => expect(columnTitles('to_do')).toEqual(['Write spec']));
    expect(columnTitles('in_progress')).toEqual(['Review PR']);
  });

  it('S4B_FE_AC13: a 500 on the status PATCH puts the card back', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    api.failNext((call) => call.method === 'PATCH', 500);

    card('t2').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    await screen.findByRole('alert');
    await waitFor(() => expect(columnTitles('in_progress')).toEqual(['Review PR']));
    expect(boardCalls(api, 'f')).toHaveLength(2);
  });
});

// --- S4B_FE_AC14 to AC16: creating and deleting --------------------------------------------------

describe('S4B_FE_AC14: add task', () => {
  it('S4B_FE_AC14: "Add task" creates a child of the focus after the last To do card and chains', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    expect(within(column('in_progress')).queryByRole('button', { name: '+ Add task' })).toBeNull();
    expect(within(column('done')).queryByRole('button', { name: '+ Add task' })).toBeNull();

    await user.click(within(column('to_do')).getByRole('button', { name: '+ Add task' }));
    await user.type(newTaskInput(), 'Milk{Enter}');

    expect(columnTitles('to_do')).toEqual(['Write spec', 'Milk']);
    const creates = () => api.callsTo('POST', '/api/nodes/f/children');
    await waitFor(() => expect(creates()).toHaveLength(1));
    expect(creates()[0].body).toEqual({
      title: 'Milk',
      kind: 'task',
      board_place: { after_id: 't1' },
    });
    expect(newTaskInput()).toHaveFocus();
    expect(queryPanel()).not.toBeInTheDocument();

    await user.type(newTaskInput(), 'Eggs{Enter}');
    await waitFor(() => expect(creates()).toHaveLength(2));
    expect(creates()[1].body).toEqual({
      title: 'Eggs',
      kind: 'task',
      board_place: { after_id: 'new-1' },
    });
    expect(columnTitles('to_do')).toEqual(['Write spec', 'Milk', 'Eggs']);

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
    expect(addTaskButton()).toBeInTheDocument();
    expect(creates()).toHaveLength(2);
  });

  it('S4B_FE_AC14: with To do empty the create carries no board_place; an empty Enter ends the chain', async () => {
    const api = boardApi();
    const { user } = renderApp('/n/b/board', api);
    await screen.findByText('No tasks under Idea B');

    await user.click(addTaskButton());
    await user.type(newTaskInput(), '   {Enter}');
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
    expect(api.callsTo('POST', '/api/nodes/b/children')).toHaveLength(0);

    await user.click(addTaskButton());
    await user.type(newTaskInput(), 'First{Enter}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/b/children')).toHaveLength(1));
    expect(api.callsTo('POST', '/api/nodes/b/children')[0].body).toEqual({
      title: 'First',
      kind: 'task',
    });
    expect(screen.queryByText('No tasks under Idea B')).not.toBeInTheDocument();
    expect(columnTitles('to_do')).toEqual(['First']);
  });
});

describe('S4B_FE_AC15: creation failure', () => {
  it('S4B_FE_AC15: the pending card disappears and a notice shows', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    api.failNext((call) => call.url.endsWith('/children'), 500);

    await user.click(addTaskButton());
    await user.type(newTaskInput(), 'Milk{Enter}');

    await screen.findByRole('alert');
    await waitFor(() => expect(columnTitles('to_do')).toEqual(['Write spec']));
  });
});

describe('S4B_FE_AC16: delete', () => {
  it('S4B_FE_AC16: 🗑 sends DELETE at once with no dialog; a failure brings the card back', async () => {
    const api = boardApi();
    await openBoard('/n/f/board', api, 't1');

    fireEvent.click(within(card('t1')).getByRole('button', { name: 'Delete Write spec' }));
    expect(queryCard('t1')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/t1')).toHaveLength(1));

    api.failNext((call) => call.method === 'DELETE', 500);
    fireEvent.click(within(card('t2')).getByRole('button', { name: 'Delete Review PR' }));
    expect(queryCard('t2')).not.toBeInTheDocument();
    await screen.findByRole('alert');
    await waitFor(() => expect(card('t2')).toBeInTheDocument());
  });

  it('S4B_FE_AC16: Delete on a focused card deletes it and closes its panel', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    fireEvent.click(card('t3'));
    await waitFor(() => expect(panel()).toBeInTheDocument());

    card('t3').focus();
    await user.keyboard('{Delete}');

    expect(queryCard('t3')).not.toBeInTheDocument();
    expect(queryPanel()).not.toBeInTheDocument();
    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/t3')).toHaveLength(1));
  });
});

// --- S4B_FE_AC17 to AC19: keyboard, sync -----------------------------------------------------------

describe('S4B_FE_AC17: map shortcuts are off on the board', () => {
  it('S4B_FE_AC17: Tab, Shift+Tab, Space, Backspace and the arrows change nothing', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');

    card('t1').focus();
    await user.keyboard('{Tab}');
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard(' ');
    await user.keyboard('{Backspace}');
    await user.keyboard('{ArrowRight}{ArrowDown}{ArrowLeft}{ArrowUp}');

    expect(mutations(api)).toHaveLength(0);
    expect(currentPath()).toBe('/n/f/board');
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New idea title')).not.toBeInTheDocument();
  });

  it('S4B_FE_AC17: Alt+arrows and Delete inside a panel field do not act on cards', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');
    fireEvent.click(card('t2'));
    const title = await within(panel()).findByLabelText('Title');

    title.focus();
    await user.keyboard('{Alt>}{ArrowRight}{ArrowUp}{/Alt}');
    await user.keyboard('{Delete}');

    expect(mutations(api)).toHaveLength(0);
    expect(columnTitles('in_progress')).toEqual(['Review PR']);
  });
});

describe('S4B_FE_AC18 and AC19: freshness between views', () => {
  it('S4B_FE_AC18: after a board change the map window is read again and shows the new status', async () => {
    const api = boardApi();
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t2');
    expect(screen.getByTestId('node-t2')).toHaveAttribute('data-status', 'in_progress');
    const views = () => api.callsTo('GET', '/api/nodes/f/view?depth=3');
    expect(views()).toHaveLength(1);

    await user.click(screen.getByRole('link', { name: 'Board' }));
    await screen.findByTestId('card-t2');
    card('t2').focus();
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    await waitFor(() => expect(patchCalls(api, 't2')).toHaveLength(1));

    await user.click(screen.getByRole('link', { name: 'Map' }));
    await screen.findByTestId('node-t2');
    await waitFor(() => expect(views()).toHaveLength(2));
    await waitFor(() =>
      expect(screen.getByTestId('node-t2')).toHaveAttribute('data-status', 'done'),
    );
  });

  it('S4B_FE_AC19: board → map → board reads the board twice', async () => {
    const api = boardApi();
    const { user } = await openBoard('/n/f/board', api, 't1');

    await user.click(screen.getByRole('link', { name: 'Map' }));
    await screen.findByTestId('node-f');
    await user.click(screen.getByRole('link', { name: 'Board' }));
    await screen.findByTestId('card-t1');

    expect(boardCalls(api, 'f')).toHaveLength(2);
  });
});
