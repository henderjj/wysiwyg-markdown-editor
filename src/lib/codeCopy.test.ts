import { describe, it, expect, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { NodeSelection } from '@tiptap/pm/state'
import { common, createLowlight } from 'lowlight'
import { codeSelectionText } from './codeCopy'
import { markdownToHtml } from './markdownParser'
import { htmlToMarkdown } from './markdown'
import { CodeBlockWithCopy } from '../extensions/code-block'

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

function makeEditor(md: string): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false, codeBlock: false }),
      CodeBlockWithCopy.configure({ lowlight: createLowlight(common), defaultLanguage: 'plaintext' }),
      Image.configure({ inline: true }),
    ],
    content: markdownToHtml(md),
  })
  return editor
}

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

function select(e: Editor, fromText: string, toText: string): string | null {
  e.commands.setTextSelection({ from: posOf(e, fromText), to: posOf(e, toText, toText.length) })
  return codeSelectionText(e.state)
}

const DOC = [
  'Run `npm install --save` first.',
  '',
  '```bash',
  'npm run build',
  'npm test',
  '```',
  '',
  'After the block.',
].join('\n')

describe('codeSelectionText', () => {
  it('returns the raw text of a selection inside one code block', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'npm run', 'build')).toBe('npm run build')
  })

  it('keeps newlines when the selection spans several lines of a code block', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'npm run', 'npm test')).toBe('npm run build\nnpm test')
  })

  it('returns the raw text of a selection inside an inline code span', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'npm install', '--save')).toBe('npm install --save')
  })

  it('returns null when the selection reaches outside an inline code span', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'Run', 'install')).toBeNull()
  })

  it('returns null when the selection crosses from a paragraph into a code block', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'first', 'build')).toBeNull()
  })

  it('returns null when the selection covers a code block and the text after it', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'npm run', 'After')).toBeNull()
  })

  it('returns null for a selection in ordinary text', () => {
    const e = makeEditor(DOC)
    expect(select(e, 'After', 'block')).toBeNull()
  })

  it('returns null for a node selection of a whole code block', () => {
    const e = makeEditor(DOC)
    let blockPos = -1
    e.state.doc.forEach((node, offset) => { if (node.type.name === 'codeBlock') blockPos = offset })
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, blockPos)))
    expect(codeSelectionText(e.state)).toBeNull()
  })

  it('returns null for an empty selection', () => {
    const e = makeEditor(DOC)
    e.commands.setTextSelection(posOf(e, 'npm run', 2))
    expect(codeSelectionText(e.state)).toBeNull()
  })

  it('returns null when an inline image sits between two code spans', () => {
    const e = makeEditor('`one` ![pic](https://example.com/a.png) `two`')
    expect(select(e, 'one', 'two')).toBeNull()
  })
})

describe('CodeBlockWithCopy', () => {
  it('renders a copy button beside the code in the editor', () => {
    const e = makeEditor(DOC)
    const wrapper = e.view.dom.querySelector('.code-block')!
    expect(wrapper.querySelector('button.code-block-copy')?.textContent).toBe('Copy')
    expect(wrapper.querySelector('pre > code.language-bash')?.textContent).toBe('npm run build\nnpm test')
  })

  it('leaves the saved HTML and markdown without the button', () => {
    const e = makeEditor(DOC)
    expect(e.getHTML()).not.toContain('code-block-copy')
    expect(htmlToMarkdown(e.getHTML()).trim()).toBe(DOC)
  })

  it('updates the language class when the language changes', () => {
    const e = makeEditor(DOC)
    e.commands.setTextSelection(posOf(e, 'npm run'))
    e.commands.updateAttributes('codeBlock', { language: 'sh' })
    expect(e.view.dom.querySelector('.code-block pre > code')?.className).toBe('language-sh')
  })
})
