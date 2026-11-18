import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChecklistItem } from './api/client';
import { FakeApi, type FakeNode } from './test/fakeApi';
import { nodeElement, renderApp, sampleTree } from './test/renderApp';

// Slice 4A: a task's status and checklist, edited in the details panel.

const panel = () => screen.getByRole('complementary', { name: 'Task details' });
const queryTaskPanel = () => screen.queryByRole('complementary', { name: 'Task details' });
const ideaPanel = () => screen.getByRole('complementary', { name: 'Idea details' });
const statusRadio = (label: string) => within(panel()).getByRole('radio', { name: label });
const checklist = () => within(panel()).getByRole('list', { name: 'Checklist' });
const newItemField = () => within(panel()).getByLabelText('New item');
const itemCheckbox = (text: string) => within(checklist()).getByRole('checkbox', { name: text });
const itemText = (text: string) => within(checklist()).getByLabelText(`Edit ${text}`);
const removeItem = (text: string) => within(checklist()).getByLabelText(`Remove ${text}`);
const map = () => screen.getByRole('main');

const patchCalls = (api: FakeApi, id = 't') => api.callsTo('PATCH', `/api/nodes/${id}`);
const lastProps = (api: FakeApi, id = 't') =>
  (patchCalls(api, id).at(-1)!.body as { props: { status: string; checklist: ChecklistItem[] } })
    .props;

const item = (id: string, text: string, done = false): ChecklistItem => ({ id, text, done });

function taskApi(props?: Record<string, unknown>): FakeApi {
  const nodes: FakeNode[] = [
    ...sampleTree(),
    { id: 't', parent_id: 'f', title: 'Call the vet', sort_key: 'Z', kind: 'task', props },
  ];
  return new FakeApi(nodes);
}

const selectNode = async (id: string) => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
};

/** Selects the task and waits for its detail to arrive, which enables the task controls. */
const openTask = async () => {
  await selectNode('t');
  await waitFor(() => expect(statusRadio('To do')).toBeInTheDocument());
};

// --- S4A_FE_AC12: the task panel --------------------------------------------------------------

describe('S4A_FE_AC12: the panel adapts to the kind', () => {
  it('S4A_FE_AC12: a task shows title, status, description and checklist, in that order', async () => {
    renderApp('/n/f', taskApi({ status: 'in_progress', checklist: [item('1', 'Find the number')] }));
    await screen.findByTestId('node-t');

    await openTask();

    expect(within(panel()).getByLabelText('Title')).toHaveValue('Call the vet');
    expect(statusRadio('In progress')).toBeChecked();
    expect(statusRadio('To do')).not.toBeChecked();
    expect(within(panel()).getByLabelText('Description')).toBeInTheDocument();
    expect(itemCheckbox('Find the number')).toBeInTheDocument();

    const labels = within(panel())
      .getAllByText(/^(Title|Status|Description|New item)$/)
      .map((node) => node.textContent);
    expect(labels).toEqual(['Title', 'Status', 'Description', 'New item']);
  });

  it('S4A_FE_AC12: an idea shows no status and no checklist, and the panel follows the selection', async () => {
    renderApp('/n/f', taskApi());
    await screen.findByTestId('node-t');

    await openTask();
    expect(queryTaskPanel()).toBeInTheDocument();

    await selectNode('a');

    await waitFor(() => expect(ideaPanel()).toBeInTheDocument());
    expect(queryTaskPanel()).not.toBeInTheDocument();
    expect(within(ideaPanel()).queryByRole('radio', { name: 'Done' })).not.toBeInTheDocument();
    expect(within(ideaPanel()).queryByRole('list', { name: 'Checklist' })).not.toBeInTheDocument();
  });
});

// --- S4A_FE_AC13 and AC14: status -------------------------------------------------------------

describe('S4A_FE_AC13: changing the status', () => {
  it('S4A_FE_AC13: choosing a status patches the whole props and repaints the stripe', async () => {
    const api = taskApi({ status: 'to_do', checklist: [item('1', 'Find the number', true)] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(statusRadio('Done'));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    expect(patchCalls(api)[0].body).toEqual({
      version: 1,
      props: { status: 'done', checklist: [item('1', 'Find the number', true)] },
    });
    expect(nodeElement('t').dataset.status).toBe('done');
    expect(within(nodeElement('t')).getByLabelText('Status: Done')).toBeInTheDocument();
    await waitFor(() => expect(statusRadio('Done')).toBeChecked());
  });

  it('S4A_FE_AC13: choosing the status that is already set sends nothing', async () => {
    const api = taskApi({ status: 'done' });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(statusRadio('Done'));

    expect(patchCalls(api)).toHaveLength(0);
  });

  it('S4A_FE_AC14: a failed status save rolls the radio and the stripe back', async () => {
    const api = taskApi({ status: 'to_do' });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();
    api.failNext((call) => call.method === 'PATCH', 409);

    await user.click(statusRadio('In progress'));

    await screen.findByRole('alert');
    await waitFor(() => expect(nodeElement('t').dataset.status).toBe('to_do'));
    await waitFor(() => expect(statusRadio('To do')).toBeChecked());
    expect(api.nodes.get('t')!.props).toEqual({ status: 'to_do', checklist: [] });
  });
});

// --- S4A_FE_AC15 to AC18: the checklist -------------------------------------------------------

describe('S4A_FE_AC15: adding items', () => {
  it('S4A_FE_AC15: Enter in "New item" appends a trimmed item and clears the field', async () => {
    const api = taskApi({ checklist: [item('1', 'First')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(newItemField());
    await user.type(newItemField(), '  Second  {Enter}');

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    const sent = lastProps(api).checklist;
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({ text: 'Second', done: false });
    expect(sent[1].id).toEqual(expect.any(String));
    expect(sent[1].id.length).toBeGreaterThan(0);
    expect(newItemField()).toHaveValue('');
    expect(newItemField()).toHaveFocus();
  });

  it('S4A_FE_AC15: whitespace-only text sends nothing, and the counter tracks the list', async () => {
    const api = taskApi({ checklist: [item('1', 'First')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();
    expect(within(panel()).getByText('1 / 30')).toBeInTheDocument();

    await user.type(newItemField(), '   {Enter}');

    expect(patchCalls(api)).toHaveLength(0);
    expect(newItemField()).toHaveValue('');
  });

  it('S4A_FE_AC15: at 30 items the field is disabled', async () => {
    const full = Array.from({ length: 30 }, (_, n) => item(`i${n}`, `Item ${n}`));
    renderApp('/n/f', taskApi({ checklist: full }));
    await screen.findByTestId('node-t');
    await openTask();

    expect(newItemField()).toBeDisabled();
    expect(within(panel()).getByText('30 / 30')).toBeInTheDocument();
  });
});

describe('S4A_FE_AC16: toggling items', () => {
  it('S4A_FE_AC16: the checkbox flips one item, leaves the others and the status alone', async () => {
    const api = taskApi({
      status: 'in_progress',
      checklist: [item('1', 'One'), item('2', 'Two', true)],
    });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(itemCheckbox('One'));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    expect(lastProps(api)).toEqual({
      status: 'in_progress',
      checklist: [item('1', 'One', true), item('2', 'Two', true)],
    });
    // The canvas progress follows at once.
    await waitFor(() =>
      expect(within(nodeElement('t')).getByLabelText('2 of 2 done')).toHaveTextContent('2/2'),
    );
    expect(nodeElement('t').dataset.status).toBe('in_progress');
  });
});

describe('S4A_FE_AC17: editing item text', () => {
  it('S4A_FE_AC17: a changed text is saved trimmed on blur, keeping the id', async () => {
    const api = taskApi({ checklist: [item('1', 'One'), item('2', 'Two')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    // The label keeps the saved text until the change is saved.
    await user.clear(itemText('One'));
    await user.type(itemText('One'), '  Renamed  ');
    fireEvent.blur(itemText('One'));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    expect(lastProps(api).checklist).toEqual([item('1', 'Renamed'), item('2', 'Two')]);
  });

  it('S4A_FE_AC17: an unchanged text sends nothing', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(itemText('One'));
    fireEvent.blur(itemText('One'));

    expect(patchCalls(api)).toHaveLength(0);
  });

  it('S4A_FE_AC17: empty text is refused, restored and reported', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.clear(itemText('One'));
    fireEvent.blur(itemText('One'));

    expect(patchCalls(api)).toHaveLength(0);
    expect(within(panel()).getByRole('alert')).toHaveTextContent("Item text can't be empty");
    expect(itemText('One')).toHaveValue('One');
  });

  it('S4A_FE_AC17: Escape restores the text and gives the keyboard back to the map', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(itemText('One'));
    await user.type(itemText('One'), ' changed');
    await user.keyboard('{Escape}');

    expect(patchCalls(api)).toHaveLength(0);
    expect(itemText('One')).toHaveValue('One');
    await waitFor(() => expect(map()).toHaveFocus());
  });

  it('S4A_FE_AC17: the field accepts at most 100 characters', async () => {
    renderApp('/n/f', taskApi({ checklist: [item('1', 'One')] }));
    await screen.findByTestId('node-t');
    await openTask();

    expect(itemText('One')).toHaveAttribute('maxlength', '100');
    expect(newItemField()).toHaveAttribute('maxlength', '100');
  });
});

describe('S4A_FE_AC18: removing items', () => {
  it('S4A_FE_AC18: the remove button drops the item and the progress follows', async () => {
    const api = taskApi({ checklist: [item('1', 'One', true), item('2', 'Two')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(removeItem('Two'));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    expect(lastProps(api).checklist).toEqual([item('1', 'One', true)]);
    await waitFor(() =>
      expect(within(nodeElement('t')).getByLabelText('1 of 1 done')).toBeInTheDocument(),
    );
    expect(within(checklist()).queryByRole('checkbox', { name: 'Two' })).not.toBeInTheDocument();
  });
});

// --- S4A_FE_AC19: reordering ------------------------------------------------------------------

describe('S4A_FE_AC19: reordering by drag', () => {
  const row = (text: string) => itemCheckbox(text).closest('li')!;
  const gap = (index: number) => screen.getByTestId(`checklist-gap-${index}`);

  const abc = () => [item('1', 'A'), item('2', 'B'), item('3', 'C')];

  it('S4A_FE_AC19: dropping A after C sends B, C, A and redraws at once', async () => {
    const api = taskApi({ checklist: abc() });
    renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    fireEvent.dragStart(row('A'));
    fireEvent.dragOver(gap(3));
    expect(gap(3)).toHaveClass('is-hovered');
    fireEvent.drop(gap(3));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(1));
    expect(lastProps(api).checklist).toEqual([item('2', 'B'), item('3', 'C'), item('1', 'A')]);
    expect(
      within(checklist())
        .getAllByRole('checkbox')
        .map((box) => box.getAttribute('aria-label')),
    ).toEqual(['B', 'C', 'A']);
  });

  it('S4A_FE_AC19: dropping an item where it already is sends nothing', async () => {
    const api = taskApi({ checklist: abc() });
    renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    fireEvent.dragStart(row('A'));
    fireEvent.drop(gap(0));
    fireEvent.dragStart(row('A'));
    fireEvent.drop(gap(1));

    expect(patchCalls(api)).toHaveLength(0);
  });

  it('S4A_FE_AC19: Escape cancels the drag and no canvas node becomes a drop target', async () => {
    const api = taskApi({ checklist: abc() });
    renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    fireEvent.dragStart(row('A'));
    expect(gap(3)).toBeInTheDocument();
    expect(nodeElement('a')).not.toHaveClass('is-drop-target');
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('checklist-gap-3')).not.toBeInTheDocument());
    expect(patchCalls(api)).toHaveLength(0);
  });
});

// --- S4A_FE_AC20 to AC22 ----------------------------------------------------------------------

describe('S4A_FE_AC20: a failed checklist save rolls back', () => {
  it('S4A_FE_AC20: the list, the counter and the canvas progress return to the saved checklist', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();
    api.failNext((call) => call.method === 'PATCH', 500);

    await user.type(newItemField(), 'Second{Enter}');

    await screen.findByRole('alert');
    await waitFor(() => expect(within(panel()).getByText('1 / 30')).toBeInTheDocument());
    expect(within(checklist()).queryByRole('checkbox', { name: 'Second' })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(within(nodeElement('t')).getByLabelText('0 of 1 done')).toBeInTheDocument(),
    );
  });
});

describe('S4A_FE_AC21: saves are serialized', () => {
  it('S4A_FE_AC21: a checklist change waits for the title save and uses the version it returned', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    const title = within(panel()).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Renamed');
    fireEvent.blur(title);
    await user.click(itemCheckbox('One'));

    await waitFor(() => expect(patchCalls(api)).toHaveLength(2));
    expect(patchCalls(api)[0].body).toMatchObject({ title: 'Renamed', version: 1 });
    // The second save carries the version the first one answered with.
    expect(patchCalls(api)[1].body).toMatchObject({ version: 2 });
    expect(lastProps(api).checklist).toEqual([item('1', 'One', true)]);
  });
});

describe('S4A_FE_AC22: map shortcuts are off in the task controls', () => {
  it('S4A_FE_AC22: keys in the new item field and the status radios never act on the map', async () => {
    const api = taskApi({ checklist: [item('1', 'One')] });
    const { user } = renderApp('/n/f', api);
    await screen.findByTestId('node-t');
    await openTask();

    await user.click(newItemField());
    await user.keyboard('{Delete}{Backspace}');
    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(api.callsTo('POST', /children/)).toHaveLength(0);
    expect(screen.queryByLabelText('New task title')).not.toBeInTheDocument();

    const toDo = statusRadio('To do');
    toDo.focus();
    await user.keyboard('{Delete}');
    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(nodeElement('t')).toBeInTheDocument();
  });
});
