import { useEffect, useRef } from 'react';

const SHORTCUTS: { keys: string; description: string }[] = [
  {
    keys: 'Tab',
    description: 'Con el mapa enfocado, agrega un hijo al nodo seleccionado y lo deja en edición.',
  },
  { keys: 'F2', description: 'Pone en edición el título del nodo seleccionado.' },
  { keys: 'Espacio', description: 'Colapsa o expande el nodo seleccionado.' },
  {
    keys: 'Supr',
    description:
      'Borra el nodo seleccionado. Si tiene hijos, pregunta si borrar todo el subárbol o solo el nodo y subir sus hijos.',
  },
  {
    keys: 'Enter',
    description:
      'Enfoca el nodo seleccionado. Mientras editás un título, lo confirma y abre una idea hermana.',
  },
  { keys: 'Retroceso', description: 'Sube un nivel desde el nodo enfocado.' },
  {
    keys: 'Flechas',
    description: 'Mueven la selección: → al primer hijo, ← al padre, ↑ y ↓ entre hermanos.',
  },
  { keys: 'Doble click', description: 'Enfoca el nodo; sobre el nodo enfocado, sube un nivel.' },
];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Botón "?" y panel con los atajos del mapa; Escape lo cierra y devuelve el foco al botón. */
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
        aria-label="Atajos de teclado"
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
          aria-label="Atajos de teclado"
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
