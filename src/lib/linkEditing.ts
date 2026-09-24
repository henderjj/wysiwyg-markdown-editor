/**
 * Helpers behind the link dialog and the link hover tooltip.
 */

import { getMarkRange, isMarkActive, isMacOS, type Editor } from '@tiptap/core'
import { isAllowedUri } from '@tiptap/extension-link'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { headingSlugs, internalLinkFragment } from './headingAnchors'

/** What the link dialog acts on, captured from the selection when it opens. */
export interface LinkTarget {
  /** `edit` when the caret or selection is inside an existing link. */
  mode: 'insert' | 'edit'
  from: number
  to: number
  href: string
  text: string
  /**
   * False when the range spans several blocks or contains images or
   * comment markers — replacing its text would delete them, so only the
   * URL can be changed.
   */
  textEditable: boolean
}

export function getLinkTarget(state: EditorState): LinkTarget {
  const linkType = state.schema.marks.link
  const { from, to, $from } = state.selection

  // Same test the toolbar uses to highlight the link button, so the button
  // edits exactly when it shows as active.
  if (isMarkActive(state, linkType)) {
    const range = getMarkRange($from, linkType)
    if (range && from >= range.from && to <= range.to) {
      const mark = state.doc.nodeAt(range.from)?.marks.find(m => m.type === linkType)
      return {
        mode: 'edit',
        from: range.from,
        to: range.to,
        href: (mark?.attrs.href as string | undefined) ?? '',
        text: state.doc.textBetween(range.from, range.to),
        textEditable: isPlainTextRange(state.doc, range.from, range.to),
      }
    }
  }

  return {
    mode: 'insert',
    from,
    to,
    href: '',
    text: state.doc.textBetween(from, to, ' '),
    textEditable: isPlainTextRange(state.doc, from, to),
  }
}

function isPlainTextRange(doc: PMNode, from: number, to: number): boolean {
  if (!doc.resolve(from).sameParent(doc.resolve(to))) return false
  let plain = true
  doc.nodesBetween(from, to, node => {
    if (node.isInline && !node.isText) plain = false
  })
  return plain
}

/** Whether the editor's Link extension will accept `href` (rejects `javascript:` and the like). */
export function isAllowedLinkHref(href: string): boolean {
  return !!isAllowedUri(href)
}

/**
 * Create or update the link described by `target`. An empty `text` falls
 * back to the URL. When the text is unchanged only the mark is updated, so
 * formatting inside the link (bold, code, …) survives; new or changed text
 * takes the formatting of the range's first character.
 */
export function applyLink(editor: Editor, target: LinkTarget, href: string, text: string): boolean {
  const { from, to } = target
  const label = text || href
  if (target.textEditable && label !== target.text) {
    const { state } = editor
    const baseMarks = from < to
      ? state.doc.nodeAt(from)?.marks ?? []
      : state.storedMarks ?? state.doc.resolve(from).marks()
    const marks = [
      ...baseMarks.filter(m => m.type.name !== 'link').map(m => m.toJSON()),
      { type: 'link', attrs: { href } },
    ]
    return editor.chain().focus()
      .insertContentAt({ from, to }, { type: 'text', text: label, marks })
      .setTextSelection(from + label.length)
      .run()
  }
  return editor.chain().focus()
    .setTextSelection({ from, to })
    .setLink({ href })
    .setTextSelection(to)
    .run()
}

export function removeLink(editor: Editor, target: LinkTarget): boolean {
  return editor.chain().focus()
    .setTextSelection({ from: target.from, to: target.to })
    .unsetLink()
    .setTextSelection(target.to)
    .run()
}

export interface HeadingOption {
  level: number
  text: string
  slug: string
}

/** The document's headings with their `#slug`s, for the dialog's heading picker. */
export function headingOptions(doc: PMNode): HeadingOption[] {
  const found: { level: number; text: string }[] = []
  doc.descendants(node => {
    if (node.type.name !== 'heading') return true
    found.push({ level: node.attrs.level as number, text: node.textContent })
    return false
  })
  const slugs = headingSlugs(found.map(h => h.text))
  return found
    .map((h, i) => ({ ...h, slug: slugs[i] }))
    .filter(h => h.text.trim() && h.slug)
}

/**
 * The URL an external link opens, or null if Ctrl+Click shouldn't open it.
 * Only http(s), mailto and tel — the set the shell plugin's default `open`
 * scope allows — so a `javascript:`, `file:` or relative href is refused.
 */
export function openableUrl(href: string): string | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null
}

/** Hover text for a link: its URL, plus how to follow it when it can be followed. */
export function linkTooltip(href: string, mac = isMacOS()): string {
  const click = `${mac ? 'Cmd' : 'Ctrl'}+Click`
  if (internalLinkFragment(href) !== null) return `${href}\n${click} to go to heading`
  if (openableUrl(href)) return `${href}\n${click} to open link`
  return href
}

/**
 * Inline decorations putting each link's tooltip text in a `data-link-tip`
 * attribute, which the `[data-link-tip]:hover::after` rule in index.css
 * displays. Not a `title`: that would add the browser's native tooltip on top
 * of the styled one. Decorations exist only in the editor's view, so the
 * attribute never reaches `getHTML()` or the saved markdown.
 */
export function linkTooltipDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const link = node.marks.find(m => m.type.name === 'link')
    const href = link?.attrs.href as string | undefined
    if (href) decorations.push(Decoration.inline(pos, pos + node.nodeSize, { 'data-link-tip': linkTooltip(href) }))
    return false
  })
  return DecorationSet.create(doc, decorations)
}
