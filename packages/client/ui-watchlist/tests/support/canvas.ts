/**
 * The two browser APIs the chart library needs and jsdom does not implement: a
 * 2D canvas context and `ResizeObserver`. Both are inert recorders — the chart
 * only has to be able to draw, not to look right in a test.
 */

/** The subset of `CanvasRenderingContext2D` the library reaches for. */
const NOOP_METHODS = [
  'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill',
  'fillRect', 'strokeRect', 'clearRect', 'setTransform', 'resetTransform', 'translate',
  'scale', 'rotate', 'rect', 'clip', 'setLineDash', 'getLineDash', 'arc', 'arcTo',
  'fillText', 'strokeText', 'drawImage', 'putImageData', 'quadraticCurveTo',
  'bezierCurveTo', 'ellipse', 'roundRect',
] as const

/** One inert 2D context; the members the library reads return usable values. */
function context(): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    canvas: { width: 0, height: 0 },
  }
  for (const name of NOOP_METHODS) ctx[name] = () => {}
  return ctx
}

/**
 * Install the canvas and resize-observer stubs on the current jsdom document.
 * @returns nothing; the stubs live for the rest of the file's environment.
 */
export function installCanvas(): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => context(),
    configurable: true,
  })
  const observer = class {
    /** @returns nothing; nothing in a chart test observes a resize. */
    observe(): void {}
    /** @returns nothing. */
    unobserve(): void {}
    /** @returns nothing. */
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', { value: observer, configurable: true })
}
