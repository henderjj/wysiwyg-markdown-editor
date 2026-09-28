import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HtmlEntity } from './html-entity'
import { markdownToHtml } from '../lib/markdownParser'
import { htmlToMarkdown } from '../lib/markdown'

// The markdownRoundtrip suite goes straight from parser HTML to Turndown.
// These go through the editor schema too, as opening, editing and saving do.

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function makeEditor(md: string): Editor {
  editor = new Editor({ extensions: [StarterKit, HtmlEntity], content: markdownToHtml(md) })
  return editor
}

const md = (e: Editor) => htmlToMarkdown(e.getHTML()).trim()

describe('HtmlEntity mark', () => {
  it.each([
    'Tom &amp; Jerry',
    'a&nbsp;b &nbsp; c',
    '&copy; &#169; &#xA9;',
    '**bold &amp; strong** and [&rarr; link](http://x.y)',
    '# Heading &mdash; here',
    '&#42;not italic&#42;',
  ])('%s survives the editor unchanged', (source) => {
    expect(md(makeEditor(source))).toBe(source)
  })

  it('shows the decoded character', () => {
    expect(makeEditor('Tom &amp; Jerry &copy;').state.doc.textContent).toBe('Tom & Jerry ©')
  })

  it('typing next to an entity does not extend it', () => {
    const e = makeEditor('a &amp;')
    e.commands.setTextSelection(e.state.doc.content.size - 1)
    e.commands.insertContent('b')
    expect(md(e)).toBe('a &amp;b')
  })

  it('replacing the character exports the new text', () => {
    const e = makeEditor('a &copy; b')
    e.chain().setTextSelection({ from: 3, to: 4 }).insertContent('x').run()
    expect(md(e)).toBe('a x b')
  })

  it('literal entity text typed by the user stays literal after reopening', () => {
    const e = makeEditor('')
    e.commands.insertContent({ type: 'text', text: '&copy;' })
    const saved = md(e)
    expect(saved).toBe('\\&copy;')
    expect(makeEditor(saved).state.doc.textContent).toBe('&copy;')
  })
})
