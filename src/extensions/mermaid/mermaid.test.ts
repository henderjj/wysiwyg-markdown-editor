import { describe, it, expect } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { DOMParser as PMDOMParser, DOMSerializer, type Node as PMNode } from '@tiptap/pm/model'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { Mermaid, findMermaidSource } from './Mermaid'
import { nextMermaidRenderId } from './mermaidLoader'

// Build the same schema the editor uses for code blocks + mermaid. This
// exercises the real parseHTML precedence and renderHTML without needing a
// browser, a live editor, or the React node view.
const schema = getSchema([
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight: createLowlight(common) }),
  Mermaid,
])

function parse(html: string): PMNode {
  const dom = document.createElement('div')
  dom.innerHTML = html
  return PMDOMParser.fromSchema(schema).parse(dom)
}

function serialize(node: PMNode): string {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(node.content)
  const div = document.createElement('div')
  div.appendChild(fragment)
  return div.innerHTML
}

describe('Mermaid node', () => {
  it('parses a language-mermaid code block as a mermaid node (wins over CodeBlockLowlight)', () => {
    const doc = parse('<pre><code class="language-mermaid">graph TD;\nA--&gt;B</code></pre>')
    expect(doc.firstChild?.type.name).toBe('mermaid')
    expect(doc.firstChild?.textContent).toBe('graph TD;\nA-->B')
  })

  it('leaves a non-mermaid code block as a codeBlock', () => {
    const doc = parse('<pre><code class="language-javascript">const x = 1</code></pre>')
    expect(doc.firstChild?.type.name).toBe('codeBlock')
  })

  it('serializes a mermaid node back to identical language-mermaid HTML (round-trips via Turndown)', () => {
    const doc = parse('<pre><code class="language-mermaid">graph TD;\nA--&gt;B</code></pre>')
    const html = serialize(doc)
    expect(html).toContain('class="language-mermaid"')
    expect(html).toContain('graph TD;')
  })
})

/** Position of the first node of `typeName` in the doc, or -1. */
function findNodePos(doc: PMNode, typeName: string): number {
  let pos = -1
  doc.descendants((node, nodePos) => {
    if (pos === -1 && node.type.name === typeName) pos = nodePos
    return pos === -1
  })
  return pos
}

function stateFrom(html: string): EditorState {
  return EditorState.create({ doc: parse(html), schema })
}

describe('findMermaidSource', () => {
  const MERMAID_HTML = '<pre><code class="language-mermaid">graph TD;\nA--&gt;B</code></pre>'

  it('returns the source when the cursor is inside a mermaid node', () => {
    const state = stateFrom(MERMAID_HTML)
    const pos = findNodePos(state.doc, 'mermaid')
    const withCursor = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, pos + 3))
    )
    expect(findMermaidSource(withCursor)).toBe('graph TD;\nA-->B')
  })

  it('returns the source for a NodeSelection on the mermaid block', () => {
    const state = stateFrom(MERMAID_HTML)
    const pos = findNodePos(state.doc, 'mermaid')
    const selected = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, pos)))
    expect(findMermaidSource(selected)).toBe('graph TD;\nA-->B')
  })

  it('returns null when the selection is in a paragraph', () => {
    expect(findMermaidSource(stateFrom('<p>hello</p>'))).toBeNull()
  })

  it('returns null when the selection is in a plain code block', () => {
    const state = stateFrom('<pre><code class="language-javascript">const x = 1</code></pre>')
    const pos = findNodePos(state.doc, 'codeBlock')
    const withCursor = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, pos + 1))
    )
    expect(findMermaidSource(withCursor)).toBeNull()
  })

  it('returns an empty string for an empty diagram, so callers can treat it as a no-op', () => {
    const state = stateFrom('<pre><code class="language-mermaid"></code></pre>')
    const pos = findNodePos(state.doc, 'mermaid')
    const withCursor = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, pos + 1))
    )
    const source = findMermaidSource(withCursor)
    expect(source).toBe('')
    expect(source?.trim()).toBeFalsy()
  })
})

describe('nextMermaidRenderId', () => {
  it('never repeats, so mermaid marker ids cannot collide between renderers', () => {
    const ids = new Set(Array.from({ length: 50 }, () => nextMermaidRenderId()))
    expect(ids.size).toBe(50)
  })

  it('produces valid DOM-id-safe strings', () => {
    expect(nextMermaidRenderId()).toMatch(/^mmd-\d+$/)
  })
})
