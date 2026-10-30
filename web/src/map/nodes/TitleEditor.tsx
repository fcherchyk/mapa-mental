import { useEffect, useRef, useState } from 'react';

const MAX_FOCUS_FRAMES = 60;

/**
 * React Flow oculta un nodo nuevo hasta medirlo, y un elemento oculto no recibe el foco: se reintenta
 * en los frames siguientes hasta que el campo lo tenga o se desmonte.
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

/** Campo de edición del título; las teclas actúan sobre el texto y no sobre el mapa. */
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
      aria-label="Título"
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
