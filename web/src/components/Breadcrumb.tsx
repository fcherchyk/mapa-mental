import { Link } from 'react-router';
import type { NodeOut } from '../api/client';
import { pathFor } from '../session';

interface BreadcrumbProps {
  ancestors: NodeOut[];
  focusTitle: string;
  rootId: string;
  /** Where an ancestor leads: its map by default, or its board (slice 4B, decision D1). */
  linkTo?: (ancestorId: string, rootId: string) => string;
  /** Set while a node is being dragged: dropping on an ancestor moves the node into it. */
  onDropOn?: (ancestorId: string) => void;
  acceptsDrop?: (ancestorId: string) => boolean;
}

export function Breadcrumb({
  ancestors,
  focusTitle,
  rootId,
  linkTo = pathFor,
  onDropOn,
  acceptsDrop,
}: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {ancestors.map((ancestor) => (
          <li
            key={ancestor.id}
            className={onDropOn ? 'is-drop-zone' : undefined}
            onDragOver={(event) => {
              if (onDropOn && acceptsDrop?.(ancestor.id)) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!onDropOn) return;
              event.preventDefault();
              onDropOn(ancestor.id);
            }}
          >
            <Link to={linkTo(ancestor.id, rootId)}>{ancestor.title}</Link>
          </li>
        ))}
        <li aria-current="page">{focusTitle}</li>
      </ol>
    </nav>
  );
}
