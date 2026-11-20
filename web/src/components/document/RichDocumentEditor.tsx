import { useId, useRef } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { documentExtensions } from './documentExtensions';
import { isAllowedLink } from './documentLimits';

export const LINK_ERROR = 'Links must start with https://, http:// or mailto:';

/** TipTap's own key for each tool, in its notation, and what to type in Markdown instead. */
const HINTS: Record<string, { keys?: string; markdown?: string; note?: string }> = {
  'Heading 1': { keys: 'Mod-Alt-1', markdown: '# ' },
  'Heading 2': { keys: 'Mod-Alt-2', markdown: '## ' },
  'Heading 3': { keys: 'Mod-Alt-3', markdown: '### ' },
  Bold: { keys: 'Mod-B', markdown: '**text**' },
  Italic: { keys: 'Mod-I', markdown: '*text*' },
  Strikethrough: { keys: 'Mod-Shift-S', markdown: '~~text~~' },
  'Inline code': { keys: 'Mod-E', markdown: '`text`' },
  'Bullet list': { keys: 'Mod-Shift-8', markdown: '- ' },
  'Numbered list': { keys: 'Mod-Shift-7', markdown: '1. ' },
  Checklist: { keys: 'Mod-Shift-9', markdown: '[ ] ' },
  Quote: { keys: 'Mod-Shift-B', markdown: '> ' },
  'Code block': { keys: 'Mod-Alt-C', markdown: '```' },
  Link: { note: 'select text first; https://, http:// or mailto:' },
  'Horizontal rule': { markdown: '---' },
};

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** `Mod-Shift-8` as the platform writes it: ⌘⇧8 on a Mac, Ctrl+Shift+8 elsewhere. */
export function formatKeys(keys: string, mac = isMac()): string {
  const parts = keys.split('-');
  if (mac) {
    const symbols: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥' };
    return parts.map((part) => symbols[part] ?? part).join('');
  }
  return parts.map((part) => (part === 'Mod' ? 'Ctrl' : part)).join('+');
}

/** The tooltip of a tool (slice 5, S5_FE_AC26): its name, its keys and its Markdown. */
export function tooltipFor(label: string, mac = isMac()): string {
  const hint = HINTS[label] ?? {};
  const extras = [
    hint.keys && formatKeys(hint.keys, mac),
    hint.markdown && `or type ${hint.markdown.trim()}`,
    hint.note,
  ].filter(Boolean);
  return extras.length === 0 ? label : `${label} — ${extras.join(', ')}`;
}

interface ToolbarButton {
  label: string;
  glyph: string;
  isActive?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const heading = (level: 1 | 2 | 3): ToolbarButton => ({
  label: `Heading ${level}`,
  glyph: `H${level}`,
  isActive: (editor) => editor.isActive('heading', { level }),
  run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
});

/** The toolbar of decision D4, in reading order; every entry also has a Markdown shortcut. */
const TOOLBAR: ToolbarButton[] = [
  heading(1),
  heading(2),
  heading(3),
  {
    label: 'Bold',
    glyph: 'B',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    glyph: 'I',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Strikethrough',
    glyph: 'S',
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    label: 'Inline code',
    glyph: '</>',
    isActive: (e) => e.isActive('code'),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  {
    label: 'Bullet list',
    glyph: '•',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    glyph: '1.',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Checklist',
    glyph: '☑',
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: 'Quote',
    glyph: '❝',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Code block',
    glyph: '{ }',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

const HORIZONTAL_RULE: ToolbarButton = {
  label: 'Horizontal rule',
  glyph: '―',
  run: (e) => e.chain().focus().setHorizontalRule().run(),
};

export interface RichDocumentEditorProps {
  /** Markdown the editor starts from; later changes come from the editor itself. */
  initialContent: string;
  onChange: (markdown: string) => void;
  onEscape: () => void;
  /** Reports a refused link address (decision D10). */
  onLinkError: (message: string | null) => void;
  autoFocus: boolean;
  onFocused: () => void;
}

/**
 * The WYSIWYG mode of the document editor (slice 5, decision D4): TipTap with a toolbar and the
 * extensions' own Markdown typing shortcuts (`# `, `**bold**`, `- `, `[ ] `, `> `, three
 * backticks, `---`). It reads and writes Markdown; saving from here may reformat it (D4).
 * Loaded lazily, so the map never pays for it until a document is opened in rich mode.
 */
export default function RichDocumentEditor({
  initialContent,
  onChange,
  onEscape,
  onLinkError,
  autoFocus,
  onFocused,
}: RichDocumentEditorProps) {
  // The Markdown the editor makes of the loaded content before any edit. ProseMirror may append
  // an empty paragraph on the first transaction (a click, a selection), which only changes the
  // trailing whitespace: until the text really changes, the content is reported as loaded, so
  // opening a document never rewrites it.
  const baseline = useRef<string | null>(null);
  const tooltipId = useId();
  const editor = useEditor({
    extensions: documentExtensions(),
    content: initialContent,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Document',
        'aria-multiline': 'true',
        class: 'document-rich-content',
      },
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Escape') return false;
        onEscape();
        return true;
      },
    },
    onCreate: ({ editor: created }) => {
      baseline.current = created.getMarkdown().trimEnd();
      if (autoFocus) onFocused();
    },
    onUpdate: ({ editor: updated }) => {
      const markdown = updated.getMarkdown();
      onChange(markdown.trimEnd() === baseline.current ? initialContent : markdown);
    },
  });

  // Re-render the toolbar only when what it shows changes, not on every keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      marks: TOOLBAR.map((button) => Boolean(current && button.isActive?.(current))),
      link: Boolean(current?.isActive('link')),
    }),
  });

  const editLink = () => {
    const current = editor.getAttributes('link').href as string | undefined;
    const answer = window.prompt('Link address (https://… or mailto:…)', current ?? 'https://');
    if (answer === null) return;
    const href = answer.trim();
    if (href === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onLinkError(null);
      return;
    }
    if (!isAllowedLink(href)) {
      onLinkError(LINK_ERROR);
      return;
    }
    onLinkError(null);
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const buttons = [
    ...TOOLBAR.map((button, index) => ({ ...button, pressed: active?.marks[index] ?? false })),
    { label: 'Link', glyph: '🔗', run: editLink, pressed: active?.link ?? false },
    { ...HORIZONTAL_RULE, pressed: undefined },
  ];

  return (
    <div className="document-rich">
      <div className="document-toolbar" role="toolbar" aria-label="Formatting">
        {buttons.map((button, index) => {
          const third = Math.floor((index * 3) / buttons.length);
          const align = ['is-start', 'is-center', 'is-end'][third];
          const keys = HINTS[button.label]?.keys;
          return (
            <button
              key={button.label}
              type="button"
              aria-label={button.label}
              aria-describedby={`${tooltipId}-${index}`}
              aria-keyshortcuts={keys
                ?.replace('Mod', isMac() ? 'Meta' : 'Control')
                .replaceAll('-', '+')}
              aria-pressed={button.pressed}
              // The editor keeps the focus and the selection while the toolbar is clicked.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => button.run(editor)}
            >
              {button.glyph}
              <span
                id={`${tooltipId}-${index}`}
                role="tooltip"
                className={`document-tooltip ${align}`}
              >
                {tooltipFor(button.label)}
              </span>
            </button>
          );
        })}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
