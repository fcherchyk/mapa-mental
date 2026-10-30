import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TitleEditor } from './TitleEditor';

describe('TitleEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('feedback 1: enfoca el campo aunque los primeros intentos fallen (el nodo nuevo todavía está oculto)', async () => {
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

    await waitFor(() => expect(screen.getByLabelText('Título')).toHaveFocus());
    expect(attempts).toBeGreaterThan(2);
  });
});
