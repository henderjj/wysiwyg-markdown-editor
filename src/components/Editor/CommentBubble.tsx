import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { autoUpdate, computePosition, offset, flip, shift, hide } from '@floating-ui/dom'
import type { ReferenceElement } from '@floating-ui/dom'
import { parseCommentMeta } from '../../extensions/critic-markup/commentMeta'

type CommentBubbleProps = {
  /** The commented element, or a virtual element for a range/caret being commented on */
  reference: ReferenceElement
  /** Keeps the bubble inside the editor pane when flipping/shifting */
  boundary: HTMLElement | null
  onMouseEnter?: () => void
  onMouseLeave?: () => void
} & (
  | { mode: 'view'; comment: string; onEdit: () => void; onDelete: () => void }
  | { mode: 'add'; target: 'selection' | 'cursor'; onSubmit: (body: string) => void; onCancel: () => void }
  | { mode: 'edit'; comment: string | null; onSubmit: (body: string) => void; onCancel: () => void }
)

/**
 * Review-comment bubble: shows a comment with edit/delete buttons, or takes
 * the comment text directly when adding or editing.
 *
 * Positioned with floating-ui against the commented element itself (not a
 * rect snapshot), so hover and caret use the same anchor, it follows the text
 * while scrolling, flips above near the bottom of the pane, and hides once the
 * text scrolls out of view.
 *
 * Give it a `key` per session: editing state is initialised on mount only.
 */
export function CommentBubble(props: CommentBubbleProps) {
  const { reference, boundary, mode } = props
  const floatingRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; hidden: boolean } | null>(null)
  const existing = mode === 'add' ? null : props.comment === null ? null : parseCommentMeta(props.comment)
  const [draft, setDraft] = useState(mode === 'edit' ? existing?.body ?? '' : '')
  const inputId = useId()
  const hintId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Not autoFocus: the bubble stays visibility:hidden until its first
  // position is computed, and a hidden input silently refuses focus. Caret
  // goes to the end so an edit continues from where the comment finishes.
  const placed = pos !== null && !pos.hidden
  useEffect(() => {
    const el = inputRef.current
    if (!placed || !el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [placed])

  // Grow the textarea to fit its (wrapped) text so a long comment can be read
  // whole, up to a cap after which it scrolls. `style.height` is never set by
  // React here, so this imperative write sticks across re-renders.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = Math.round(window.innerHeight * 0.4)
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [draft, placed])

  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!floating) return
    const clip = boundary ?? 'clippingAncestors'
    return autoUpdate(reference, floating, () => {
      computePosition(reference, floating, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
          offset(6),
          flip({ boundary: clip, padding: 8 }),
          shift({ boundary: clip, padding: 8 }),
          hide(),
        ],
      }).then(({ x, y, middlewareData }) => {
        const hidden = !!middlewareData.hide?.referenceHidden
        setPos((prev) => prev && prev.x === x && prev.y === y && prev.hidden === hidden ? prev : { x, y, hidden })
      })
    })
  }, [reference, boundary])

  // Buttons must not take focus: in view mode the editor keeps its caret (and
  // so the caret-driven bubble stays open); in edit mode the input keeps focus.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  const style: React.CSSProperties = {
    left: pos?.x ?? 0,
    top: pos?.y ?? 0,
    visibility: !pos || pos.hidden ? 'hidden' : 'visible',
  }
  const shell = 'fixed z-40 w-72 max-w-[calc(100vw-16px)] rounded-lg border shadow-lg text-sm overflow-hidden ' +
    'bg-amber-100 border-amber-400 text-gray-900 dark:bg-gray-700 dark:border-amber-500/60 dark:text-gray-100'
  const byline = existing && [existing.author, existing.timestamp].filter(Boolean).join(' · ')

  if (mode === 'view') {
    return (
      <div
        ref={floatingRef}
        style={style}
        className={shell}
        role="group"
        aria-label="Comment"
        aria-live="polite"
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
      >
        {/* Header: byline and buttons share a row, so the text below gets the
            bubble's full width. */}
        <div className="flex items-center gap-2 pl-3 pr-1.5 pt-1">
          <div className="flex-1 min-w-0 truncate text-xs font-medium text-amber-800 dark:text-amber-300" title={byline || undefined}>
            {byline}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <IconButton label="Edit comment (Ctrl+Shift+M)" onMouseDown={keepFocus} onClick={props.onEdit}>
              <PencilIcon />
            </IconButton>
            <IconButton label="Delete comment" onMouseDown={keepFocus} onClick={props.onDelete} danger>
              <TrashIcon />
            </IconButton>
          </div>
        </div>
        {/* Long comments scroll rather than run off-screen (same 40vh cap as the
            edit textarea; the pointer can move onto the bubble to scroll it).
            The padding is inside the scroller so its scrollbar sits flush with
            the bubble's right edge. */}
        <div className="px-3 pb-2 whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto overscroll-contain">
          {existing?.body || <span className="italic text-gray-500 dark:text-gray-400">(empty comment)</span>}
        </div>
      </div>
    )
  }

  const { onSubmit, onCancel } = props
  const submit = () => {
    if (draft.trim()) onSubmit(draft)
  }
  const label = mode === 'edit' ? 'Edit comment' : props.target === 'cursor' ? 'Insert comment' : 'Add comment'

  return (
    <div
      ref={floatingRef}
      style={style}
      className={shell.replace('w-72', 'w-80')}
      role="dialog"
      aria-label={label}
      onBlur={(e) => {
        // Clicking elsewhere cancels. Checked after the focus move settles, and
        // against activeElement rather than relatedTarget, so switching to
        // another window (which blurs without moving activeElement) keeps the draft.
        const container = e.currentTarget
        setTimeout(() => {
          if (container.isConnected && !container.contains(document.activeElement) && document.hasFocus()) onCancel()
        }, 0)
      }}
    >
      <div className="px-3 pt-2 pb-2">
        {byline && <div className="text-xs font-medium text-amber-800 dark:text-amber-300 mb-1">{byline}</div>}
        <label htmlFor={inputId} className="sr-only">{label}</label>
        {/* A textarea only so long comments wrap and can be read whole — the
            stored comment is one line (CriticMarkup advises against newlines
            inside its tags), so Enter saves, Shift+Enter is swallowed, and
            pasted line breaks become spaces. The hint says so. */}
        <textarea
          id={inputId}
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[ \t]*\r?\n[ \t]*/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!e.shiftKey) submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            }
          }}
          aria-describedby={hintId}
          enterKeyHint="done"
          placeholder={mode === 'edit' ? 'Comment' : 'Add a comment…'}
          className="block w-full resize-none px-2 py-1 rounded-sm border border-amber-400 dark:border-gray-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 leading-snug break-words focus:outline-2 focus:outline-blue-500"
        />
        <div className="flex items-center gap-1 mt-1">
          <p id={hintId} className="flex-1 text-xs text-gray-600 dark:text-gray-400">
            Enter to save · Esc to cancel · no line breaks
          </p>
          <IconButton label="Save comment (Enter)" onMouseDown={keepFocus} onClick={submit} disabled={!draft.trim()}>
            <CheckIcon />
          </IconButton>
          <IconButton label="Cancel (Escape)" onMouseDown={keepFocus} onClick={onCancel}>
            <XIcon />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, onClick, onMouseDown, disabled, danger, children }: {
  label: string
  onClick: () => void
  onMouseDown: (e: React.MouseEvent) => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={onMouseDown}
      disabled={disabled}
      className={`p-1 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${danger
        ? 'text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-300 dark:hover:text-red-400 dark:hover:bg-gray-600'
        : 'text-gray-500 hover:text-gray-900 hover:bg-amber-200 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-600'}`}
    >
      {children}
    </button>
  )
}

const iconProps = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
}

function PencilIcon() {
  return <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
}

function TrashIcon() {
  return <svg {...iconProps}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
}

function CheckIcon() {
  return <svg {...iconProps}><path d="M20 6 9 17l-5-5" /></svg>
}

function XIcon() {
  return <svg {...iconProps}><path d="M18 6 6 18M6 6l12 12" /></svg>
}
