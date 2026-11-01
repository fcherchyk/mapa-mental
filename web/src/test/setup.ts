import '@testing-library/jest-dom/vitest';

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
}

// Configuration tests run in the `node` environment, without a DOM.
if (typeof HTMLElement !== 'undefined') stubLayoutApis();
