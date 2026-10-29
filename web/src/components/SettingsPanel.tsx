export const DEPTH_MIN = 1;
export const DEPTH_MAX = 10;

const DEPTH_OPTIONS = Array.from({ length: DEPTH_MAX - DEPTH_MIN + 1 }, (_, i) => DEPTH_MIN + i);

interface SettingsPanelProps {
  depth: number;
  onDepthChange: (depth: number) => void;
}

/** Preferencia N de niveles visibles (ADR 0010). */
export function SettingsPanel({ depth, onDepthChange }: SettingsPanelProps) {
  return (
    <label className="settings-panel">
      Niveles visibles
      <select value={depth} onChange={(event) => onDepthChange(Number(event.target.value))}>
        {DEPTH_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
}
