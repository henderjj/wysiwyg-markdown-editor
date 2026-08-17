// Lazy-load Mermaid so the ~1 MB library is a separate Vite chunk that is only
// fetched the first time a diagram is rendered.

type MermaidApi = typeof import('mermaid')['default']

let mermaidPromise: Promise<MermaidApi> | null = null

export function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })
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
