import { describe, expect, it } from 'vitest';
import type { NodeOut } from '../api/client';
import {
  columnsOf,
  insertCard,
  moveCard,
  placeBeside,
  placeForGap,
  statusBeside,
} from './boardOrder';

// Supporting tests for the board's pure rules (slice 4B).

const task = (id: string, status = 'to_do'): NodeOut => ({
  id,
  parent_id: 'f',
  kind: 'task',
  title: id.toUpperCase(),
  sort_key: id,
  collapsed: false,
  props: { status, checklist: [] },
  version: 1,
  child_count: 0,
});

const ids = (tasks: NodeOut[]) => tasks.map((t) => t.id);

describe('columnsOf', () => {
  it('splits by status and keeps the list order inside each column', () => {
    const columns = columnsOf([task('a', 'done'), task('b'), task('c', 'done'), task('d')]);
    expect(ids(columns.to_do)).toEqual(['b', 'd']);
    expect(ids(columns.in_progress)).toEqual([]);
    expect(ids(columns.done)).toEqual(['a', 'c']);
  });
});

describe('statusBeside', () => {
  it('walks the columns and stops at the edges', () => {
    expect(statusBeside('to_do', 1)).toBe('in_progress');
    expect(statusBeside('in_progress', -1)).toBe('to_do');
    expect(statusBeside('done', 1)).toBeNull();
    expect(statusBeside('to_do', -1)).toBeNull();
  });
});

describe('placeForGap', () => {
  const abc = [task('a'), task('b'), task('c')];

  it('names the card above the gap, or the first card for the top gap', () => {
    expect(placeForGap(abc, 0, 'x')).toEqual({ before_id: 'a' });
    expect(placeForGap(abc, 2, 'x')).toEqual({ after_id: 'b' });
    expect(placeForGap(abc, 3, 'x')).toEqual({ after_id: 'c' });
  });

  it('skips the dragged card when it is in the same column', () => {
    expect(placeForGap(abc, 3, 'a')).toEqual({ after_id: 'c' });
    expect(placeForGap(abc, 0, 'c')).toEqual({ before_id: 'a' });
    expect(placeForGap(abc, 1, 'c')).toEqual({ after_id: 'a' });
  });

  it('is undefined on the two gaps around the card and null in an empty column', () => {
    expect(placeForGap(abc, 1, 'b')).toBeUndefined();
    expect(placeForGap(abc, 2, 'b')).toBeUndefined();
    expect(placeForGap([], 0, 'b')).toBeNull();
    expect(placeForGap([task('b')], 0, 'b')).toBeUndefined();
  });
});

describe('placeBeside', () => {
  const abc = [task('a'), task('b'), task('c')];

  it('names the neighbour above or below, and nothing at the edges', () => {
    expect(placeBeside(abc, 'b', -1)).toEqual({ before_id: 'a' });
    expect(placeBeside(abc, 'b', 1)).toEqual({ after_id: 'c' });
    expect(placeBeside(abc, 'a', -1)).toBeUndefined();
    expect(placeBeside(abc, 'c', 1)).toBeUndefined();
    expect(placeBeside(abc, 'zz', 1)).toBeUndefined();
  });
});

describe('moveCard', () => {
  const list = [task('a'), task('b', 'done'), task('c')];

  it('changes the status in place when there is no place', () => {
    const moved = moveCard(list, 'a', 'done', null);
    expect(ids(moved)).toEqual(['a', 'b', 'c']);
    expect(moved[0].props.status).toBe('done');
  });

  it('moves the card right before or after the anchor in the global list', () => {
    expect(ids(moveCard(list, 'a', 'to_do', { after_id: 'c' }))).toEqual(['b', 'c', 'a']);
    expect(ids(moveCard(list, 'c', 'done', { before_id: 'a' }))).toEqual(['c', 'a', 'b']);
  });

  it('leaves the list alone for an unknown card and keeps the position for an unknown anchor', () => {
    expect(moveCard(list, 'zz', 'done', null)).toBe(list);
    expect(ids(moveCard(list, 'a', 'done', { after_id: 'zz' }))).toEqual(['a', 'b', 'c']);
  });
});

describe('insertCard', () => {
  it('inserts after the given card, or at the end', () => {
    const list = [task('a'), task('b')];
    expect(ids(insertCard(list, task('n'), 'a'))).toEqual(['a', 'n', 'b']);
    expect(ids(insertCard(list, task('n'), null))).toEqual(['a', 'b', 'n']);
    expect(ids(insertCard(list, task('n'), 'zz'))).toEqual(['a', 'b', 'n']);
  });
});
