import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import {
  getLinkTarget, applyLink, removeLink, headingOptions, isAllowedLinkHref,
  openableUrl, linkTooltip, linkTooltipDecorations,
} from './linkEditing'
import { markdownToHtml } from './markdownParser'
import { htmlToMarkdown } from './markdown'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function makeEditor(md: string): Editor {
  editor = new Editor({
    extensions: [StarterKit.configure({ link: false }), Link.configure({ openOnClick: false, autolink: false }), Image.configure({ inline: true })],
    content: markdownToHtml(md),
  })
  return editor
}

const md = (e: Editor) => htmlToMarkdown(e.getHTML()).trim()

/** Document position of the `n`th character of `text`'s first occurrence. */
function posOf(e: Editor, text: string, n = 0): number {
  let found = -1
  e.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText) return found === -1
    const i = node.text!.indexOf(text)
    if (i !== -1) found = pos + i + n
    return false
  })
  if (found === -1) throw new Error(`"${text}" not found`)
  return found
}

describe('getLinkTarget', () => {
  it('edits the whole link when the caret is inside it', () => {
    const e = makeEditor('See [the docs](https://example.com/docs) here.')
    e.commands.setTextSelection(posOf(e, 'docs', 2))
    expect(getLinkTarget(e.state)).toMatchObject({
      mode: 'edit', href: 'https://example.com/docs', text: 'the docs', textEditable: true,
    })
  })

  it('edits the link when the selection lies inside it', () => {
    const e = makeEditor('See [the docs](#docs) here.')
    e.commands.setTextSelection({ from: posOf(e, 'the'), to: posOf(e, 'docs', 2) })
    expect(getLinkTarget(e.state)).toMatchObject({ mode: 'edit', href: '#docs', text: 'the docs' })
  })

  it('keeps a link with bold text as one link', () => {
    const e = makeEditor('[plain **bold**](https://example.com)')
    e.commands.setTextSelection(posOf(e, 'plain', 1))
    expect(getLinkTarget(e.state)).toMatchObject({ mode: 'edit', text: 'plain bold' })
  })

  it('inserts when the caret is just past the end of a link', () => {
    const e = makeEditor('[link](https://example.com) after')
    e.commands.setTextSelection(posOf(e, 'link', 4))
    expect(getLinkTarget(e.state).mode).toBe('insert')
  })

  it('uses the selected text when inserting', () => {
    const e = makeEditor('Some words here.')
    e.commands.setTextSelection({ from: posOf(e, 'words'), to: posOf(e, 'words', 5) })
    expect(getLinkTarget(e.state)).toMatchObject({ mode: 'insert', href: '', text: 'words', textEditable: true })
  })

  it('locks the text for a selection spanning paragraphs or containing an image', () => {
    const e = makeEditor('First para.\n\nSecond para.')
    e.commands.setTextSelection({ from: posOf(e, 'First'), to: posOf(e, 'Second', 6) })
    expect(getLinkTarget(e.state).textEditable).toBe(false)

    const e2 = makeEditor('Before ![alt](https://example.com/a.png) after')
    e2.commands.setTextSelection({ from: posOf(e2, 'Before'), to: posOf(e2, 'after', 5) })
    expect(getLinkTarget(e2.state).textEditable).toBe(false)
  })
})

describe('applyLink', () => {
  it('inserts a new link at the caret, using the URL when the text is empty', () => {
    const e = makeEditor('Go now')
    e.commands.setTextSelection(posOf(e, 'now'))
    applyLink(e, getLinkTarget(e.state), 'https://example.com', '')
    expect(md(e)).toBe('Go [https://example.com](https://example.com)now')
  })

  it('inserts display text and leaves the caret after the link', () => {
    const e = makeEditor('Go now')
    e.commands.setTextSelection(posOf(e, 'now'))
    applyLink(e, getLinkTarget(e.state), '#intro', 'Intro')
    e.commands.insertContent('!')
    expect(md(e)).toBe('Go [Intro](#intro)!now')
  })

  it('wraps the selected text', () => {
    const e = makeEditor('Some words here.')
    e.commands.setTextSelection({ from: posOf(e, 'words'), to: posOf(e, 'words', 5) })
    applyLink(e, getLinkTarget(e.state), 'https://example.com', 'words')
    expect(md(e)).toBe('Some [words](https://example.com) here.')
  })

  it('replaces the selected text when the display text changes', () => {
    const e = makeEditor('Some words here.')
    e.commands.setTextSelection({ from: posOf(e, 'words'), to: posOf(e, 'words', 5) })
    applyLink(e, getLinkTarget(e.state), 'https://example.com', 'other words')
    expect(md(e)).toBe('Some [other words](https://example.com) here.')
  })

  it('changes only the URL of an existing link, keeping formatting inside it', () => {
    const e = makeEditor('[plain **bold**](https://old.example)')
    e.commands.setTextSelection(posOf(e, 'plain', 1))
    const target = getLinkTarget(e.state)
    applyLink(e, target, 'https://new.example', target.text)
    expect(md(e)).toBe('[plain **bold**](https://new.example)')
  })

  it('changes both text and URL of an existing link', () => {
    const e = makeEditor('A [link](https://old.example) here.')
    e.commands.setTextSelection(posOf(e, 'link', 2))
    applyLink(e, getLinkTarget(e.state), '#top', 'new text')
    expect(md(e)).toBe('A [new text](#top) here.')
  })

  it('keeps the surrounding formatting of replaced text', () => {
    const e = makeEditor('**Some words here.**')
    e.commands.setTextSelection({ from: posOf(e, 'words'), to: posOf(e, 'words', 5) })
    applyLink(e, getLinkTarget(e.state), 'https://example.com', 'links')
    // Link outranks bold, so the exporter splits the bold around it
    expect(md(e)).toBe('**Some** [**links**](https://example.com) **here.**')
  })

  it('links a multi-paragraph selection without touching its text', () => {
    const e = makeEditor('First para.\n\nSecond para.')
    e.commands.setTextSelection({ from: posOf(e, 'First'), to: posOf(e, 'Second', 6) })
    applyLink(e, getLinkTarget(e.state), 'https://example.com', 'ignored')
    expect(md(e)).toBe('[First para.](https://example.com)\n\n[Second](https://example.com) para.')
  })
})

describe('removeLink', () => {
  it('removes the whole link but keeps its text', () => {
    const e = makeEditor('A [link text](https://example.com) here.')
    e.commands.setTextSelection(posOf(e, 'text', 1))
    removeLink(e, getLinkTarget(e.state))
    expect(md(e)).toBe('A link text here.')
  })
})

describe('headingOptions', () => {
  it('lists headings with GitHub slugs and skips empty ones', () => {
    const e = makeEditor('# 1. Intro\n\n## Setup\n\n## Setup\n\n#\n\ntext')
    expect(headingOptions(e.state.doc)).toEqual([
      { level: 1, text: '1. Intro', slug: '1-intro' },
      { level: 2, text: 'Setup', slug: 'setup' },
      { level: 2, text: 'Setup', slug: 'setup-1' },
    ])
  })
})

describe('isAllowedLinkHref', () => {
  it('accepts web, mail, relative and fragment links and rejects script URLs', () => {
    for (const href of ['https://example.com', 'mailto:a@b.c', 'other.md', '#heading', '/abs/path'])
      expect(isAllowedLinkHref(href), href).toBe(true)
    for (const href of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x'])
      expect(isAllowedLinkHref(href), href).toBe(false)
  })
})

describe('openableUrl', () => {
  it('returns http(s), mailto and tel URLs only', () => {
    expect(openableUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(openableUrl('tel:+441234')).toBe('tel:+441234')
    expect(openableUrl('javascript:alert(1)')).toBeNull()
    expect(openableUrl('file:///etc/passwd')).toBeNull()
    expect(openableUrl('other.md')).toBeNull()
    expect(openableUrl('#heading')).toBeNull()
  })
})

describe('linkTooltip', () => {
  it('names the modifier and action for followable links', () => {
    expect(linkTooltip('https://example.com', false)).toBe('https://example.com\nCtrl+Click to open link')
    expect(linkTooltip('https://example.com', true)).toBe('https://example.com\nCmd+Click to open link')
    expect(linkTooltip('#intro', false)).toBe('#intro\nCtrl+Click to go to heading')
    expect(linkTooltip('other.md', false)).toBe('other.md')
  })
})

describe('linkTooltipDecorations', () => {
  it('tags every link in the view without changing the saved HTML', () => {
    const e = makeEditor('[one](https://example.com) and [two **bold**](#two)')
    const html = e.getHTML()
    const decorations = linkTooltipDecorations(e.state.doc).find()
    expect(decorations).toHaveLength(3)
    expect(decorations.map(d => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs['data-link-tip'])).toEqual([
      linkTooltip('https://example.com'),
      linkTooltip('#two'),
      linkTooltip('#two'),
    ])
    expect(html).not.toContain('data-link-tip')
    expect(html).not.toContain('title=')
  })
})
