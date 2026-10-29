import { useRef, useState } from 'react';

interface TitleEditorProps {
  initialTitle: string;
  onCommit: (title: string, createSibling: boolean) => void;
  onCancel: () => void;
}

/** Campo de edición del título; las teclas actúan sobre el texto y no sobre el mapa. */
export function TitleEditor({ initialTitle, onCommit, onCancel }: TitleEditorProps) {
  const [value, setValue] = useState(initialTitle);
  const finished = useRef(false);

  const finish = (action: () => void) => {
    if (finished.current) return;
    finished.current = true;
    action();
  };

  return (
    <input
      className="map-node-input nodrag nopan"
      aria-label="Título"
      autoFocus
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
