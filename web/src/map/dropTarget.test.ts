import { describe, expect, it } from 'vitest';
import { FakeApi } from '../test/fakeApi';
import { sampleTree } from '../test/renderApp';
import { gapSlots, isDraggable, isUsefulTarget, placeFor, type DropTarget } from './dropTarget';
import { layoutTree, NODE_HEIGHT } from './layout';
import { fromView, visibleChildren, type MapState } from './tree';

/** The window of `focusId` as the SPA holds it, from the same fake API the other tests use. */
function windowOf(focusId = 'f', depth = 3): MapState {
  return fromView(new FakeApi(sampleTree()).view(focusId, depth), depth);
}

function positionsOf(state: MapState) {
  return layoutTree(state.focusId, (id) => visibleChildren(state, id)).positions;
}

const child = (parentId: string): DropTarget => ({ kind: 'child', parentId });
const gap = (parentId: string, afterId: string | null): DropTarget => ({
  kind: 'sibling',
  parentId,
  afterId,
});

describe('what can be dragged', () => {
  it('S2_FE_AC1: every node can be dragged but the focus, the real root and the one being edited', () => {
    const state = windowOf();
    expect(isDraggable(state, 'a', null)).toBe(true);
    expect(isDraggable(state, 'a1', null)).toBe(true);
    // The focus is the window's own root: its parent is not on the canvas.
    expect(isDraggable(state, 'f', null)).toBe(false);
    expect(isDraggable(state, 'a', 'a')).toBe(false);
    expect(isDraggable(windowOf('root'), 'root', null)).toBe(false);
  });

  it('S2_FE_AC1: a pending node is not draggable', () => {
    const state = windowOf();
    const pending = { ...state, nodes: { ...state.nodes, a: { ...state.nodes.a, pending: true } } };
    expect(isDraggable(pending, 'a', null)).toBe(false);
  });
});

describe('which drops are allowed', () => {
  it('S2_FE_AC2: dropping on a node appends it there, and becomes place "last"', () => {
    const state = windowOf();
    expect(isUsefulTarget(state, 'b', child('a'))).toBe(true);
    expect(placeFor(child('a'))).toBe('last');
  });

  it('S2_FE_AC2: a gap becomes place "first" or an after_id', () => {
    expect(placeFor(gap('f', null))).toBe('first');
    expect(placeFor(gap('f', 'a'))).toEqual({ after_id: 'a' });
  });

  it('S2_FE_AC8: a node cannot be dropped on itself or on its own descendants', () => {
    const state = windowOf();
    expect(isUsefulTarget(state, 'a', child('a'))).toBe(false);
    expect(isUsefulTarget(state, 'a', child('a1'))).toBe(false);
  });

  it('S2_FE_AC8: dropping on the parent it already sits last in changes nothing', () => {
    const state = windowOf();
    // Under f the order is a, b: b is already last.
    expect(isUsefulTarget(state, 'b', child('f'))).toBe(false);
    expect(isUsefulTarget(state, 'a', child('f'))).toBe(true);
  });

  it('S2_FE_AC8: the gaps touching the node leave it where it is', () => {
    const state = windowOf();
    // Order a, b. For a: the gap before a and the gap after a are both no-ops.
    expect(isUsefulTarget(state, 'a', gap('f', null))).toBe(false);
    expect(isUsefulTarget(state, 'a', gap('f', 'a'))).toBe(false);
    expect(isUsefulTarget(state, 'a', gap('f', 'b'))).toBe(true);
    expect(isUsefulTarget(state, 'b', gap('f', null))).toBe(true);
  });

  it('S2_FE_AC3: a gap only exists among the dragged node is own siblings', () => {
    const state = windowOf();
    // a1 belongs to a, so a gap under f is not offered to it: that would be a reparent.
    expect(isUsefulTarget(state, 'a1', gap('f', 'a'))).toBe(false);
    expect(isUsefulTarget(state, 'a1', gap('a', 'a2'))).toBe(true);
  });

  it('S2_FE_AC8: the focus and the real root cannot be moved', () => {
    expect(isUsefulTarget(windowOf(), 'f', child('a'))).toBe(false);
    expect(isUsefulTarget(windowOf('root'), 'root', child('f'))).toBe(false);
  });
});

describe('where the insertion lines go', () => {
  it('S2_FE_AC3: dragging a node offers only the gaps that would move it', () => {
    const state = windowOf();
    const positions = positionsOf(state);

    const slots = gapSlots(state, 'a', positions);

    // Order a, b: for a only the gap after b is a real move.
    expect(slots.map((slot) => slot.afterId)).toEqual(['b']);
    expect(gapSlots(state, 'b', positions).map((slot) => slot.afterId)).toEqual([null]);
  });

  it('S2_FE_AC3: a gap sits between the two siblings it separates, in their column', () => {
    const state = windowOf();
    const positions = positionsOf(state);

    const [slot] = gapSlots(state, 'a2', positions);

    expect(slot.afterId).toBe(null);
    expect(slot.position.x).toBe(positions.a1.x);
    expect(slot.position.y).toBeLessThan(positions.a1.y);
  });

  it('S2_FE_AC3: a gap between two siblings lands between their boxes', () => {
    const state = windowOf('root', 1);
    expect(gapSlots(state, 'f', positionsOf(state))).toEqual([]);

    const deep = windowOf();
    const positions = positionsOf(deep);
    const [afterA1] = gapSlots(deep, 'a2', positions).filter((slot) => slot.afterId === 'a1');
    expect(afterA1).toBeUndefined();

    const slots = gapSlots(deep, 'a1', positions);
    const afterA2 = slots.find((slot) => slot.afterId === 'a2');
    expect(afterA2?.position.y).toBeGreaterThan(positions.a2.y + NODE_HEIGHT - 1);
  });
});
