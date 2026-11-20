import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FakeApi, type FakeNode } from './test/fakeApi';
import { currentPath, nodeElement, queryNode, renderApp, sampleTree } from './test/renderApp';

const taskTitleInput = () => screen.getByLabelText('New task title');
const queryTaskTitleInput = () => screen.queryByLabelText('New task title');
const queryIdeaTitleInput = () => screen.queryByLabelText('New idea title');
const addButton = (title: string) => screen.getByLabelText(`Add inside ${title}`);
const queryAddButton = (title: string) => screen.queryByLabelText(`Add inside ${title}`);
const menuItem = (label: string) =>
  within(screen.getByRole('menu', { hidden: true })).getByLabelText(label);
/** Amended in slice 5 (decision D8): the task button became the "Task" entry of the kind menu. */
const addTaskWith = (title: string) => {
  fireEvent.click(addButton(title));
  fireEvent.click(menuItem('Task'));
};
const createCalls = (api: FakeApi, parentId: string) =>
  api.callsTo('POST', `/api/nodes/${parentId}/children`);

/** The sample map plus a task "Call the vet" under the focus, after "Idea B". */
function withTask(props?: Record<string, unknown>): FakeNode[] {
  return [
    ...sampleTree(),
    { id: 't', parent_id: 'f', title: 'Call the vet', sort_key: 'Z', kind: 'task', props },
  ];
}

const taskApi = (props?: Record<string, unknown>) => new FakeApi(withTask(props));

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

// --- S4A_FE_AC1: the task button -------------------------------------------------------------

describe('S4A_FE_AC1: the kind menu offers tasks', () => {
  it('S4A_FE_AC1: every idea has a "+" whose menu offers "Task", and a task has no "+"', async () => {
    renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');

    expect(addButton('Focus')).toBeInTheDocument();
    fireEvent.click(addButton('Idea A'));
    expect(menuItem('Task')).toBeInTheDocument();

    expect(queryAddButton('Call the vet')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a task inside Idea A')).not.toBeInTheDocument();
  });

  it('S4A_FE_AC1: the node being created has no "+"', async () => {
    const { user } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-f');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}2');

    expect(taskTitleInput()).toBeInTheDocument();
    expect(queryAddButton('')).not.toBeInTheDocument();
  });
});

// --- S4A_FE_AC2 and AC3: creating tasks -------------------------------------------------------

describe('S4A_FE_AC2: creating a task inline', () => {
  it('S4A_FE_AC2: Shift+Tab then 2 opens "New task title" and posts kind task without props', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-f');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}2');
    expect(taskTitleInput()).toHaveFocus();
    expect(queryIdeaTitleInput()).not.toBeInTheDocument();

    await user.type(taskTitleInput(), 'Book a slot{Enter}');

    await waitFor(() => expect(createCalls(api, 'a')).toHaveLength(1));
    expect(createCalls(api, 'a')[0].body).toEqual({ title: 'Book a slot', kind: 'task' });
  });

  it('S4A_FE_AC2: "Task" in the menu of + creates the task and it is drawn as one', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-f');

    addTaskWith('Idea B');
    await user.type(taskTitleInput(), 'Book a slot{Enter}');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));
    const created = await screen.findByTestId('node-new-1');
    expect(created).toHaveClass('is-task');
    expect(created.dataset.status).toBe('to_do');
    expect(within(created).getByLabelText('Status: To do')).toBeInTheDocument();
    // A new task has an empty checklist, so it shows no progress.
    expect(within(created).queryByLabelText(/done$/)).not.toBeInTheDocument();
  });

  it('S4A_FE_AC3: Enter chains another task, and Escape ends the chain', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-f');
    await selectNode('b');

    await user.keyboard('{Shift>}{Tab}{/Shift}2');
    await user.type(taskTitleInput(), 'First{Enter}');
    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(1));

    // The sibling that Enter opens is a task too, never an idea.
    expect(taskTitleInput()).toBeInTheDocument();
    expect(queryIdeaTitleInput()).not.toBeInTheDocument();
    await user.type(taskTitleInput(), 'Second{Enter}');

    await waitFor(() => expect(createCalls(api, 'b')).toHaveLength(2));
    expect(createCalls(api, 'b').map((call) => call.body)).toEqual([
      { title: 'First', kind: 'task' },
      { title: 'Second', kind: 'task', after_sort_key: expect.any(String) },
    ]);

    await user.keyboard('{Escape}');
    expect(queryTaskTitleInput()).not.toBeInTheDocument();
    expect(createCalls(api, 'b')).toHaveLength(2);
  });
});

describe('S4A_FE_AC4: creating a task under a border or collapsed idea', () => {
  it('S4A_FE_AC4: on a border idea the focus moves one level toward it first', async () => {
    const api = new FakeApi(withTask());
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-a');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}2');

    await waitFor(() => expect(currentPath()).toBe('/n/a'));
    await waitFor(() => expect(taskTitleInput()).toBeInTheDocument());
    await user.type(taskTitleInput(), 'Under A{Enter}');
    await waitFor(() => expect(createCalls(api, 'a')).toHaveLength(1));
    expect(createCalls(api, 'a')[0].body).toMatchObject({ kind: 'task' });
  });

  it('S4A_FE_AC4: a collapsed idea is expanded first', async () => {
    const api = new FakeApi(withTask());
    api.nodes.set('a', { ...api.nodes.get('a')!, collapsed: true });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-a');
    await selectNode('a');

    await user.keyboard('{Shift>}{Tab}{/Shift}2');

    await waitFor(() => expect(api.nodes.get('a')!.collapsed).toBe(false));
    await waitFor(() => expect(taskTitleInput()).toBeInTheDocument());
    await user.type(taskTitleInput(), 'Under A{Enter}');
    await waitFor(() => expect(createCalls(api, 'a')).toHaveLength(1));
  });
});

describe('S4A_FE_AC5: nothing is created inside a task', () => {
  it('S4A_FE_AC5: Tab, Shift+Tab and Space on a task do nothing', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');
    await selectNode('t');

    await user.keyboard('{Tab}');
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await user.keyboard(' ');

    expect(queryTaskTitleInput()).not.toBeInTheDocument();
    expect(queryIdeaTitleInput()).not.toBeInTheDocument();
    // Amended in slice 5: Shift+Tab opens no kind menu on a leaf.
    expect(screen.queryByRole('menu', { hidden: true })).not.toBeInTheDocument();
    expect(createCalls(api, 't')).toHaveLength(0);
    expect(api.callsTo('PATCH', '/api/nodes/t')).toHaveLength(0);
  });
});

// --- S4A_FE_AC6 to AC9: how a task is drawn ---------------------------------------------------

describe('S4A_FE_AC6: the stripe follows the status', () => {
  it.each([
    ['to_do', 'Status: To do'],
    ['in_progress', 'Status: In progress'],
    ['done', 'Status: Done'],
  ])('S4A_FE_AC6: status %s is drawn as a stripe labelled "%s"', async (status, label) => {
    renderApp('/n/f', taskApi({ status }));
    const task = await screen.findByTestId('node-t');

    expect(task.dataset.status).toBe(status);
    const stripe = screen.getByLabelText(label);
    expect(stripe).toHaveClass(`is-${status}`);
    // The word itself is never drawn on the canvas (decision D8).
    expect(task).toHaveTextContent('Call the vet');
    expect(task.textContent).not.toContain('progress');
    expect(task.textContent).not.toContain('Done');
  });
});

describe('S4A_FE_AC7: checklist progress', () => {
  it('S4A_FE_AC7: a task with items shows done/total, and an empty checklist shows nothing', async () => {
    renderApp(
      '/n/f',
      taskApi({
        checklist: [
          { id: '1', text: 'One', done: true },
          { id: '2', text: 'Two', done: false },
          { id: '3', text: 'Three', done: true },
        ],
      }),
    );
    await screen.findByTestId('node-t');

    expect(screen.getByLabelText('2 of 3 done')).toHaveTextContent('2/3');

    // "Idea A" is an idea: it never shows progress.
    expect(nodeElement('a').textContent).not.toContain('/');
  });

  it('S4A_FE_AC7: an empty checklist draws no progress', async () => {
    renderApp('/n/f', taskApi({ checklist: [] }));
    await screen.findByTestId('node-t');

    expect(screen.queryByLabelText(/done$/)).not.toBeInTheDocument();
  });
});

describe('S4A_FE_AC8: a task has no children', () => {
  it('S4A_FE_AC8: a task shows no "+k" and ArrowRight keeps the selection on it', async () => {
    const api = new FakeApi(withTask());
    api.depth = 1;
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await selectNode('t');

    // "Idea A" is on the border and shows +k; the task never does.
    expect(screen.getByLabelText('2 hidden children')).toBeInTheDocument();
    expect(nodeElement('t').textContent).not.toContain('+');

    await user.keyboard('{ArrowRight}');
    expect(nodeElement('t')).toHaveClass('is-selected');
  });
});

describe('S4A_FE_AC9: a task cannot be focused', () => {
  it('S4A_FE_AC9: double click and Enter on a task navigate nowhere', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');
    await selectNode('t');

    fireEvent.doubleClick(nodeElement('t'));
    expect(currentPath()).toBe('/n/f');

    await user.keyboard('{Enter}');
    expect(currentPath()).toBe('/n/f');
    expect(api.callsTo('GET', '/api/nodes/t/view?depth=3')).toHaveLength(0);
  });

  it('S4A_FE_AC9: double click on an idea still focuses it', async () => {
    renderApp('/n/f', taskApi());
    await screen.findByTestId('node-a');

    fireEvent.doubleClick(nodeElement('a'));

    await waitFor(() => expect(currentPath()).toBe('/n/a'));
  });
});

// --- S4A_FE_AC10: moving ----------------------------------------------------------------------

describe('S4A_FE_AC10: drops into a task are refused', () => {
  it('S4A_FE_AC10: dragging an idea over a task shows the refused state and sends nothing', async () => {
    const { api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');

    fireEvent.dragStart(nodeElement('a'));
    fireEvent.dragOver(nodeElement('t'));
    expect(nodeElement('t')).toHaveClass('is-drop-refused');
    expect(nodeElement('t')).not.toHaveClass('is-drop-target');

    fireEvent.drop(nodeElement('t'));

    expect(api.callsTo('POST', /\/move$/)).toHaveLength(0);
    expect(api.nodes.get('a')!.parent_id).toBe('f');
  });

  it('S4A_FE_AC10: Alt+Right onto a task above sends nothing', async () => {
    // "Call the vet" (a task) sits above the idea that tries to move into it.
    const api = new FakeApi([
      ...sampleTree(),
      { id: 't', parent_id: 'f', title: 'Call the vet', sort_key: 'J', kind: 'task' },
    ]);
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-b');
    await selectNode('b');

    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');

    expect(api.callsTo('POST', /\/move$/)).toHaveLength(0);
    expect(api.nodes.get('b')!.parent_id).toBe('f');
  });

  it('S4A_FE_AC10: a task itself moves like an idea', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');

    // Dropped on an idea it becomes its last child.
    fireEvent.dragStart(nodeElement('t'));
    fireEvent.dragOver(nodeElement('a'));
    expect(nodeElement('a')).toHaveClass('is-drop-target');
    fireEvent.drop(nodeElement('a'));

    await waitFor(() => expect(api.nodes.get('t')!.parent_id).toBe('a'));

    // And the keyboard reorders it among its new siblings.
    await selectNode('t');
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() => expect(api.callsTo('POST', '/api/nodes/t/move')).toHaveLength(2));
  });
});

// --- S4A_FE_AC11: deleting --------------------------------------------------------------------

describe('S4A_FE_AC11: deleting a task never asks', () => {
  it('S4A_FE_AC11: Delete on a task sends DELETE without the dialog', async () => {
    const { user, api } = renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');
    await selectNode('t');

    await user.keyboard('{Delete}');

    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/t')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(queryNode('t')).not.toBeInTheDocument());
  });
});
