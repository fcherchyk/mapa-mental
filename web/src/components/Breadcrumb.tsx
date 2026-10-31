import { Link } from 'react-router';
import type { NodeOut } from '../api/client';
import { pathFor } from '../session';

interface BreadcrumbProps {
  ancestors: NodeOut[];
  focusTitle: string;
  rootId: string;
}

export function Breadcrumb({ ancestors, focusTitle, rootId }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {ancestors.map((ancestor) => (
          <li key={ancestor.id}>
            <Link to={pathFor(ancestor.id, rootId)}>{ancestor.title}</Link>
          </li>
        ))}
        <li aria-current="page">{focusTitle}</li>
      </ol>
    </nav>
  );
}
