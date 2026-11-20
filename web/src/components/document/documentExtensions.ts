import { Extension, type Editor, type Extensions } from '@tiptap/react';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { isAllowedLink } from './documentLimits';

export { CONTENT_MAX_LENGTH, isAllowedLink } from './documentLimits';

/**
 * Em space: an indent that Markdown keeps as text. A tab or four spaces at the start of a line
 * would turn the paragraph into a code block the next time the document is read.
 */
export const LINE_START_INDENT = '\u2003';

/** What Tab writes at the cursor: a tab, or an em space where a tab would start a code block. */
export function tabTextAt(editor: Editor): string {
  const { $from } = editor.state.selection;
  const block = $from.parent;
  if (block.type.name === 'codeBlock') return '\t';
  const before = block.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  return before.trim() === '' ? LINE_START_INDENT : '\t';
}

/**
 * Tab writes instead of leaving the editor (slice 5, decision D12). It runs after the list
 * keymaps, so in a list Tab still nests the item and Shift+Tab lifts it; anywhere else Shift+Tab
 * does nothing. The keyboard leaves the editor with Escape.
 */
const TabKey = Extension.create({
  name: 'documentTabKey',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const text = tabTextAt(editor);
        return editor.commands.command(({ tr }) => {
          tr.insertText(text);
          return true;
        });
      },
      'Shift-Tab': () => true,
    };
  },
});

/**
 * The rich editor's schema: exactly the Markdown the slice supports (decision D4) — headings,
 * bold, italic, strikethrough, inline and block code, bullet, numbered and checkbox lists,
 * blockquotes, links and horizontal rules. Underline is left out: Markdown has no syntax for it.
 * Raw HTML never reaches the page: ProseMirror only renders the nodes of this schema.
 */
export function documentExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        isAllowedUri: (url) => isAllowedLink(url),
        shouldAutoLink: (url) => isAllowedLink(url),
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown,
    TabKey,
  ];
}
