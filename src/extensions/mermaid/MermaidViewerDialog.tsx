import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadMermaid, nextMermaidRenderId } from './mermaidLoader'
import {
  clampViewport,
  fitViewport,
  panBy,
  parseSvgSize,
  toTransform,
  wheelZoomFactor,
  zoomAt,
  zoomAtCentre,
  IDENTITY,
  KEY_PAN_STEP,
  KEY_ZOOM_FACTOR,
  type Size,
  type Viewport,
} from './diagramViewport'

interface MermaidViewerDialogProps {
  /** Diagram source, or null when the viewer is closed. */
  source: string | null
  onClose: () => void
  /** Focus target used when the element that opened the viewer is gone. */
  onFallbackFocus?: () => void
}

type Status = 'loading' | 'ready' | 'empty' | 'error'

function isDarkMode() {
  return document.documentElement.classList.contains('dark')
}

function ToolbarButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void
  label: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

/**
 * Full-window viewer for a single Mermaid diagram, with wheel zoom and drag pan.
 *
 * Owned by the Editor component rather than by MermaidNodeView: the node view
 * lives inside ProseMirror's contentEditable subtree, where a modal would fight
 * ProseMirror for selection and keys, inherit the editor's font-size zoom, and
 * be subject to the `.ProseMirror .mermaid-svg svg { max-width: 100% }` rule
 * that makes transform-based zoom impossible.
 */
export function MermaidViewerDialog({ source, onClose, onFallbackFocus }: MermaidViewerDialogProps) {
  const [status, setStatus] = useState<Status>('loading')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [contentSize, setContentSize] = useState<Size | null>(null)
  const [viewport, setViewport] = useState<Viewport>(IDENTITY)
  const [dragging, setDragging] = useState(false)
  const [themeTick, setThemeTick] = useState(0)

  const panelRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Mirrors `viewport` so the drag/wheel handlers read the latest value without
  // being re-created (and re-bound) on every frame.
  const viewportRef = useRef<Viewport>(IDENTITY)
  const contentSizeRef = useRef<Size | null>(null)
  // Set once the user zooms or pans, so a resize or theme re-render stops
  // overriding their chosen view.
  const userAdjustedRef = useRef(false)
  const detachDragRef = useRef<(() => void) | null>(null)
  const triggerRef = useRef<Element | null>(null)

  const isOpen = source !== null

  const measureView = useCallback((): Size => {
    const rect = viewRef.current?.getBoundingClientRect()
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 }
  }, [])

  const applyViewport = useCallback((next: Viewport, userInitiated = true) => {
    const size = contentSizeRef.current
    const clamped = size ? clampViewport(next, size, measureView()) : next
    viewportRef.current = clamped
    if (userInitiated) userAdjustedRef.current = true
    setViewport(clamped)
  }, [measureView])

  const fitToView = useCallback(() => {
    const size = contentSizeRef.current
    if (!size) return
    const next = fitViewport(size, measureView())
    viewportRef.current = next
    userAdjustedRef.current = false
    setViewport(next)
  }, [measureView])

  // Remember what had focus so it can be restored on close.
  useEffect(() => {
    if (isOpen) triggerRef.current = document.activeElement
  }, [isOpen])

  // Reset per-diagram state when a new diagram is opened.
  useEffect(() => {
    if (!isOpen) return
    setSvg('')
    setContentSize(null)
    contentSizeRef.current = null
    userAdjustedRef.current = false
  }, [source, isOpen])

  // Render the diagram. Deliberately a fresh mermaid.render() rather than
  // reusing the node view's SVG string: mermaid prefixes its marker/clipPath ids
  // with the render id and references them via url(#...), which resolves to the
  // first match in the document — so a duplicated string would make this
  // diagram's arrowheads depend on the inline copy staying mounted.
  useEffect(() => {
    if (source === null) return
    const code = source.trim()
    if (!code) {
      setStatus('empty')
      return
    }
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const mermaid = await loadMermaid()
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDarkMode() ? 'dark' : 'default',
        })
        const { svg: rendered } = await mermaid.render(nextMermaidRenderId(), code)
        if (cancelled) return
        const size = parseSvgSize(rendered)
        contentSizeRef.current = size
        setContentSize(size)
        setSvg(rendered)
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [source, themeTick])

  // Follow the app theme, matching MermaidNodeView.
  useEffect(() => {
    if (!isOpen) return
    const observer = new MutationObserver(() => setThemeTick((t) => t + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [isOpen])

  // Mermaid emits width="100%" + an inline max-width and no height at all, so
  // the injected <svg> has to be given its intrinsic pixel size before any
  // transform math means anything.
  useLayoutEffect(() => {
    if (!svg || !contentSize) return
    const svgEl = stageRef.current?.querySelector('svg')
    if (!svgEl) return
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
    svgEl.style.maxWidth = 'none'
    svgEl.style.width = `${contentSize.width}px`
    svgEl.style.height = `${contentSize.height}px`
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    // Keep the user's view across a theme re-render; only fit on a fresh open.
    if (!userAdjustedRef.current) fitToView()
  }, [svg, contentSize, fitToView])

  // Move focus into the dialog so its key handlers are live immediately.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  // Refit on window resize, unless the user has taken control of the view.
  useEffect(() => {
    if (!isOpen) return
    const handler = () => {
      if (!userAdjustedRef.current) fitToView()
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [isOpen, fitToView])

  const handleClose = useCallback(() => {
    const trigger = triggerRef.current
    onClose()
    // Restore focus rather than dropping it on <body>.
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    else onFallbackFocus?.()
  }, [onClose, onFallbackFocus])

  // Wheel zoom. Registered natively with { passive: false } because React
  // attaches `wheel` as a passive root listener, where preventDefault() is
  // ignored. stopPropagation() also keeps the event away from App.tsx's
  // window-level Ctrl+wheel handler, which would otherwise resize the document
  // font behind the dialog.
  useEffect(() => {
    const el = panelRef.current
    if (!el || !isOpen) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const rect = viewRef.current?.getBoundingClientRect()
      if (!rect || !contentSizeRef.current) return
      const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)
      applyViewport(zoomAt(viewportRef.current, factor, e.clientX - rect.left, e.clientY - rect.top))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [isOpen, applyViewport])

  // Drag to pan, following the DocumentMap resize-handle pattern. The detach
  // function is held in a ref so an unmount mid-drag still cleans up.
  useEffect(() => () => detachDragRef.current?.(), [])

  const startPan = (e: React.MouseEvent) => {
    if (e.button !== 0 || status !== 'ready') return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const base = viewportRef.current

    const onMove = (ev: MouseEvent) => {
      applyViewport(panBy(base, ev.clientX - startX, ev.clientY - startY))
    }
    const detach = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', detach)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      detachDragRef.current = null
      setDragging(false)
    }
    detachDragRef.current = detach
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', detach)
    setDragging(true)
  }

  // Keyboard pan/zoom, plus modal key isolation.
  //
  // Registered on `window` in the capture phase, not as a React onKeyDown, for
  // two reasons: it fires before App.tsx's window-level shortcut handler
  // (App.tsx:1158) so `stopPropagation()` actually keeps those shortcuts inert,
  // and it keeps working if focus drifts out of the panel (the dialog does not
  // trap focus).
  //
  // Tab is left completely alone so focus can still leave (WCAG 2.1.2 — no
  // keyboard trap), and unmodified keys we do not own are left alone too, so
  // Enter/Space still activate a focused toolbar button.
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return

      // Anything App.tsx would act on is swallowed while the dialog is open.
      const appWouldHandle = e.ctrlKey || e.metaKey || e.key === 'F1' || e.key === 'F5'

      if (appWouldHandle) {
        e.stopPropagation()
        // Also suppress the app/browser zoom triple, so the only thing that
        // zooms while the viewer is open is the viewer.
        if (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_' || e.key === '0') {
          e.preventDefault()
        }
        return
      }

      const view = measureView()
      const step = e.shiftKey ? KEY_PAN_STEP * 3 : KEY_PAN_STEP

      switch (e.key) {
        case 'Escape':
          handleClose()
          break
        case '+':
        case '=':
          applyViewport(zoomAtCentre(viewportRef.current, KEY_ZOOM_FACTOR, view))
          break
        case '-':
        case '_':
          applyViewport(zoomAtCentre(viewportRef.current, 1 / KEY_ZOOM_FACTOR, view))
          break
        case '0':
          fitToView()
          break
        case 'ArrowLeft':
          applyViewport(panBy(viewportRef.current, step, 0))
          break
        case 'ArrowRight':
          applyViewport(panBy(viewportRef.current, -step, 0))
          break
        case 'ArrowUp':
          applyViewport(panBy(viewportRef.current, 0, step))
          break
        case 'ArrowDown':
          applyViewport(panBy(viewportRef.current, 0, -step))
          break
        default:
          return
      }

      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen, applyViewport, fitToView, handleClose, measureView])

  if (!isOpen) return null

  const zoomPercent = Math.round(viewport.scale * 100)
  const canZoom = status === 'ready' && contentSize !== null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 dark:bg-black/75" onMouseDown={handleClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Expanded diagram viewer"
        aria-describedby="mermaid-viewer-hint"
        tabIndex={-1}
        className="relative flex flex-col w-[94vw] h-[92vh] rounded-lg shadow-xl outline-none bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Diagram</h2>
          <div className="flex items-center gap-1">
            <ToolbarButton
              label="Zoom out"
              disabled={!canZoom}
              onClick={() => applyViewport(zoomAtCentre(viewportRef.current, 1 / KEY_ZOOM_FACTOR, measureView()))}
            >
              −
            </ToolbarButton>
            <span
              aria-live="polite"
              className="min-w-[52px] text-center text-xs font-medium text-gray-600 dark:text-gray-300 tabular-nums"
            >
              {canZoom ? `${zoomPercent}%` : '—'}
            </span>
            <ToolbarButton
              label="Zoom in"
              disabled={!canZoom}
              onClick={() => applyViewport(zoomAtCentre(viewportRef.current, KEY_ZOOM_FACTOR, measureView()))}
            >
              +
            </ToolbarButton>
            <ToolbarButton label="Fit to window" disabled={!canZoom} onClick={fitToView}>
              ⤢
            </ToolbarButton>
            <ToolbarButton label="Close diagram viewer" onClick={handleClose}>
              ×
            </ToolbarButton>
          </div>
        </div>

        <div
          ref={viewRef}
          onMouseDown={startPan}
          className={`mermaid-viewer-view flex-1 min-h-0 relative overflow-hidden ${
            status === 'ready' ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          {status === 'error' ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-2xl text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-3 font-mono whitespace-pre-wrap">
                <strong>Diagram error</strong>
                {'\n'}
                {error}
              </div>
            </div>
          ) : status === 'empty' ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 select-none">
              Empty diagram — nothing to show.
            </div>
          ) : status === 'loading' ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 select-none">
              Rendering diagram…
            </div>
          ) : (
            <div
              ref={stageRef}
              className="mermaid-viewer-stage"
              style={{ transform: toTransform(viewport) }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>

        <p
          id="mermaid-viewer-hint"
          className="mermaid-viewer-hint flex-shrink-0 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700"
        >
          Drag to pan · Scroll to zoom · Arrow keys pan · <kbd>+</kbd> / <kbd>−</kbd> zoom · <kbd>0</kbd> fit ·{' '}
          <kbd>Esc</kbd> close
        </p>
      </div>
    </div>
  )
}
