import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TitleEditor } from './TitleEditor';

describe('TitleEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('feedback 1: focuses the field even if the first attempts fail (the new node is still hidden)', async () => {
    const realFocus = HTMLElement.prototype.focus;
    let attempts = 0;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      options?: FocusOptions,
    ) {
      attempts += 1;
      if (attempts > 2) realFocus.call(this, options);
    });

    render(<TitleEditor initialTitle="" onCommit={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus());
    expect(attempts).toBeGreaterThan(2);
  });
});
