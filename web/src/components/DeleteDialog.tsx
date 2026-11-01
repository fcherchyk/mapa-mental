import { useEffect, useRef } from 'react';
import type { DeleteMode, DeleteRequest } from '../map/useMapView';

interface DeleteDialogProps {
  request: DeleteRequest;
  onChoose: (mode: DeleteMode) => void;
  onCancel: () => void;
}

/** Modal dialog to delete a node with children; it starts on "Cancel", the least destructive option. */
export function DeleteDialog({ request, onChoose, onCancel }: DeleteDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const amount = request.exact ? `${request.count}` : `at least ${request.count}`;

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const buttons = [...(dialogRef.current?.querySelectorAll('button') ?? [])];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={dialogRef}
        className="delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-text"
        onKeyDown={onKeyDown}
      >
        <h2 id="delete-dialog-title">Delete “{request.title}”</h2>
        <p id="delete-dialog-text">
          It has {amount} {request.count === 1 && request.exact ? 'descendant' : 'descendants'}.
          What should we do with them?
        </p>
        <div className="delete-dialog-actions">
          <button type="button" className="is-danger" onClick={() => onChoose('cascade')}>
            Delete everything from here
          </button>
          <button type="button" onClick={() => onChoose('reparent')}>
            Delete only this one and move its children up
          </button>
          <button type="button" ref={cancelRef} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
