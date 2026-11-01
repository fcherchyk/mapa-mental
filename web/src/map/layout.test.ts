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

describe('horizontal tree layout', () => {
  const { positions, edges } = layoutTree('F', (id) => children[id] ?? []);

  it('criterion_6: x grows with the level and the same level shares x', () => {
    expect(positions.F.x).toBeLessThan(positions.A.x);
    expect(positions.A.x).toBe(positions.B.x);
    expect(positions.A.x).toBeLessThan(positions.A1.x);
    expect(new Set(['A1', 'A2', 'A3'].map((id) => positions[id].x)).size).toBe(1);
  });

  it('criterion_6: A sits above B and the subtrees do not overlap', () => {
    expect(positions.A.y).toBeLessThan(positions.B.y);
    const subtreeA = ['A', 'A1', 'A2', 'A3'].map((id) => positions[id].y);
    expect(Math.max(...subtreeA) + NODE_HEIGHT).toBeLessThanOrEqual(positions.B.y);
    const leaves = ['A1', 'A2', 'A3', 'B'].map((id) => positions[id].y);
    leaves.slice(1).forEach((y, i) => expect(y - leaves[i]).toBeGreaterThanOrEqual(NODE_HEIGHT));
  });

  it('criterion_6: a parent is centered between its children', () => {
    expect(positions.A.y).toBe((positions.A1.y + positions.A3.y) / 2);
  });

  it('criterion_6: there is one edge per parent-child pair', () => {
    expect(edges).toEqual([
      { source: 'F', target: 'A' },
      { source: 'A', target: 'A1' },
      { source: 'A', target: 'A2' },
      { source: 'A', target: 'A3' },
      { source: 'F', target: 'B' },
    ]);
  });
});
