import { Mark, Node, Extension, mergeAttributes, getMarkRange } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { parseCommentMeta } from './commentMeta'

/**
 * CriticMarkup review comments (issue #48).
 *
 *   {==text==}{>>comment<<}  → criticHighlight mark with a `comment` attribute
 *   {==text==}               → criticHighlight mark, comment = null
 *   {>>comment<<}            → criticComment inline atom node (💬 marker)
 *
 * Markdown import/export lives in markdownParser.ts (parseInline) and
 * markdown.ts (the criticHighlight/criticComment Turndown rules). The comment
 * string is stored verbatim; see commentMeta.ts for the metadata prefix.
 */

export const CriticHighlight = Mark.create({
  name: 'criticHighlight',

  // Above Link (1000) so this is the outermost mark: a comment spanning bold
  // or link text then serializes as ONE <mark>, not a <mark> per text run —
  // which would export as several separate comments.
  priority: 1100,

  // Typing at either edge of a comment must not extend it.
  inclusive: false,

  addAttributes() {
    return {
      comment: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-comment'),
        renderHTML: (attributes) =>
          attributes.comment === null ? {} : { 'data-comment': attributes.comment },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'mark.critic-comment' },
      { tag: 'mark.critic-highlight' },
      { tag: 'mark[data-comment]' },
    ]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const cls = mark.attrs.comment === null ? 'critic-highlight' : 'critic-comment'
    return ['mark', mergeAttributes({ class: cls }, HTMLAttributes), 0]
  },
})

export const CriticComment = Node.create({
  name: 'criticComment',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      comment: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-critic-comment') ?? '',
        renderHTML: (attributes) => ({ 'data-critic-comment': attributes.comment }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-critic-comment]' }]
  },

  // The 💬 text child is load-bearing: Turndown's blank rule drops elements
  // with no text before any custom rule sees them, which would silently lose
  // the comment on save.
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({
      class: 'critic-comment-marker',
      'aria-label': `Comment: ${parseCommentMeta(node.attrs.comment).body}`,
    }, HTMLAttributes), '💬']
  },
})

export interface CriticMarkupUIOptions {
  /** Mod-Shift-M: open the comment bubble for editing. Must be identity-stable. */
  onRequestComment: ((editor: Editor) => void) | null
  /**
   * Mouse entered (element) or left (null) a comment's DOM element. The
   * element itself is reported, not a rect, so the bubble can anchor to it and
   * track it through scrolling. Must be identity-stable.
   */
  onHoverComment: ((element: HTMLElement | null) => void) | null
}

const COMMENT_SELECTOR = 'mark[data-comment], span[data-critic-comment]'

// While a new comment is being typed into the bubble, focus is in the
// bubble's input, so ProseMirror stops drawing the selection. This plugin
// draws the target range (or a ghost 💬 at the cursor) as a decoration so the
// user can still see what they are commenting on. Set with setPendingComment().
const pendingCommentKey = new PluginKey<DecorationSet>('criticPendingComment')

export function setPendingComment(editor: Editor, range: { from: number; to: number } | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(pendingCommentKey, range).setMeta('addToHistory', false))
}

// Options are only read inside the method they're used in, as static values
// from .configure() — never mutated at runtime (see the search-replace
// `this`-identity note in CLAUDE.md).
export const CriticMarkupUI = Extension.create<CriticMarkupUIOptions>({
  name: 'criticMarkupUI',

  addOptions() {
    return { onRequestComment: null, onHoverComment: null }
  },

  addKeyboardShortcuts() {
    const onRequestComment = this.options.onRequestComment
    return {
      'Mod-Shift-m': ({ editor }) => {
        if (!onRequestComment) return false
        onRequestComment(editor)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const onHover = this.options.onHoverComment
    const plugins: Plugin[] = [
      new Plugin<DecorationSet>({
        key: pendingCommentKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(pendingCommentKey) as { from: number; to: number } | null | undefined
            if (meta === null) return DecorationSet.empty
            if (meta) {
              const deco = meta.from === meta.to
                ? Decoration.widget(meta.from, () => {
                  const el = document.createElement('span')
                  el.className = 'critic-comment-marker critic-pending-marker'
                  el.textContent = '💬'
                  return el
                })
                : Decoration.inline(meta.from, meta.to, { class: 'critic-pending' })
              return DecorationSet.create(tr.doc, [deco])
            }
            return set.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations: (state) => pendingCommentKey.getState(state),
        },
      }),
    ]
    if (onHover) {
      plugins.push(new Plugin({
        key: new PluginKey('criticCommentHover'),
        props: {
          handleDOMEvents: {
            mouseover(view, event) {
              const el = (event.target as Element | null)?.closest?.(COMMENT_SELECTOR)
              if (el instanceof HTMLElement && view.dom.contains(el)) onHover(el)
              return false
            },
            mouseout(_view, event) {
              const from = (event.target as Element | null)?.closest?.(COMMENT_SELECTOR)
              if (!from) return false
              const to = event.relatedTarget as globalThis.Node | null
              if (!to || !from.contains(to)) onHover(null)
              return false
            },
          },
        },
      }))
    }
    return plugins
  },
})

// ─── Selection helpers used by the toolbar, dialog and popover ──────────────

export type ActiveComment =
  | { kind: 'mark'; from: number; to: number; comment: string | null }
  | { kind: 'node'; pos: number; comment: string }

/**
 * The comment the cursor is "in": a selected 💬 marker, a marker directly
 * next to the caret (so keyboard users can reach it with the arrow keys), or
 * a highlight the caret is inside or touching.
 */
export function getActiveComment(state: EditorState): ActiveComment | null {
  const { selection, schema } = state
  const nodeType = schema.nodes.criticComment
  const markType = schema.marks.criticHighlight
  if (!nodeType || !markType) return null

  if (selection instanceof NodeSelection && selection.node.type === nodeType) {
    return { kind: 'node', pos: selection.from, comment: selection.node.attrs.comment }
  }

  const { $from } = selection
  if (selection.empty) {
    if ($from.nodeAfter?.type === nodeType) {
      return { kind: 'node', pos: $from.pos, comment: $from.nodeAfter.attrs.comment }
    }
    if ($from.nodeBefore?.type === nodeType) {
      return { kind: 'node', pos: $from.pos - $from.nodeBefore.nodeSize, comment: $from.nodeBefore.attrs.comment }
    }
  }

  const mark = [...($from.nodeAfter?.marks ?? []), ...($from.nodeBefore?.marks ?? [])]
    .find((m) => m.type === markType)
  if (!mark) return null
  const range = getMarkRange($from, markType, mark.attrs)
  if (!range) return null
  return { kind: 'mark', from: range.from, to: range.to, comment: mark.attrs.comment }
}

/**
 * Whether Add Comment applies here: an empty selection (inserts a 💬 marker)
 * or a text selection inside one block. Not in code, where CriticMarkup is
 * literal, and not on top of an existing comment.
 */
export function canAddComment(state: EditorState): boolean {
  return addCommentBlocker(state) === null
}

/**
 * Why Add Comment is unavailable here, as a short user-facing phrase for the
 * toolbar tooltip, or null when it is available. The single source of truth
 * for canAddComment(), so the tooltip can't drift from the enabled state.
 */
export function addCommentBlocker(state: EditorState): string | null {
  const { selection, schema } = state
  if (!schema.marks.criticHighlight) return 'comments are not available'
  if (selection instanceof NodeSelection) return 'select text rather than an image or diagram'
  if (getActiveComment(state)) return 'the cursor is already in a comment'
  const { $from, $to, from, to, empty } = selection
  if (!$from.sameParent($to)) return 'select text within a single paragraph, heading, list item or table cell'
  const codeMark = schema.marks.code
  if (!$from.parent.isTextblock || $from.parent.type.spec.code
    || (codeMark && (codeMark.isInSet($from.marks()) || (!empty && state.doc.rangeHasMark(from, to, codeMark))))) {
    return 'comments can’t be added to code'
  }
  if (empty) return null
  if (state.doc.rangeHasMark(from, to, schema.marks.criticHighlight)) return 'the selection overlaps an existing comment'
  if (state.doc.textBetween(from, to, '', '\u0000').trim().length === 0) return 'select some text to comment on'
  return null
}

/** The comment whose content starts at `pos` (a 💬 marker, or a highlight). */
export function getCommentAt(state: EditorState, pos: number): ActiveComment | null {
  const nodeType = state.schema.nodes.criticComment
  const markType = state.schema.marks.criticHighlight
  if (!nodeType || !markType || pos < 0 || pos > state.doc.content.size) return null
  const $pos = state.doc.resolve(pos)
  const after = $pos.nodeAfter
  if (after?.type === nodeType) return { kind: 'node', pos, comment: after.attrs.comment }
  const mark = after?.marks.find((m) => m.type === markType)
  if (!mark) return null
  const range = getMarkRange($pos, markType, mark.attrs)
  return range ? { kind: 'mark', from: range.from, to: range.to, comment: mark.attrs.comment } : null
}

/** Map a hovered comment element (mark or 💬 span) back to its comment. */
export function commentFromDOM(view: EditorView, element: HTMLElement): ActiveComment | null {
  try {
    return getCommentAt(view.state, view.posAtDOM(element, 0))
  } catch {
    return null
  }
}

/** The DOM element that renders a comment, for anchoring the bubble. */
export function commentDOM(view: EditorView, active: ActiveComment): HTMLElement | null {
  try {
    if (active.kind === 'node') {
      const dom = view.nodeDOM(active.pos)
      return dom instanceof HTMLElement ? dom : null
    }
    // Resolve inside the first character: the text node (or an inner <strong>
    // etc.) sits under the outermost <mark>, thanks to the mark's priority.
    const { node } = view.domAtPos(active.from + 1, -1)
    const el = node instanceof Element ? node : node.parentElement
    return el?.closest('mark') ?? null
  } catch {
    return null
  }
}

/**
 * Add a comment (the full stored string, prefix included) over `range`: a
 * highlight when the range is non-empty, a 💬 marker when it is a point. The
 * caret ends up just after it, which keeps the new comment "active".
 */
export function addComment(editor: Editor, comment: string, range: { from: number; to: number }): boolean {
  if (range.from === range.to) {
    return editor.chain().focus()
      .insertContentAt(range.from, { type: 'criticComment', attrs: { comment } })
      .run()
  }
  return editor.chain().focus()
    .setTextSelection(range)
    .setMark('criticHighlight', { comment })
    .setTextSelection(range.to)
    .run()
}

export function updateComment(editor: Editor, active: ActiveComment, comment: string): boolean {
  return editor.chain().focus().command(({ tr, state }) => {
    if (active.kind === 'node') {
      tr.setNodeMarkup(active.pos, undefined, { comment })
    } else {
      const type = state.schema.marks.criticHighlight
      tr.removeMark(active.from, active.to, type).addMark(active.from, active.to, type.create({ comment }))
    }
    return true
  }).run()
}

/** Delete a comment. A highlight keeps its text; a 💬 marker is removed. */
export function deleteComment(editor: Editor, active: ActiveComment): boolean {
  return editor.chain().focus().command(({ tr, state }) => {
    if (active.kind === 'node') {
      tr.delete(active.pos, active.pos + 1)
    } else {
      tr.removeMark(active.from, active.to, state.schema.marks.criticHighlight)
    }
    return true
  }).run()
}
