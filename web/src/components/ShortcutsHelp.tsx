import { useEffect, useRef } from 'react';

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
      "With the map focused, adds a task inside the selected idea and starts editing it. Tasks can't contain anything.",
  },
  { keys: 'F2', description: 'Edit the selected idea or task in the details panel.' },
  { keys: 'Escape', description: 'Clear the selection and close the details panel.' },
  { keys: 'Space', description: 'Collapses or expands the selected idea.' },
  {
    keys: 'Delete',
    description:
      'Deletes the selected idea or task. If it has children, asks whether to delete the whole subtree or only the idea and move its children up.',
  },
  {
    keys: 'Enter',
    description:
      'Focuses the selected idea. While you create one, confirms it and opens a sibling of the same kind.',
  },
  { keys: 'Backspace', description: 'Goes up one level from the focused idea.' },
  {
    keys: 'Arrows',
    description:
      'Move the selection: → to the first child, ← to the parent, ↑ and ↓ between siblings.',
  },
  {
    keys: 'Alt + ↑ ↓',
    description: 'Move the selected idea or task up or down among its siblings.',
  },
  {
    keys: 'Alt + →',
    description:
      'Makes the selected idea or task the last child of the idea above it. A task takes nothing inside it.',
  },
  {
    keys: 'Alt + ←',
    description: 'Takes the selected idea or task out, as the last child of its grandparent.',
  },
  {
    keys: 'Double click',
    description:
      'Focuses the idea; on the focused idea, goes up one level. A task cannot be focused.',
  },
  {
    keys: 'Drag',
    description:
      'Drop an idea or task on an idea to make it its last child, or between its own siblings to reorder it. Breadcrumb entries also accept the drop; a task never does.',
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

const GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  { title: 'Map', shortcuts: MAP_SHORTCUTS },
  { title: 'Board', shortcuts: BOARD_SHORTCUTS },
];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** "?" button and panel with the map's shortcuts; Escape closes it and returns focus to the button. */
export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const onButtonClick = () => {
    if (!open) {
      onOpenChange(true);
      return;
    }
    onOpenChange(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="shortcuts">
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
          {GROUPS.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h2>{group.title}</h2>
              <dl>
                {group.shortcuts.map(({ keys, description }) => (
                  <div key={keys}>
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </section>
      )}
    </div>
  );
}
