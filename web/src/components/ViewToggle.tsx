import { Link } from 'react-router';
import { boardPathFor, pathFor } from '../session';

interface ViewToggleProps {
  focusId: string;
  rootId: string;
  current: 'map' | 'board';
}

/** The Map | Board switch; both views keep the same focus (slice 4B, decision D1). */
export function ViewToggle({ focusId, rootId, current }: ViewToggleProps) {
  return (
    <nav aria-label="View" className="view-toggle">
      <Link to={pathFor(focusId, rootId)} aria-current={current === 'map' ? 'page' : undefined}>
        Map
      </Link>
      <Link
        to={boardPathFor(focusId, rootId)}
        aria-current={current === 'board' ? 'page' : undefined}
      >
        Board
      </Link>
    </nav>
  );
}
