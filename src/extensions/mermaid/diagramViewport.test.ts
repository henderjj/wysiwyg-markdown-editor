import { describe, it, expect } from 'vitest'
import {
  clampScale,
  clampViewport,
  fitViewport,
  panBy,
  parseSvgSize,
  toTransform,
  wheelZoomFactor,
  zoomAt,
  zoomAtCentre,
  IDENTITY,
  MAX_FIT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  MIN_VISIBLE,
  type Viewport,
} from './diagramViewport'

// A real Mermaid flowchart SVG header: width="100%", an inline max-width, no
// height, and a viewBox with a non-zero origin.
const MERMAID_SVG =
  '<svg aria-roledescription="flowchart-v2" role="graphics-document document" ' +
  'viewBox="-8 -8 812.5 341" style="max-width: 812.5px;" xmlns="http://www.w3.org/2000/svg" ' +
  'width="100%" id="mmd-0"><g/></svg>'

describe('clampScale', () => {
  it('clamps below MIN_SCALE and above MAX_SCALE', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(1000)).toBe(MAX_SCALE)
  })

  it('passes mid-range values through untouched', () => {
    expect(clampScale(1)).toBe(1)
    expect(clampScale(2.5)).toBe(2.5)
  })

  it('falls back to 1 for non-finite input', () => {
    expect(clampScale(NaN)).toBe(1)
    expect(clampScale(Infinity)).toBe(1)
    expect(clampScale(-Infinity)).toBe(1)
  })
})

describe('parseSvgSize', () => {
  it('reads the dimensions from a real Mermaid viewBox, ignoring the non-zero origin', () => {
    expect(parseSvgSize(MERMAID_SVG)).toEqual({ width: 812.5, height: 341 })
  })

  it('accepts a comma-separated viewBox', () => {
    expect(parseSvgSize('<svg viewBox="0,0,100,50"/>')).toEqual({ width: 100, height: 50 })
  })

  it('falls back to width/height attributes when there is no viewBox', () => {
    expect(parseSvgSize('<svg width="640" height="480"/>')).toEqual({ width: 640, height: 480 })
    expect(parseSvgSize('<svg width="640px" height="480px"/>')).toEqual({ width: 640, height: 480 })
  })

  it('prefers the viewBox over a percentage width attribute', () => {
    // The width="100%" in MERMAID_SVG must not win, or the size would be garbage.
    expect(parseSvgSize(MERMAID_SVG)?.width).toBe(812.5)
  })

  it('returns null when there is no usable size', () => {
    expect(parseSvgSize('<svg/>')).toBeNull()
    expect(parseSvgSize('<svg viewBox="0 0 0 0"/>')).toBeNull()
    expect(parseSvgSize('<svg width="100%"/>')).toBeNull()
  })
})

describe('fitViewport', () => {
  it('scales an oversized diagram down and centres it', () => {
    const content = { width: 1000, height: 500 }
    const view = { width: 500, height: 500 }
    const vp = fitViewport(content, view)
    // Width is the binding constraint: (500 - 48) / 1000.
    expect(vp.scale).toBeCloseTo(0.452)
    expect(vp.x).toBeCloseTo((view.width - content.width * vp.scale) / 2)
    expect(vp.y).toBeCloseTo((view.height - content.height * vp.scale) / 2)
  })

  it('does not magnify a small diagram beyond MAX_FIT_SCALE', () => {
    const vp = fitViewport({ width: 100, height: 50 }, { width: 2000, height: 1000 })
    expect(vp.scale).toBe(MAX_FIT_SCALE)
  })

  it('clamps an enormous diagram at MIN_SCALE', () => {
    const vp = fitViewport({ width: 200000, height: 100000 }, { width: 800, height: 600 })
    expect(vp.scale).toBe(MIN_SCALE)
  })

  it('returns IDENTITY for degenerate sizes rather than NaN or Infinity', () => {
    expect(fitViewport({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual(IDENTITY)
    expect(fitViewport({ width: 100, height: 50 }, { width: 0, height: 0 })).toEqual(IDENTITY)
  })
})

describe('zoomAt', () => {
  const vp: Viewport = { scale: 0.75, x: -120, y: 40 }
  /** Content-space coordinate currently under the pointer. */
  const contentUnder = (v: Viewport, p: number, axis: 'x' | 'y') => (p - v[axis]) / v.scale

  it('keeps the content point under the pointer fixed when zooming in', () => {
    const next = zoomAt(vp, 1.35, 300, 220)
    expect(contentUnder(next, 300, 'x')).toBeCloseTo(contentUnder(vp, 300, 'x'))
    expect(contentUnder(next, 220, 'y')).toBeCloseTo(contentUnder(vp, 220, 'y'))
  })

  it('keeps the content point under the pointer fixed when zooming out', () => {
    const next = zoomAt(vp, 0.6, 300, 220)
    expect(contentUnder(next, 300, 'x')).toBeCloseTo(contentUnder(vp, 300, 'x'))
    expect(contentUnder(next, 220, 'y')).toBeCloseTo(contentUnder(vp, 220, 'y'))
  })

  it('stays anchored when the requested factor is clamped away', () => {
    // Regression guard: using `factor` instead of the applied ratio makes the
    // diagram drift every time the user keeps scrolling at the zoom limit.
    const atMax: Viewport = { scale: MAX_SCALE, x: -900, y: -400 }
    const next = zoomAt(atMax, 4, 300, 220)
    expect(next.scale).toBe(MAX_SCALE)
    expect(next.x).toBeCloseTo(atMax.x)
    expect(next.y).toBeCloseTo(atMax.y)
  })

  it('leaves the origin untouched when zooming at (0, 0)', () => {
    const next = zoomAt({ scale: 1, x: 0, y: 0 }, 2, 0, 0)
    expect(next).toEqual({ scale: 2, x: 0, y: 0 })
  })
})

describe('zoomAtCentre', () => {
  it('keeps the view centre fixed', () => {
    const view = { width: 800, height: 600 }
    const vp: Viewport = { scale: 1, x: 30, y: -10 }
    const next = zoomAtCentre(vp, 1.2, view)
    expect((400 - next.x) / next.scale).toBeCloseTo((400 - vp.x) / vp.scale)
    expect((300 - next.y) / next.scale).toBeCloseTo((300 - vp.y) / vp.scale)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on negative delta and out on positive delta', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('is symmetric, so scrolling back exactly undoes the zoom', () => {
    expect(wheelZoomFactor(120) * wheelZoomFactor(-120)).toBeCloseTo(1)
  })

  it('treats line-mode deltas as larger than pixel-mode deltas', () => {
    expect(wheelZoomFactor(-3, 1)).toBeGreaterThan(wheelZoomFactor(-3, 0))
  })

  it('clamps runaway deltas', () => {
    expect(wheelZoomFactor(100000)).toBe(wheelZoomFactor(200))
    expect(wheelZoomFactor(-100000)).toBe(wheelZoomFactor(-200))
  })

  it('is more sensitive for trackpad pinch', () => {
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false))
  })
})

describe('panBy', () => {
  it('adds the offsets and leaves the scale alone', () => {
    expect(panBy({ scale: 1.5, x: 10, y: 20 }, -5, 8)).toEqual({ scale: 1.5, x: 5, y: 28 })
  })
})

describe('clampViewport', () => {
  const content = { width: 1000, height: 800 }
  const view = { width: 600, height: 400 }

  it('leaves an in-bounds viewport untouched', () => {
    const vp: Viewport = { scale: 1, x: -100, y: -50 }
    expect(clampViewport(vp, content, view)).toEqual(vp)
  })

  it('stops the diagram being dragged off the left/top', () => {
    const clamped = clampViewport({ scale: 1, x: -5000, y: -5000 }, content, view)
    expect(clamped.x).toBe(MIN_VISIBLE - content.width)
    expect(clamped.y).toBe(MIN_VISIBLE - content.height)
  })

  it('stops the diagram being dragged off the right/bottom', () => {
    const clamped = clampViewport({ scale: 1, x: 5000, y: 5000 }, content, view)
    expect(clamped.x).toBe(view.width - MIN_VISIBLE)
    expect(clamped.y).toBe(view.height - MIN_VISIBLE)
  })

  it('never changes the scale', () => {
    expect(clampViewport({ scale: 3.25, x: 9999, y: 9999 }, content, view).scale).toBe(3.25)
  })

  it('accounts for the current scale when bounding', () => {
    const clamped = clampViewport({ scale: 0.5, x: -5000, y: 0 }, content, view)
    expect(clamped.x).toBe(MIN_VISIBLE - content.width * 0.5)
  })

  it('does not force a diagram smaller than minVisible off-screen', () => {
    const tiny = { width: 20, height: 20 }
    const clamped = clampViewport({ scale: 1, x: 5000, y: 5000 }, tiny, view)
    expect(clamped.x).toBe(view.width - 20)
    expect(clamped.y).toBe(view.height - 20)
  })

  it('passes degenerate sizes straight through', () => {
    const vp: Viewport = { scale: 1, x: 42, y: 42 }
    expect(clampViewport(vp, { width: 0, height: 0 }, view)).toEqual(vp)
  })
})

describe('toTransform', () => {
  it('emits translate-then-scale', () => {
    expect(toTransform({ scale: 1.5, x: 10.5, y: -20.25 })).toBe('translate(10.5px, -20.25px) scale(1.5)')
  })

  it('rounds away subpixel noise', () => {
    expect(toTransform({ scale: 1.23456789, x: 0.123456, y: 9.987654 })).toBe(
      'translate(0.12px, 9.99px) scale(1.235)'
    )
  })
})
