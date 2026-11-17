import { useEffect, useRef } from 'react';

const SHORTCUTS: { keys: string; description: string }[] = [
  {
    keys: 'Tab',
    description: 'With the map focused, adds a child to the selected idea and starts editing it.',
  },
  { keys: 'F2', description: 'Edit the selected idea in the details panel.' },
  { keys: 'Escape', description: 'Clear the selection and close the details panel.' },
  { keys: 'Space', description: 'Collapses or expands the selected idea.' },
  {
    keys: 'Delete',
    description:
      'Deletes the selected idea. If it has children, asks whether to delete the whole subtree or only the idea and move its children up.',
  },
  {
    keys: 'Enter',
    description:
      'Focuses the selected idea. While you create an idea, confirms it and opens a sibling idea.',
  },
  { keys: 'Backspace', description: 'Goes up one level from the focused idea.' },
  {
    keys: 'Arrows',
    description: 'Move the selection: → to the first child, ← to the parent, ↑ and ↓ between siblings.',
  },
  {
    keys: 'Alt + ↑ ↓',
    description: 'Move the selected idea up or down among its siblings.',
  },
  {
    keys: 'Alt + →',
    description: 'Makes the selected idea the last child of the idea above it.',
  },
  {
    keys: 'Alt + ←',
    description: 'Takes the selected idea out, as the last child of its grandparent.',
  },
  { keys: 'Double click', description: 'Focuses the idea; on the focused idea, goes up one level.' },
  {
    keys: 'Drag',
    description:
      'Drop an idea on another to make it its last child, or between its own siblings to reorder it. Breadcrumb entries also accept the drop.',
  },
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
          <dl>
            {SHORTCUTS.map(({ keys, description }) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
