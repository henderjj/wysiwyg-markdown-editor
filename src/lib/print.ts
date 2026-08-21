import { wrapHtmlDocument } from './markdown'
import { loadMermaid, nextMermaidRenderId } from '../extensions/mermaid/mermaidLoader'

/**
 * Printing does not use the live app DOM.
 *
 * The app shell is a fixed-height flex tree (`h-screen` + `overflow-hidden` at
 * several levels) whose editor text lives inside an `overflow-y-auto` scroll
 * viewport, so printing it can only ever produce one clipped page. Instead we
 * build a standalone document from the editor's HTML and print that inside a
 * hidden iframe, which leaves the app DOM completely untouched.
 *
 * The stylesheet comes from `wrapHtmlDocument()` -- the same one "Export as
 * HTML" uses -- so print output and exported files stay identical by
 * construction, and are always light regardless of the app theme.
 */

/** How long to wait for fonts/images before printing anyway. */
const ASSET_TIMEOUT_MS = 3000

/** Fallback for engines that never fire `afterprint`, so the node cannot leak. */
const IFRAME_CLEANUP_MS = 60000

/**
 * Compose the printable document. Pure -- separated from the iframe plumbing so
 * it can be unit-tested.
 */
export function buildPrintDocument(bodyHtml: string, title: string): string {
  return wrapHtmlDocument(bodyHtml, title)
}

/**
 * Replace ```mermaid source blocks with their rendered SVG.
 *
 * `editor.getHTML()` returns what the Mermaid node's `renderHTML` emits --
 * `<pre><code class="language-mermaid">` around the *source* -- not the SVG the
 * node view renders into the live DOM. Without this, diagrams would print as
 * code. Returns the input unchanged when there is nothing to do.
 */
export async function inlineMermaidDiagrams(bodyHtml: string): Promise<string> {
  if (!bodyHtml.includes('language-mermaid')) return bodyHtml

  const parsed = new DOMParser().parseFromString(
    `<div id="print-root">${bodyHtml}</div>`,
    'text/html'
  )
  const root = parsed.getElementById('print-root')
  if (!root) return bodyHtml

  const blocks = Array.from(root.querySelectorAll('pre > code.language-mermaid'))
  if (blocks.length === 0) return bodyHtml

  let mermaid
  try {
    mermaid = await loadMermaid()
  } catch {
    // Library unavailable -- print the source rather than nothing.
    return bodyHtml
  }

  // Force the light theme. MermaidNodeView renders at the *app* theme, so a
  // diagram authored in dark mode would otherwise print dark-on-white.
  // Re-initialising globally is safe: MermaidNodeView re-initialises on every
  // render, so this corrects itself.
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' })

  for (const block of blocks) {
    const pre = block.parentElement
    const source = (block.textContent || '').trim()
    if (!pre || !source) continue
    try {
      // nextMermaidRenderId() is mandatory, never a fixed id: Mermaid prefixes
      // its internal marker/clipPath ids with the render id and resolves
      // url(#...) to the first document-order match, so a reused id makes one
      // diagram's arrowheads point at another's markers.
      const { svg } = await mermaid.render(nextMermaidRenderId(), source)
      const holder = parsed.createElement('div')
      holder.className = 'mermaid-print'
      holder.innerHTML = svg
      pre.replaceWith(holder)
    } catch {
      // Leave the original <pre> in place so the source still prints.
    }
  }

  return root.innerHTML
}

/** Resolve once webfonts and images are ready, or once the timeout expires. */
async function settleAssets(frameWindow: Window): Promise<void> {
  const doc = frameWindow.document
  const pending = Array.from(doc.images)
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
    )

  const ready = Promise.all([doc.fonts ? doc.fonts.ready : Promise.resolve(), ...pending])
  // A hanging remote image must not block printing forever.
  await Promise.race([
    ready,
    new Promise<void>((resolve) => frameWindow.setTimeout(resolve, ASSET_TIMEOUT_MS)),
  ])
}

let printInFlight = false

/**
 * Print a standalone HTML document via a hidden iframe.
 */
export async function printHtmlDocument(html: string): Promise<void> {
  if (printInFlight) return
  printInFlight = true

  // focus() below moves keyboard focus into the iframe, and nothing returns it
  // on its own. Without restoring it the editor goes deaf after one print --
  // typing and every shortcut, Ctrl+P included, would land in the hidden frame.
  const previouslyFocused = document.activeElement as HTMLElement | null
  const restoreFocus = () => {
    try {
      previouslyFocused?.focus?.()
    } catch {
      // Element may be gone; the browser falls back to <body>.
    }
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'Print preview')
  // Offscreen rather than `display: none` -- a display:none iframe generates no
  // layout in some engines and prints blank.
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;'

  try {
    await new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.srcdoc = html
      document.body.appendChild(iframe)
    })

    const frameWindow = iframe.contentWindow
    if (!frameWindow) {
      iframe.remove()
      return
    }

    await settleAssets(frameWindow)

    // Remove the iframe only once the dialog is done with it; tearing it down
    // early would cancel an in-progress print.
    let removed = false
    const removeIframe = () => {
      if (removed) return
      removed = true
      iframe.remove()
      restoreFocus()
    }
    frameWindow.addEventListener('afterprint', removeIframe, { once: true })
    window.setTimeout(removeIframe, IFRAME_CLEANUP_MS)

    frameWindow.focus()
    frameWindow.print()
    // print() blocks until the dialog closes in the engines we target, so the
    // app is usable again here -- do not wait for afterprint, which some
    // engines never fire.
    restoreFocus()
  } catch (err) {
    iframe.remove()
    restoreFocus()
    throw err
  } finally {
    // Released as soon as print() returns so a cancelled dialog does not lock
    // out the next attempt -- independent of when the iframe is removed.
    printInFlight = false
  }
}
