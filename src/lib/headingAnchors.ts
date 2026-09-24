/**
 * Resolving in-document links (`[Intro](#1-introduction)`) to headings.
 *
 * Headings carry no `id` in the editor or in saved markdown, so a fragment is
 * matched against slugs computed from heading text, using GitHub's algorithm
 * (the de facto convention for hand-written tables of contents): lowercase,
 * drop everything except letters, marks, numbers, connector punctuation
 * (`_`), spaces and hyphens, then turn each space into a hyphen. Repeated
 * slugs get `-1`, `-2`, … suffixes in document order, as on GitHub.
 */

import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

/** GitHub-style slug for a heading's text. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-')
}

/** Slugs for a document's headings in order, with GitHub's duplicate suffixes. */
export function headingSlugs(texts: string[]): string[] {
  const seen = new Map<string, number>()
  return texts.map(text => {
    const base = slugifyHeading(text)
    let slug = base
    // A suffixed slug can collide with one a later heading's own text
    // produces ("A 1", "A", "A" → a-1, a, a-2), so keep counting until unused.
    while (seen.has(slug)) {
      const n = seen.get(base)! + 1
      seen.set(base, n)
      slug = `${base}-${n}`
    }
    seen.set(slug, 0)
    return slug
  })
}

/** Looser form for fallback matching of slugs made by other tools. */
function looseSlug(slug: string): string {
  return slug.replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/**
 * The fragment of an in-document link (`#section` → `section`, URL-decoded),
 * or `null` if `href` points anywhere else.
 */
export function internalLinkFragment(href: string | null | undefined): string | null {
  if (!href || !href.startsWith('#')) return null
  const raw = href.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Index of the heading a fragment refers to, or -1. Exact GitHub slugs win;
 * failing that, a case-insensitive match that ignores runs of hyphens covers
 * slugs from tools that collapse them (`a - b` → `a-b` rather than `a---b`).
 */
export function findHeadingIndex(texts: string[], fragment: string): number {
  const slugs = headingSlugs(texts)
  const exact = slugs.indexOf(fragment)
  if (exact !== -1) return exact
  const wanted = looseSlug(fragment.toLowerCase())
  if (!wanted) return -1
  return slugs.findIndex(slug => looseSlug(slug) === wanted)
}

/**
 * Move the caret to the heading `fragment` refers to and scroll it into view.
 * Returns false (and does nothing) if no heading matches.
 */
export function navigateToHeading(view: EditorView, fragment: string): boolean {
  const headings: { text: string; pos: number }[] = []
  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    headings.push({ text: node.textContent, pos })
    return false
  })
  const index = findHeadingIndex(headings.map(h => h.text), fragment)
  if (index === -1) return false
  const { pos } = headings[index]
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)))
  view.focus()
  const dom = view.nodeDOM(pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return true
}
