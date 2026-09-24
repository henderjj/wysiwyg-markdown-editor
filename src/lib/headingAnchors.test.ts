import { describe, it, expect, vi, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  slugifyHeading, headingSlugs, internalLinkFragment, findHeadingIndex, navigateToHeading,
} from './headingAnchors'
import { markdownToHtml } from './markdownParser'
import { htmlToMarkdown } from './markdown'

describe('slugifyHeading', () => {
  it('matches GitHub slugs', () => {
    expect(slugifyHeading('1. Heading 1')).toBe('1-heading-1')
    expect(slugifyHeading('Hello, World!')).toBe('hello-world')
    expect(slugifyHeading('  Trimmed  ')).toBe('trimmed')
    expect(slugifyHeading('A - B')).toBe('a---b')
    expect(slugifyHeading('snake_case & more')).toBe('snake_case--more')
    expect(slugifyHeading('Café Crème')).toBe('café-crème')
  })
})

describe('headingSlugs', () => {
  it('suffixes duplicates in document order', () => {
    expect(headingSlugs(['Intro', 'Intro', 'Intro'])).toEqual(['intro', 'intro-1', 'intro-2'])
  })

  it('skips suffixes already taken by another heading', () => {
    expect(headingSlugs(['A 1', 'A', 'A'])).toEqual(['a-1', 'a', 'a-2'])
  })
})

describe('internalLinkFragment', () => {
  it('returns the decoded fragment for #links only', () => {
    expect(internalLinkFragment('#1-heading-1')).toBe('1-heading-1')
    expect(internalLinkFragment('#caf%C3%A9')).toBe('café')
    expect(internalLinkFragment('#bad%')).toBe('bad%')
    expect(internalLinkFragment('https://example.com/#x')).toBeNull()
    expect(internalLinkFragment('other.md#x')).toBeNull()
    expect(internalLinkFragment('')).toBeNull()
    expect(internalLinkFragment(null)).toBeNull()
  })
})

describe('findHeadingIndex', () => {
  const headings = ['Contents', '1. Heading 1', '2. Heading 2', 'Contents']

  it('finds exact GitHub slugs, including duplicate suffixes', () => {
    expect(findHeadingIndex(headings, '1-heading-1')).toBe(1)
    expect(findHeadingIndex(headings, '2-heading-2')).toBe(2)
    expect(findHeadingIndex(headings, 'contents-1')).toBe(3)
  })

  it('falls back to case-insensitive, hyphen-collapsed matching', () => {
    expect(findHeadingIndex(['A - B'], 'a-b')).toBe(0)
    expect(findHeadingIndex(['Intro'], 'INTRO')).toBe(0)
  })

  it('returns -1 when nothing matches', () => {
    expect(findHeadingIndex(headings, 'missing')).toBe(-1)
    expect(findHeadingIndex(headings, '')).toBe(-1)
  })
})

describe('internal link round-trip', () => {
  it('keeps #fragment hrefs intact through parse and export', () => {
    const md = '[Heading 1](#1-heading-1)'
    const html = markdownToHtml(md)
    expect(html).toContain('href="#1-heading-1"')
    expect(htmlToMarkdown(html).trim()).toBe(md)
  })
})

describe('navigateToHeading', () => {
  let editor: Editor | null = null
  afterEach(() => { editor?.destroy(); editor = null })

  it('moves the caret to the linked heading and scrolls it into view', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    editor = new Editor({
      extensions: [StarterKit],
      content: markdownToHtml([
        '## Contents',
        '',
        '1. [Heading 1](#1-heading-1)',
        '2. [Heading 2](#2-heading-2)',
        '',
        '# 1. Heading 1',
        'Some text.',
        '',
        '# 2. Heading 2',
        'Some more text.',
      ].join('\n')),
    })

    expect(navigateToHeading(editor.view, '2-heading-2')).toBe(true)
    const { $from } = editor.state.selection
    expect($from.parent.type.name).toBe('heading')
    expect($from.parent.textContent).toBe('2. Heading 2')
    expect($from.parentOffset).toBe(0)
    expect(scroll).toHaveBeenCalledTimes(1)
    expect((scroll.mock.contexts[0] as HTMLElement).textContent).toBe('2. Heading 2')

    expect(navigateToHeading(editor.view, 'missing')).toBe(false)
    expect(editor.state.selection.$from.parent.textContent).toBe('2. Heading 2')
  })
})
