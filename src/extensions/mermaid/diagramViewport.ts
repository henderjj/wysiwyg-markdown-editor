// Pure zoom/pan math for the expanded diagram viewer.
//
// The viewer applies a single CSS transform to a wrapper element:
//
//   transform-origin: 0 0;
//   transform: translate(Xpx, Ypx) scale(S);
//
// `transform-origin: 0 0` with translate-then-scale makes the mapping a plain
// affine transform, `screen = translate + scale * content`, which is trivially
// invertible — that is what makes pointer-anchored zoom exact.
//
// Everything here is pure and DOM-free so it can be unit-tested.

export interface Viewport {
  /** Scale factor; 1 = the diagram's intrinsic viewBox size. */
  scale: number
  /** Horizontal translate in px, applied before the scale. */
  x: number
  /** Vertical translate in px, applied before the scale. */
  y: number
}

export interface Size {
  width: number
  height: number
}

export const MIN_SCALE = 0.1
export const MAX_SCALE = 8
/** Never magnify a small diagram more than this when fitting on open. */
export const MAX_FIT_SCALE = 2
/** Gap left around the diagram when fitting it to the viewport. */
export const FIT_PADDING = 24
/** Px moved per arrow-key press. */
export const KEY_PAN_STEP = 64
/** Multiplier per +/- key press. */
export const KEY_ZOOM_FACTOR = 1.2
/** Keep at least this much of the diagram on screen when panning. */
export const MIN_VISIBLE = 48

export const IDENTITY: Viewport = { scale: 1, x: 0, y: 0 }

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * Intrinsic pixel size of a rendered Mermaid SVG.
 *
 * Mermaid's default `useMaxWidth: true` emits `width="100%"` plus an inline
 * `max-width` and no height at all, so the attributes are useless — the size
 * has to come from the viewBox. Note the viewBox origin is non-zero (Mermaid
 * offsets it by the diagram padding), so only the third and fourth values are
 * the dimensions.
 */
export function parseSvgSize(svg: string): Size | null {
  const viewBox = /viewBox\s*=\s*"([^"]+)"/i.exec(svg)
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] }
    }
  }
  // Fall back to width/height attributes (present when useMaxWidth is off).
  const width = /\bwidth\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i.exec(svg)
  const height = /\bheight\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i.exec(svg)
  if (width && height && Number(width[1]) > 0 && Number(height[1]) > 0) {
    return { width: Number(width[1]), height: Number(height[1]) }
  }
  return null
}

/** Scale and centre a `content`-sized diagram inside a `view`-sized window. */
export function fitViewport(content: Size, view: Size, padding = FIT_PADDING): Viewport {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) {
    return IDENTITY
  }
  const availableWidth = Math.max(1, view.width - padding * 2)
  const availableHeight = Math.max(1, view.height - padding * 2)
  const raw = Math.min(availableWidth / content.width, availableHeight / content.height)
  const scale = clampScale(Math.min(raw, MAX_FIT_SCALE))
  return {
    scale,
    x: (view.width - content.width * scale) / 2,
    y: (view.height - content.height * scale) / 2,
  }
}

/**
 * Zoom by `factor` while keeping the content point under (px, py) fixed.
 * `px`/`py` are in viewport coordinates — px from the view element's top-left.
 *
 * The content point under the pointer is `c = (p - x) / scale`. Holding it there
 * at the new scale means `p = x' + scale' * c`, so `x' = p - (p - x) * scale'/scale`.
 * The ratio is recomputed from the *clamped* scale, not from `factor`, so the
 * diagram does not drift once it hits MIN_SCALE or MAX_SCALE.
 */
export function zoomAt(vp: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = clampScale(vp.scale * factor)
  const applied = scale / vp.scale
  return {
    scale,
    x: px - (px - vp.x) * applied,
    y: py - (py - vp.y) * applied,
  }
}

/** Zoom about the centre of a `view`-sized window — what keyboard/button zoom should do. */
export function zoomAtCentre(vp: Viewport, factor: number, view: Size): Viewport {
  return zoomAt(vp, factor, view.width / 2, view.height / 2)
}

const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 800
/** Largest wheel delta we honour, so one violent flick cannot zoom 40x. */
const MAX_WHEEL_DELTA = 200

/**
 * Convert a wheel event's delta into a zoom factor.
 *
 * Normalises `deltaMode` (Firefox reports lines, not pixels) and uses a gentler
 * curve for trackpad pinch, which arrives as a ctrl-modified wheel event with
 * much smaller deltas. Exponential so the curve is symmetric:
 * `f(d) * f(-d) === 1`, i.e. scrolling back undoes the zoom exactly.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0, pinch = false): number {
  const px = deltaMode === 1 ? deltaY * LINE_HEIGHT_PX : deltaMode === 2 ? deltaY * PAGE_HEIGHT_PX : deltaY
  const clamped = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, px))
  return Math.exp(-clamped * (pinch ? 0.01 : 0.0025))
}

export function panBy(vp: Viewport, dx: number, dy: number): Viewport {
  return { scale: vp.scale, x: vp.x + dx, y: vp.y + dy }
}

/** Stop the diagram being dragged entirely out of view. */
export function clampViewport(vp: Viewport, content: Size, view: Size, minVisible = MIN_VISIBLE): Viewport {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) return vp
  const scaledWidth = content.width * vp.scale
  const scaledHeight = content.height * vp.scale
  // Allow the smaller of minVisible and the diagram's own size, so a tiny
  // diagram is not forced half off-screen by a large minVisible.
  const keepX = Math.min(minVisible, scaledWidth)
  const keepY = Math.min(minVisible, scaledHeight)
  return {
    scale: vp.scale,
    x: Math.min(view.width - keepX, Math.max(keepX - scaledWidth, vp.x)),
    y: Math.min(view.height - keepY, Math.max(keepY - scaledHeight, vp.y)),
  }
}

const round = (n: number, dp: number) => Number(n.toFixed(dp))

/** Serialise to a CSS transform, rounded to avoid pointless subpixel churn. */
export function toTransform(vp: Viewport): string {
  return `translate(${round(vp.x, 2)}px, ${round(vp.y, 2)}px) scale(${round(vp.scale, 3)})`
}
