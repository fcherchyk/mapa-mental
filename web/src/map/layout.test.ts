import { describe, expect, it } from 'vitest';
import { NODE_HEIGHT, layoutTree } from './layout';

const children: Record<string, string[]> = {
  F: ['A', 'B'],
  A: ['A1', 'A2', 'A3'],
  B: [],
  A1: [],
  A2: [],
  A3: [],
};

describe('disposición en árbol horizontal', () => {
  const { positions, edges } = layoutTree('F', (id) => children[id] ?? []);

  it('criterio_6: la x crece con el nivel y un mismo nivel comparte x', () => {
    expect(positions.F.x).toBeLessThan(positions.A.x);
    expect(positions.A.x).toBe(positions.B.x);
    expect(positions.A.x).toBeLessThan(positions.A1.x);
    expect(new Set(['A1', 'A2', 'A3'].map((id) => positions[id].x)).size).toBe(1);
  });

  it('criterio_6: A queda encima de B y los subárboles no se superponen', () => {
    expect(positions.A.y).toBeLessThan(positions.B.y);
    const subtreeA = ['A', 'A1', 'A2', 'A3'].map((id) => positions[id].y);
    expect(Math.max(...subtreeA) + NODE_HEIGHT).toBeLessThanOrEqual(positions.B.y);
    const leaves = ['A1', 'A2', 'A3', 'B'].map((id) => positions[id].y);
    leaves.slice(1).forEach((y, i) => expect(y - leaves[i]).toBeGreaterThanOrEqual(NODE_HEIGHT));
  });

  it('criterio_6: un padre queda centrado entre sus hijos', () => {
    expect(positions.A.y).toBe((positions.A1.y + positions.A3.y) / 2);
  });

  it('criterio_6: hay una arista por cada par padre-hijo', () => {
    expect(edges).toEqual([
      { source: 'F', target: 'A' },
      { source: 'A', target: 'A1' },
      { source: 'A', target: 'A2' },
      { source: 'A', target: 'A3' },
      { source: 'F', target: 'B' },
    ]);
  });
});
