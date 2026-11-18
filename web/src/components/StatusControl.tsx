import type { TaskStatus } from '../api/client';
import { STATUS_LABELS, STATUS_ORDER } from '../map/nodes/taskProps';

interface StatusControlProps {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}

/**
 * A task's status as a segmented control (slice 4A, decision D12): three radios in a group, each
 * saving as soon as it is chosen. Radios, and not buttons, so the arrow keys move among them and
 * screen readers announce which one is current.
 */
export function StatusControl({ status, onChange }: StatusControlProps) {
  return (
    <fieldset className="status-control">
      <legend>Status</legend>
      <div className="status-options">
        {STATUS_ORDER.map((value) => (
          <label key={value} className={`status-option is-${value}`}>
            <input
              type="radio"
              name="task-status"
              value={value}
              checked={status === value}
              onChange={() => value !== status && onChange(value)}
            />
            <span>{STATUS_LABELS[value]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
