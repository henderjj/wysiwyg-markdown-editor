import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
  loadMermaid: vi.fn(),
  ids: [] as string[],
  seq: { n: 0 },
}))

vi.mock('../extensions/mermaid/mermaidLoader', () => ({
  loadMermaid: mocks.loadMermaid,
  nextMermaidRenderId: () => {
    const id = `mmd-${mocks.seq.n++}`
    mocks.ids.push(id)
    return id
  },
}))

import { buildPrintDocument, inlineMermaidDiagrams } from './print'

beforeEach(() => {
  mocks.initialize.mockReset()
  mocks.render.mockReset()
  mocks.loadMermaid.mockReset()
  mocks.ids.length = 0
  mocks.seq.n = 0
  mocks.loadMermaid.mockResolvedValue({ initialize: mocks.initialize, render: mocks.render })
})

describe('buildPrintDocument', () => {
  it('produces a standalone document wrapping the body html', () => {
    const doc = buildPrintDocument('<p>Hello</p>', 'notes')
    expect(doc).toContain('<!DOCTYPE html>')
    expect(doc).toContain('<title>notes</title>')
    expect(doc).toContain('<p>Hello</p>')
  })

  it('escapes < in the title', () => {
    expect(buildPrintDocument('<p>x</p>', '<script>')).toContain('<title>&lt;script></title>')
  })

  it('embeds the print stylesheet', () => {
    const doc = buildPrintDocument('<p>x</p>', 'doc')
    expect(doc).toContain('@page')
    expect(doc).toContain('@media print')
    // Page-break quality rules.
    expect(doc).toContain('break-inside: avoid')
    expect(doc).toContain('break-after: avoid')
    // Long tables repeat their header row.
    expect(doc).toContain('display: table-header-group')
    // The 800px screen column must not letterbox the paper.
    expect(doc).toContain('max-width: none')
  })

  it('styles inlined mermaid diagrams', () => {
    const doc = buildPrintDocument('<p>x</p>', 'doc')
    expect(doc).toContain('.mermaid-print svg')
  })
})

describe('inlineMermaidDiagrams', () => {
  const MERMAID_HTML = '<pre><code class="language-mermaid">graph TD;\nA-->B;</code></pre>'

  it('leaves html without diagrams untouched and never loads mermaid', async () => {
    const html = '<h1>Title</h1><pre><code class="language-js">const a = 1</code></pre>'
    expect(await inlineMermaidDiagrams(html)).toBe(html)
    expect(mocks.loadMermaid).not.toHaveBeenCalled()
  })

  it('replaces a diagram block with its rendered svg', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg id="d1"></svg>' })
    const out = await inlineMermaidDiagrams(`<p>before</p>${MERMAID_HTML}<p>after</p>`)
    expect(out).toContain('<div class="mermaid-print"><svg id="d1"></svg></div>')
    expect(out).not.toContain('language-mermaid')
    // Surrounding content is preserved in order.
    expect(out.indexOf('before')).toBeLessThan(out.indexOf('mermaid-print'))
    expect(out.indexOf('mermaid-print')).toBeLessThan(out.indexOf('after'))
  })

  it('passes the diagram source through to mermaid', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg/>' })
    await inlineMermaidDiagrams(MERMAID_HTML)
    expect(mocks.render).toHaveBeenCalledTimes(1)
    expect(mocks.render.mock.calls[0][1]).toBe('graph TD;\nA-->B;')
  })

  it('forces the light theme so diagrams do not print dark-on-white', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg/>' })
    await inlineMermaidDiagrams(MERMAID_HTML)
    expect(mocks.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'default' })
    )
  })

  it('gives every diagram a distinct render id', async () => {
    mocks.render.mockResolvedValue({ svg: '<svg/>' })
    await inlineMermaidDiagrams(MERMAID_HTML + MERMAID_HTML + MERMAID_HTML)
    const used = mocks.render.mock.calls.map((c) => c[0])
    expect(used).toHaveLength(3)
    expect(new Set(used).size).toBe(3)
  })

  it('keeps the source block when rendering fails', async () => {
    mocks.render.mockRejectedValue(new Error('bad diagram'))
    const out = await inlineMermaidDiagrams(MERMAID_HTML)
    expect(out).toContain('language-mermaid')
    expect(out).toContain('graph TD;')
    expect(out).not.toContain('mermaid-print')
  })

  it('renders the diagrams that succeed even when one fails', async () => {
    mocks.render
      .mockRejectedValueOnce(new Error('bad diagram'))
      .mockResolvedValueOnce({ svg: '<svg id="ok"></svg>' })
    const out = await inlineMermaidDiagrams(MERMAID_HTML + MERMAID_HTML)
    expect(out).toContain('language-mermaid')
    expect(out).toContain('<svg id="ok"></svg>')
  })

  it('falls back to the source when mermaid cannot be loaded', async () => {
    mocks.loadMermaid.mockRejectedValue(new Error('offline'))
    const out = await inlineMermaidDiagrams(MERMAID_HTML)
    expect(out).toContain('language-mermaid')
    expect(mocks.render).not.toHaveBeenCalled()
  })

  it('skips an empty diagram block', async () => {
    const out = await inlineMermaidDiagrams('<pre><code class="language-mermaid">  </code></pre>')
    expect(mocks.render).not.toHaveBeenCalled()
    expect(out).toContain('language-mermaid')
  })
})
