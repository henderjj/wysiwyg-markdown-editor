// Lazy-load Mermaid so the ~1 MB library is a separate Vite chunk that is only
// fetched the first time a diagram is rendered.

type MermaidApi = typeof import('mermaid')['default']

let mermaidPromise: Promise<MermaidApi> | null = null

export function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize(mermaidConfig('default'))
      return mermaid
    })
  }
  return mermaidPromise
}

// Monotonic id so each mermaid.render() call gets a unique DOM id.
//
// This must be shared by every renderer in the app. Mermaid prefixes its
// internal marker/clipPath ids with the render id (e.g. `mmd-3_flowchart-v2-pointEnd`)
// and references them from edge paths via `url(#...)`, which resolves to the
// first match in document order. Two renders sharing an id would therefore make
// one diagram's arrowheads point at the other diagram's markers.
let renderSeq = 0

export function nextMermaidRenderId(): string {
  return `mmd-${renderSeq++}`
}

/**
 * The one Mermaid config every caller initialises with.
 *
 * `suppressErrorRendering` is required. Without it, a diagram with a syntax
 * error makes `mermaid.render()` draw Mermaid's own "Syntax error" graphic
 * into its temporary `<div id="d{id}">` on `document.body` and then throw
 * *without removing that div*, so every failed render leaves a stray error
 * diagram below the app (issue #94). The app shows its own error message for
 * a failed diagram, so Mermaid's graphic is never wanted.
 */
export function mermaidConfig(theme: 'default' | 'dark') {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme,
  } as const
}

/**
 * Render `code` to an SVG string with a fresh render id.
 *
 * Whatever happens, the temporary elements Mermaid adds to `document.body`
 * for this id are removed afterwards. With `suppressErrorRendering` Mermaid
 * already does this itself; this is the safety net in case any render path
 * (or a future Mermaid version) throws before its own cleanup.
 */
export async function renderMermaid(mermaid: MermaidApi, code: string): Promise<string> {
  const id = nextMermaidRenderId()
  try {
    const { svg } = await mermaid.render(id, code)
    return svg
  } finally {
    removeMermaidTempElements(id)
  }
}

/** Remove the `d{id}` wrapper (and sandbox `i{id}` iframe) Mermaid puts on the body. */
export function removeMermaidTempElements(id: string): void {
  document.getElementById(`d${id}`)?.remove()
  document.getElementById(`i${id}`)?.remove()
}
