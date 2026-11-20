import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom does not measure the DOM nor ship ResizeObserver; React Flow needs both to draw.
class ResizeObserverStub {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

class DOMMatrixReadOnlyStub {
  m22: number;

  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number(scale);
  }
}

function stubLayoutApis(): void {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.DOMMatrixReadOnly = DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;

  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      get(this: HTMLElement) {
        return parseFloat(this.style.height) || 600;
      },
    },
    offsetWidth: {
      get(this: HTMLElement) {
        return parseFloat(this.style.width) || 800;
      },
    },
  });

  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;

  // ProseMirror scrolls the cursor into view after some edits (a list item nested by Tab), and
  // measures ranges for it; jsdom has no layout, so the measures are empty.
  const emptyRect = () => new DOMRect(0, 0, 0, 0);
  Range.prototype.getBoundingClientRect = emptyRect;
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
}

// Configuration tests run in the `node` environment, without a DOM.
if (typeof HTMLElement !== 'undefined') stubLayoutApis();

/**
 * Node 25 defines its own `localStorage`, without methods unless it gets `--localstorage-file`,
 * and it hides jsdom's. The document editor remembers its mode there (slice 5, decision D4).
 */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

if (typeof globalThis.localStorage?.setItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: new MemoryStorage(),
  });
}

if (typeof globalThis.localStorage?.clear === 'function') {
  afterEach(() => globalThis.localStorage.clear());
}
