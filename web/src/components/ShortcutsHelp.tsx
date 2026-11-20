import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

interface Shortcut {
  keys: string;
  description: string;
}

const MAP_SHORTCUTS: Shortcut[] = [
  {
    keys: 'Tab',
    description:
      'With the map focused, adds a child idea to the selected idea and starts editing it.',
  },
  {
    keys: 'Shift + Tab',
    description:
      'With the map focused, opens the menu of what to add inside the selected idea, as + does: press 1 for an idea, 2 for a task or 3 for a document. Only ideas can have child nodes.',
  },
  { keys: 'F2', description: "Edit the selected node's title in the details panel." },
  { keys: 'Escape', description: 'Clear the selection and close the details panel.' },
  { keys: 'Space', description: 'Collapses or expands the selected idea.' },
  {
    keys: 'Delete',
    description:
      'Deletes the selected idea, task or document. If it has children, asks whether to delete the whole subtree or only the idea and move its children up.',
  },
  {
    keys: 'Enter',
    description:
      'Focuses the selected idea. While you create one, confirms it and opens a sibling of the same kind; a new document opens its editor instead.',
  },
  { keys: 'Backspace', description: 'Goes up one level from the focused idea.' },
  {
    keys: 'Arrows',
    description:
      'Move the selection: → to the first child, ← to the parent, ↑ and ↓ between siblings.',
  },
  {
    keys: 'Alt + ↑ ↓',
    description: 'Move the selected node up or down among its siblings.',
  },
  {
    keys: 'Alt + →',
    description:
      'Makes the selected node the last child of the idea above it. Only ideas can have child nodes.',
  },
  {
    keys: 'Alt + ←',
    description: 'Takes the selected node out, as the last child of its grandparent.',
  },
  {
    keys: 'Double click',
    description:
      'Focuses the idea; on the focused idea, goes up one level. Tasks and documents cannot be focused.',
  },
  {
    keys: 'Drag',
    description:
      'Drop any node on an idea to make it its last child, or between its own siblings to reorder it. Breadcrumb entries also accept the drop; tasks and documents never do.',
  },
];

/** The board's own keys (slice 4B, decision D16). */
const BOARD_SHORTCUTS: Shortcut[] = [
  { keys: 'Enter', description: "Opens the focused card's details." },
  { keys: 'Alt + ← →', description: 'Moves the card to the previous or next column.' },
  { keys: 'Alt + ↑ ↓', description: 'Moves the card up or down in its column.' },
  { keys: 'Delete', description: 'Deletes the card.' },
  { keys: 'Escape', description: 'Clears the selection.' },
  { keys: 'Drag', description: 'Drag a card to another column or position.' },
];

/** Inside a document's editor (slice 5, decisions D4 to D6). */
const DOCUMENT_SHORTCUTS: Shortcut[] = [
  {
    keys: 'Markdown',
    description:
      'In rich text, typing # , - , 1. , [ ] , > , ``` or --- starts a heading, list, checklist, quote, code block or rule; **bold**, *italic*, ~~strike~~ and `code` format as you type.',
  },
  {
    keys: 'Tab',
    description:
      'Writes a tab. In a rich text list it indents the item, and Shift + Tab outdents it. At the start of a rich text line the indent is an em space, so the line never turns into a code block.',
  },
  {
    keys: 'Ctrl/⌘ + B, I',
    description: 'Bold and italic in rich text; the toolbar offers every format.',
  },
  {
    keys: 'Escape',
    description:
      'Collapses the expanded editor; otherwise saves and gives the keyboard back to the map. It never discards text. It is the way out of the editor, since Tab writes.',
  },
];

const GROUPS: { title: ShortcutsContext; shortcuts: Shortcut[] }[] = [
  { title: 'Map', shortcuts: MAP_SHORTCUTS },
  { title: 'Board', shortcuts: BOARD_SHORTCUTS },
  { title: 'Document', shortcuts: DOCUMENT_SHORTCUTS },
];

/** Where the user is working, which picks the tab the help opens on (slice 5, S5_FE_AC28). */
export type ShortcutsContext = 'Map' | 'Board' | 'Document';

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tab selected when the panel opens; `Map` if not given. */
  context?: ShortcutsContext;
}

/**
 * "?" button and panel with the shortcuts, one tab per section, opened on the section of the view
 * the user is in. Escape closes it and returns focus to the button; a press anywhere outside the
 * button and the panel closes it too (slice 5, S5_FE_AC25).
 */
export function ShortcutsHelp({ open, onOpenChange, context = 'Map' }: ShortcutsHelpProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<ShortcutsContext>(context);

  // Every opening starts on the context's tab, however the panel was used before.
  useEffect(() => {
    if (open) setTab(context);
  }, [open, context]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    // Outside presses leave the focus where the user put it.
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node | null)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onOpenChange]);

  const selected = GROUPS.find((group) => group.title === tab) ?? GROUPS[0];

  /** The arrows move between tabs, wrapping, and select as they move. */
  const onTabsKey = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const titles = GROUPS.map((group) => group.title);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = titles[(titles.indexOf(tab) + step + titles.length) % titles.length];
    setTab(next);
    tabsRef.current?.querySelector<HTMLButtonElement>(`#shortcuts-tab-${next}`)?.focus();
  };

  const onButtonClick = () => {
    if (!open) {
      onOpenChange(true);
      return;
    }
    onOpenChange(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="shortcuts" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        aria-controls="shortcuts-panel"
        onClick={onButtonClick}
      >
        ?
      </button>
      {open && (
        <section
          id="shortcuts-panel"
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="shortcuts-panel"
        >
          <div
            ref={tabsRef}
            role="tablist"
            aria-label="Shortcut sections"
            className="shortcuts-tabs"
            onKeyDown={onTabsKey}
          >
            {GROUPS.map((group) => (
              <button
                key={group.title}
                type="button"
                role="tab"
                id={`shortcuts-tab-${group.title}`}
                aria-selected={tab === group.title}
                aria-controls="shortcuts-tabpanel"
                tabIndex={tab === group.title ? 0 : -1}
                onClick={() => setTab(group.title)}
              >
                {group.title}
              </button>
            ))}
          </div>
          <section
            id="shortcuts-tabpanel"
            role="tabpanel"
            aria-labelledby={`shortcuts-tab-${tab}`}
            tabIndex={0}
          >
            <dl>
              {selected.shortcuts.map(({ keys, description }) => (
                <div key={keys}>
                  <dt>
                    <kbd>{keys}</kbd>
                  </dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </section>
      )}
    </div>
  );
}
