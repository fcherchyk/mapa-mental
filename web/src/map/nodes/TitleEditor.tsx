import { useEffect, useRef, useState } from 'react';

const MAX_FOCUS_FRAMES = 60;

/**
 * React Flow hides a new node until it measures it, and a hidden element cannot take focus: retry
 * on the following frames until the field has it or unmounts.
 */
function focusWhenVisible(input: HTMLInputElement): () => void {
  let frame = 0;
  let attempts = 0;
  const attempt = () => {
    input.focus();
    if (document.activeElement === input || attempts >= MAX_FOCUS_FRAMES) return;
    attempts += 1;
    frame = requestAnimationFrame(attempt);
  };
  attempt();
  return () => cancelAnimationFrame(frame);
}

interface TitleEditorProps {
  initialTitle: string;
  onCommit: (title: string, createSibling: boolean) => void;
  onCancel: () => void;
}

/** Title editing field; keys act on the text and not on the map. */
export function TitleEditor({ initialTitle, onCommit, onCancel }: TitleEditorProps) {
  const [value, setValue] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => (inputRef.current ? focusWhenVisible(inputRef.current) : undefined), []);

  const finish = (action: () => void) => {
    if (finished.current) return;
    finished.current = true;
    action();
  };

  return (
    <input
      className="map-node-input nodrag nopan"
      ref={inputRef}
      aria-label="Title"
      maxLength={200}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(() => onCommit(value, true));
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(onCancel);
        }
      }}
      onBlur={() => finish(() => onCommit(value, false))}
    />
  );
}
