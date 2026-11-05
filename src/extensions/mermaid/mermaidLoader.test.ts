import { describe, it, expect, vi } from 'vitest'
import { mermaidConfig, renderMermaid } from './mermaidLoader'

type MermaidApi = Parameters<typeof renderMermaid>[0]

describe('mermaidConfig', () => {
  it('suppresses Mermaid error rendering so failed diagrams leave nothing on the body', () => {
    expect(mermaidConfig('default')).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'default',
    })
    expect(mermaidConfig('dark').theme).toBe('dark')
  })
})

describe('renderMermaid', () => {
  // Mimic mermaid.render(): it appends <div id="d{id}"> to the body, and on
  // a syntax error (without suppressErrorRendering) throws leaving it behind.
  function fakeMermaid(fail: boolean): MermaidApi {
    return {
      render: vi.fn(async (id: string) => {
        const div = document.createElement('div')
        div.id = `d${id}`
        div.innerHTML = '<svg>Syntax error in text</svg>'
        document.body.appendChild(div)
        if (fail) throw new Error('Parse error')
        return { svg: '<svg>ok</svg>' }
      }),
    } as unknown as MermaidApi
  }

  it('returns the svg and removes the temporary element', async () => {
    expect(await renderMermaid(fakeMermaid(false), 'graph TD; A-->B')).toBe('<svg>ok</svg>')
    expect(document.body.children).toHaveLength(0)
  })

  it('removes the leftover error element when the render throws', async () => {
    await expect(renderMermaid(fakeMermaid(true), 'graph TD; A--')).rejects.toThrow('Parse error')
    expect(document.body.children).toHaveLength(0)
  })

  it('uses a fresh render id each call', async () => {
    const m = fakeMermaid(false)
    await renderMermaid(m, 'a')
    await renderMermaid(m, 'b')
    const ids = (m.render as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])
    expect(ids[0]).not.toBe(ids[1])
  })
})
