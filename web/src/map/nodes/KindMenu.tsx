import { useEffect, useRef, type KeyboardEvent } from 'react';
import { capitalized, CREATABLE_KINDS, kindName } from './kinds';

const FOCUS_ATTEMPTS = 10;

/** The kind a number key picks in the menu (1 is the first entry), or `null`. */
export function kindForKey(key: string): string | null {
  const number = Number(key);
  return Number.isInteger(number) && number >= 1 && number <= CREATABLE_KINDS.length
    ? CREATABLE_KINDS[number - 1]
    : null;
}

interface KindMenuProps {
  /** The idea the new node goes into; names the menu. */
  parentTitle: string;
  onChoose: (kind: string) => void;
  /** `focusMap`: give the keyboard back to the map (Escape), or leave the focus where it went. */
  onClose: (focusMap: boolean) => void;
}

/**
 * What "+" and Shift+Tab open on an idea (slice 5, decision D8): one entry per kind that can be
 * created, picked by click, by its number key, or with the arrows and Enter.
 */
export function KindMenu({ parentTitle, onChoose, onClose }: KindMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = () => [...(menuRef.current?.querySelectorAll('button') ?? [])];

  // The menu is drawn inside a React Flow node; the first attempt to focus it may not stick, so
  // it retries for a few frames. The map also answers the menu's keys while it is open.
  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    const attempt = () => {
      const menu = menuRef.current;
      if (!menu || menu.contains(document.activeElement)) return;
      items()[0]?.focus();
      if (attempts >= FOCUS_ATTEMPTS) return;
      attempts += 1;
      frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, []);

  const moveFocus = (step: number) => {
    const buttons = items();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(index + step + buttons.length) % buttons.length]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    const kind = kindForKey(event.key);
    if (kind) {
      event.preventDefault();
      onChoose(kind);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`What to add inside ${parentTitle}`}
      className="map-kind-menu nodrag nopan"
      onKeyDown={onKeyDown}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose(false);
      }}
    >
      {CREATABLE_KINDS.map((kind, index) => {
        const label = capitalized(kindName(kind));
        return (
          <button
            key={kind}
            type="button"
            role="menuitem"
            aria-label={label}
            aria-keyshortcuts={String(index + 1)}
            onClick={() => onChoose(kind)}
          >
            <kbd>{index + 1}</kbd>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
