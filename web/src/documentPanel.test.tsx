import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LINK_ERROR, tooltipFor } from './components/document/RichDocumentEditor';
import { AUTOSAVE_DELAY_MS, MODE_STORAGE_KEY } from './components/document/DocumentEditor';
import { FakeApi, type FakeNode } from './test/fakeApi';
import { nodeElement, renderApp, sampleTree } from './test/renderApp';

// Slice 5: a document's body, edited in the details panel.

const NOTES = '# Agenda\n\n- budget\n- hiring\n';

const panel = () => screen.getByRole('complementary', { name: 'Document details' });
const queryPanel = () => screen.queryByRole('complementary', { name: 'Document details' });
const editorField = () => within(panel()).getByRole('textbox', { name: 'Document' });
const modeButton = (name: 'Plain text' | 'Rich text') =>
  within(panel()).getByRole('button', { name });
const expandButton = () =>
  within(panel()).getByRole('button', { name: /^(Expand|Collapse) editor$/ });
const map = () => screen.getByRole('main');

const contentPatches = (api: FakeApi, id = 'd') =>
  api
    .callsTo('PATCH', `/api/nodes/${id}`)
    .filter((call) => (call.body as Record<string, unknown>).content !== undefined);
const lastContent = (api: FakeApi) =>
  (contentPatches(api).at(-1)!.body as { content: string }).content;

function documentApi(extra: FakeNode[] = []): FakeApi {
  return new FakeApi([
    ...sampleTree(),
    {
      id: 'd',
      parent_id: 'f',
      title: 'Meeting notes',
      sort_key: 'Z',
      kind: 'document',
      content: NOTES,
    },
    ...extra,
  ]);
}

const usePlainMode = () => localStorage.setItem(MODE_STORAGE_KEY, 'plain');

/** Selects the document and waits for its body to arrive in the editor. */
const openDocument = async (id = 'd') => {
  fireEvent.click(await screen.findByTestId(`node-${id}`));
  expect(nodeElement(id)).toHaveClass('is-selected');
  return within(panel()).findByRole('textbox', { name: 'Document' });
};

/** The position right after a text, so the cursor can be put there. */
const endOf = (editor: Editor, text: string) => {
  let end = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) end = pos + node.nodeSize;
  });
  return end;
};

/** The TipTap editor behind the rich mode's content element. */
const richEditor = (element: HTMLElement) => (element as HTMLElement & { editor: Editor }).editor;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- S5_FE_AC8: the document panel -------------------------------------------------------------

describe('S5_FE_AC8: the panel adapts to a document', () => {
  it('S5_FE_AC8: title, mode switch, expand and the body, with no description', async () => {
    usePlainMode();
    const api = documentApi();
    renderApp('/n/f', api);
    await openDocument();

    expect(panel()).toHaveClass('details-panel', 'is-document');
    expect(within(panel()).getByLabelText('Title')).toHaveValue('Meeting notes');
    expect(within(panel()).queryByLabelText('Description')).not.toBeInTheDocument();
    expect(within(panel()).getByRole('group', { name: 'Editor mode' })).toBeInTheDocument();
    expect(modeButton('Plain text')).toHaveAttribute('aria-pressed', 'true');
    expect(modeButton('Rich text')).toHaveAttribute('aria-pressed', 'false');
    expect(expandButton()).toHaveTextContent('Expand editor');
    expect(editorField()).toHaveValue(NOTES);
    expect(within(panel()).getByText(`${NOTES.length} / 100,000`)).toBeInTheDocument();
    // The body is read on demand, never with the window.
    expect(api.callsTo('GET', '/api/nodes/d')).toHaveLength(1);
  });

  it('S5_FE_AC8: an idea keeps its description and shows no document editor', async () => {
    renderApp('/n/f', documentApi());
    fireEvent.click(await screen.findByTestId('node-a'));

    const ideaPanel = await screen.findByRole('complementary', { name: 'Idea details' });
    await waitFor(() => expect(within(ideaPanel).getByLabelText('Description')).toBeEnabled());
    expect(within(ideaPanel).queryByRole('group', { name: 'Editor mode' })).not.toBeInTheDocument();
    expect(ideaPanel).not.toHaveClass('is-document');
  });

  it('S5_FE_AC8: a failed read offers a retry', async () => {
    const api = documentApi();
    api.failNext((call) => call.method === 'GET' && call.url === '/api/nodes/d', 500);
    renderApp('/n/f', api);
    fireEvent.click(await screen.findByTestId('node-d'));

    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Could not load the document.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await within(panel()).findByRole('textbox', { name: 'Document' })).toBeInTheDocument();
  });
});

// --- S5_FE_AC9 to AC12: saving -------------------------------------------------------------------

describe('S5_FE_AC9: plain text saves on blur', () => {
  it('S5_FE_AC9: a changed body is sent as typed, with the version, when the editor loses focus', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, '- travel{Enter}  indented');
    fireEvent.blur(field);

    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(contentPatches(api)[0].body).toEqual({
      content: `${NOTES}- travel\n  indented`,
      version: 1,
    });
    await waitFor(() => expect(within(panel()).getByRole('status')).toHaveTextContent('Saved'));
    expect(api.nodes.get('d')!.content).toBe(`${NOTES}- travel\n  indented`);
  });

  it('S5_FE_AC9: an unchanged body sends nothing, and the field takes at most 100,000 characters', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    fireEvent.blur(field);

    expect(field).toHaveAttribute('maxLength', '100000');
    expect(contentPatches(api)).toHaveLength(0);
  });
});

describe('S5_FE_AC10: autosave', () => {
  it('S5_FE_AC10: two idle seconds after the last change save once; typing restarts the wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api, { advanceTimers: vi.advanceTimersByTime });
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'abc');
    expect(within(panel()).getByRole('status')).toHaveTextContent('Unsaved changes');
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 300));
    expect(contentPatches(api)).toHaveLength(0);

    await user.type(field, 'd');
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 300));
    expect(contentPatches(api)).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(400));
    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toBe(`${NOTES}abcd`);
    expect(field).toHaveFocus();
  });

  it('S5_FE_AC10: text typed while a save is in flight is saved right after it', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'one');
    fireEvent.blur(field);
    await user.type(field, ' two');
    fireEvent.blur(field);

    await waitFor(() => expect(lastContent(api)).toBe(`${NOTES}one two`));
    expect(contentPatches(api).map((call) => (call.body as { version: number }).version)).toEqual([
      1, 2,
    ]);
  });
});

describe('S5_FE_AC11: leaving the panel saves', () => {
  it('S5_FE_AC11: selecting another node saves the unsaved body', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'last words');
    fireEvent.click(nodeElement('a'));

    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toBe(`${NOTES}last words`);
    expect(queryPanel()).not.toBeInTheDocument();
  });

  it('S5_FE_AC11: if that save fails, the map says so', async () => {
    usePlainMode();
    const api = documentApi();
    api.failNext((call) => call.method === 'PATCH' && call.url === '/api/nodes/d', 409);
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'lost');
    fireEvent.click(nodeElement('a'));

    expect(await screen.findByText(/your last changes to it were not saved/)).toBeInTheDocument();
  });

  it('S5_FE_AC11: deleting the document does not try to save it', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'gone');
    fireEvent.click(within(nodeElement('d')).getByLabelText('Delete Meeting notes'));

    await waitFor(() => expect(api.callsTo('DELETE', '/api/nodes/d')).toHaveLength(1));
    expect(contentPatches(api)).toHaveLength(0);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('S5_FE_AC12: closing the tab with unsaved text asks first', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('S5_FE_AC12: the browser is asked to confirm only while there is unsaved text', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    expect(unload()).toBe(false);
    await user.click(field);
    await user.type(field, 'x');
    expect(unload()).toBe(true);

    fireEvent.blur(field);
    await waitFor(() => expect(within(panel()).getByRole('status')).toHaveTextContent('Saved'));
    expect(unload()).toBe(false);
  });
});

// --- S5_FE_AC13 and AC14: failures --------------------------------------------------------------

describe('S5_FE_AC13: a conflict keeps the draft', () => {
  /** The document changed in another tab: version 2 with other text. */
  const changedElsewhere = (api: FakeApi) =>
    api.nodes.set('d', { ...api.nodes.get('d')!, content: 'Theirs', version: 2 });

  it('S5_FE_AC13: the draft stays and the choice is offered, without rolling back nor reloading', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();
    changedElsewhere(api);
    const viewsBefore = api.callsTo('GET', /\/view/).length;

    await user.click(field);
    await user.type(field, 'mine');
    fireEvent.blur(field);

    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('This document changed elsewhere. Your text is kept here.');
    expect(field).toHaveValue(`${NOTES}mine`);
    expect(api.callsTo('GET', /\/view/)).toHaveLength(viewsBefore);
    expect(screen.queryByText(/was undone/)).not.toBeInTheDocument();
    // While the choice is pending, more typing sends nothing.
    await user.type(field, '!');
    fireEvent.blur(field);
    expect(contentPatches(api)).toHaveLength(1);
  });

  it('S5_FE_AC13: Overwrite reads the node again and sends the draft with the new version', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();
    changedElsewhere(api);
    await user.click(field);
    await user.type(field, 'mine');
    fireEvent.blur(field);

    fireEvent.click(await within(panel()).findByRole('button', { name: 'Overwrite' }));

    await waitFor(() => expect(contentPatches(api)).toHaveLength(2));
    expect(contentPatches(api)[1].body).toEqual({ content: `${NOTES}mine`, version: 2 });
    await waitFor(() => expect(within(panel()).getByRole('status')).toHaveTextContent('Saved'));
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
    expect(api.nodes.get('d')!.content).toBe(`${NOTES}mine`);
  });

  it('S5_FE_AC13: Discard shows the other text and sends nothing', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();
    changedElsewhere(api);
    await user.click(field);
    await user.type(field, 'mine');
    fireEvent.blur(field);

    fireEvent.click(
      await within(panel()).findByRole('button', { name: 'Discard mine and reload' }),
    );

    await waitFor(() => expect(editorField()).toHaveValue('Theirs'));
    expect(contentPatches(api)).toHaveLength(1);
    expect(within(panel()).queryByRole('alert')).not.toBeInTheDocument();
    // The next edit goes out with the version that was read.
    await user.type(editorField(), '+');
    fireEvent.blur(editorField());
    await waitFor(() => expect(contentPatches(api)).toHaveLength(2));
    expect(contentPatches(api)[1].body).toEqual({ content: 'Theirs+', version: 2 });
  });
});

describe('S5_FE_AC14: other failures keep the draft and offer a retry', () => {
  it('S5_FE_AC14: a 500 shows the error; Retry sends the draft again', async () => {
    usePlainMode();
    const api = documentApi();
    api.failNext((call) => call.method === 'PATCH' && call.url === '/api/nodes/d', 500);
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'retry me');
    fireEvent.blur(field);

    const alert = await within(panel()).findByRole('alert');
    expect(alert).toHaveTextContent('Could not save the document.');
    expect(field).toHaveValue(`${NOTES}retry me`);
    expect(screen.queryByText(/was undone/)).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(contentPatches(api)).toHaveLength(2));
    await waitFor(() => expect(within(panel()).getByRole('status')).toHaveTextContent('Saved'));
    expect(api.nodes.get('d')!.content).toBe(`${NOTES}retry me`);
  });
});

// --- S5_FE_AC15 and AC16: modes and the rich editor ----------------------------------------------

describe('S5_FE_AC15: plain and rich modes', () => {
  it('S5_FE_AC15: rich is the default and renders the Markdown; plain shows the source', async () => {
    renderApp('/n/f', documentApi());
    const rich = await openDocument();

    expect(modeButton('Rich text')).toHaveAttribute('aria-pressed', 'true');
    expect(rich).toHaveAttribute('contenteditable', 'true');
    expect(within(rich).getByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument();
    expect(
      within(rich)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['budget', 'hiring']);
    expect(within(panel()).getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();

    fireEvent.click(modeButton('Plain text'));

    expect(editorField().tagName).toBe('TEXTAREA');
    expect(editorField()).toHaveValue(NOTES);
    expect(within(panel()).queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('S5_FE_AC15: the last mode is remembered by the browser, for every document', async () => {
    const api = documentApi([
      { id: 'd2', parent_id: 'f', title: 'Other notes', sort_key: 'ZZ', kind: 'document' },
    ]);
    renderApp('/n/f', api);
    await openDocument();

    fireEvent.click(modeButton('Plain text'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('plain');
    await openDocument('d2');
    expect(editorField().tagName).toBe('TEXTAREA');

    fireEvent.click(modeButton('Rich text'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('rich');
    expect(await within(panel()).findByRole('toolbar')).toBeInTheDocument();
  });

  it('S5_FE_AC15: switching modes keeps an unsaved draft', async () => {
    usePlainMode();
    const { user } = renderApp('/n/f', documentApi());
    const field = await openDocument();
    await user.click(field);
    await user.type(field, '## Next');

    fireEvent.click(modeButton('Rich text'));

    const rich = await within(panel()).findByRole('textbox', { name: 'Document' });
    expect(within(rich).getByRole('heading', { level: 2, name: 'Next' })).toBeInTheDocument();
  });
});

describe('S5_FE_AC16: the rich editor', () => {
  it('S5_FE_AC16: the toolbar offers every supported format', async () => {
    renderApp('/n/f', documentApi());
    await openDocument();

    const toolbar = within(panel()).getByRole('toolbar', { name: 'Formatting' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline code',
      'Bullet list',
      'Numbered list',
      'Checklist',
      'Quote',
      'Code block',
      'Link',
      'Horizontal rule',
    ]);
  });

  it('S5_FE_AC16: opening a document and moving around in it never rewrites it', async () => {
    const api = documentApi();
    renderApp('/n/f', api);
    const rich = await openDocument();
    const editor = richEditor(rich);

    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection({ from: 3, to: 5 });
      editor.commands.setTextSelection(1);
    });
    fireEvent.blur(rich);

    expect(within(panel()).getByRole('status')).toHaveTextContent('');
    expect(contentPatches(api)).toHaveLength(0);
  });

  it('S5_FE_AC16: a toolbar format is saved as Markdown, and the button shows it is on', async () => {
    const api = documentApi();
    renderApp('/n/f', api);
    const rich = await openDocument();
    const editor = richEditor(rich);

    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection({ from: 1, to: 7 });
    });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Bold' }));
    expect(within(panel()).getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.blur(rich);

    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toMatch(/^# \*\*Agenda\*\*/);
  });

  it('S5_FE_AC16: links only accept web and mail addresses', async () => {
    const api = documentApi();
    renderApp('/n/f', api);
    const rich = await openDocument();
    const editor = richEditor(rich);
    const prompt = vi.spyOn(window, 'prompt');

    act(() => {
      editor.commands.focus();
      editor.commands.setTextSelection({ from: 1, to: 7 });
    });
    prompt.mockReturnValueOnce('javascript:alert(1)');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Link' }));
    expect(await within(panel()).findByText(LINK_ERROR)).toBeInTheDocument();
    expect(rich.querySelector('a')).toBeNull();

    prompt.mockReturnValueOnce('https://example.com/agenda');
    fireEvent.click(within(panel()).getByRole('button', { name: 'Link' }));
    expect(within(panel()).queryByText(LINK_ERROR)).not.toBeInTheDocument();
    fireEvent.blur(rich);

    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toContain('[Agenda](https://example.com/agenda)');
  });

  it('S5_FE_AC16: a body over 100,000 characters is not saved and says why', async () => {
    const api = documentApi();
    renderApp('/n/f', api);
    const rich = await openDocument();

    act(() => {
      richEditor(rich).commands.insertContent('x'.repeat(100_001));
    });
    fireEvent.blur(rich);

    expect(within(panel()).getByRole('status')).toHaveTextContent(
      'Over 100,000 characters: shorten it to save.',
    );
    expect(contentPatches(api)).toHaveLength(0);
  });
});

// --- S5_FE_AC18 and AC19: Escape and the expanded editor -----------------------------------------

describe('S5_FE_AC18: Escape never discards', () => {
  it('S5_FE_AC18: Escape saves the draft and gives the keyboard back to the map', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.type(field, 'kept');
    await user.keyboard('{Escape}');

    expect(map()).toHaveFocus();
    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toBe(`${NOTES}kept`);
    expect(editorField()).toHaveValue(`${NOTES}kept`);
    // Escape stayed in the panel: the selection is still the document.
    expect(nodeElement('d')).toHaveClass('is-selected');
  });

  it('S5_FE_AC18: Escape in the rich editor saves and leaves too', async () => {
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const rich = await openDocument();
    act(() => {
      richEditor(rich).commands.insertContent(' now');
    });

    rich.focus();
    await user.keyboard('{Escape}');

    expect(map()).toHaveFocus();
    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
  });
});

describe('S5_FE_AC19: the expanded editor', () => {
  it('S5_FE_AC19: Expand makes the panel cover the map; Escape collapses it and keeps the focus', async () => {
    usePlainMode();
    const { user } = renderApp('/n/f', documentApi());
    const field = await openDocument();

    fireEvent.click(expandButton());
    expect(panel()).toHaveClass('is-expanded');
    expect(expandButton()).toHaveTextContent('Collapse editor');
    expect(expandButton()).toHaveAttribute('aria-pressed', 'true');

    await user.click(field);
    await user.keyboard('{Escape}');

    expect(panel()).not.toHaveClass('is-expanded');
    expect(field).toHaveFocus();
    fireEvent.click(expandButton());
    fireEvent.click(expandButton());
    expect(panel()).not.toHaveClass('is-expanded');
  });
});

// --- S5_FE_AC20 and AC21: serialized saves and map shortcuts --------------------------------------

describe('S5_FE_AC20: saves are serialized', () => {
  it('S5_FE_AC20: a body save waits for the title save and uses the version it returned', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    const title = within(panel()).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Minutes');
    fireEvent.blur(title);
    await user.click(field);
    await user.type(field, 'x');
    fireEvent.blur(field);

    await waitFor(() => expect(api.callsTo('PATCH', '/api/nodes/d')).toHaveLength(2));
    const [first, second] = api.callsTo('PATCH', '/api/nodes/d');
    expect(first.body).toEqual({ title: 'Minutes', version: 1 });
    expect(second.body).toEqual({ content: `${NOTES}x`, version: 2 });
    expect(nodeElement('d')).toHaveTextContent('Minutes');
  });
});

describe('S5_FE_AC21: map shortcuts are off in the editor', () => {
  it('S5_FE_AC21: Delete, Backspace, Space, the arrows and Alt+arrows only edit the text', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = await openDocument();

    await user.click(field);
    await user.keyboard('{Delete}{Backspace} {ArrowLeft}{ArrowRight}{ArrowUp}{ArrowDown}');
    await user.keyboard('{Alt>}{ArrowUp}{ArrowLeft}{/Alt}');

    expect(api.callsTo('DELETE', /nodes/)).toHaveLength(0);
    expect(api.callsTo('POST', /move/)).toHaveLength(0);
    expect(nodeElement('d')).toHaveClass('is-selected');
    expect(screen.queryByRole('menu', { hidden: true })).not.toBeInTheDocument();
  });
});

// --- S5_FE_AC26 and AC27: toolbar tooltips and the Tab key -------------------------------------

describe('S5_FE_AC26: toolbar tooltips', () => {
  it('S5_FE_AC26: every tool describes itself with its keys and its Markdown', async () => {
    renderApp('/n/f', documentApi());
    await openDocument();
    const toolbar = within(panel()).getByRole('toolbar', { name: 'Formatting' });

    for (const button of within(toolbar).getAllByRole('button')) {
      const tooltip = document.getElementById(button.getAttribute('aria-describedby')!);
      expect(tooltip).toHaveAttribute('role', 'tooltip');
      expect(tooltip!.textContent).toBe(tooltipFor(button.getAttribute('aria-label')!));
      expect(tooltip!.textContent!.startsWith(button.getAttribute('aria-label')!)).toBe(true);
    }
    expect(within(toolbar).getByRole('button', { name: 'Bold' })).toHaveAccessibleDescription(
      tooltipFor('Bold'),
    );
  });

  it('S5_FE_AC26: the keys are written as the platform writes them', () => {
    expect(tooltipFor('Bold', true)).toBe('Bold — ⌘B, or type **text**');
    expect(tooltipFor('Bold', false)).toBe('Bold — Ctrl+B, or type **text**');
    expect(tooltipFor('Bullet list', false)).toBe('Bullet list — Ctrl+Shift+8, or type -');
    expect(tooltipFor('Heading 2', true)).toBe('Heading 2 — ⌘⌥2, or type ##');
    expect(tooltipFor('Horizontal rule', true)).toBe('Horizontal rule — or type ---');
    expect(tooltipFor('Link', true)).toBe('Link — select text first; https://, http:// or mailto:');
  });
});

describe('S5_FE_AC27: Tab writes in the editor', () => {
  it('S5_FE_AC27: in plain text Tab inserts a tab at the cursor and the focus stays', async () => {
    usePlainMode();
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const field = (await openDocument()) as HTMLTextAreaElement;

    await user.click(field);
    field.setSelectionRange(2, 2);
    await user.keyboard('{Tab}');
    expect(field).toHaveFocus();
    expect(field).toHaveValue(`# \tAgenda\n\n- budget\n- hiring\n`);

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(field).toHaveFocus();
    expect(field).toHaveValue(`# \tAgenda\n\n- budget\n- hiring\n`);
    fireEvent.blur(field);

    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api)).toBe('# \tAgenda\n\n- budget\n- hiring\n');
    expect(nodeElement('d')).toHaveClass('is-selected');
  });

  it('S5_FE_AC27: in rich text Tab writes a tab mid-line and an em space at the start of a line', async () => {
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const rich = await openDocument();
    const editor = richEditor(rich);

    act(() => {
      rich.focus();
      editor.commands.setTextSelection(4);
    });
    await user.keyboard('{Tab}');
    act(() => {
      editor.commands.setTextSelection(1);
    });
    await user.keyboard('{Tab}');
    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(rich).toHaveFocus();
    expect(editor.getText().split('\n')[0]).toBe('\u2003Age\tnda');
    fireEvent.blur(rich);
    await waitFor(() => expect(contentPatches(api)).toHaveLength(1));
    expect(lastContent(api).startsWith('# \u2003Age\tnda')).toBe(true);
  });

  it('S5_FE_AC27: in a rich text list Tab nests the item and Shift+Tab lifts it back', async () => {
    const api = documentApi();
    const { user } = renderApp('/n/f', api);
    const rich = await openDocument();
    const editor = richEditor(rich);
    const hiringItem = () =>
      within(rich)
        .getAllByRole('listitem')
        .find((li) => li.textContent === 'hiring')!;

    act(() => {
      rich.focus();
      editor.commands.setTextSelection(endOf(editor, 'hiring'));
    });
    await user.keyboard('{Tab}');
    expect(hiringItem().parentElement!.closest('li')).not.toBeNull();

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(hiringItem().parentElement!.closest('li')).toBeNull();
    expect(rich).toHaveFocus();
  });
});
