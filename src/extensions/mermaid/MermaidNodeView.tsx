import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadMermaid, nextMermaidRenderId } from './mermaidLoader'
import type { MermaidOptions } from './Mermaid'

function isDarkMode() {
  return document.documentElement.classList.contains('dark')
}

/**
 * React node view for a `mermaid` node.
 *
 * Graph mode (default): renders the diagram read-only via Mermaid. An "Edit"
 * button (and double-click) switches this single block to its editable source,
 * and an "Expand" button opens the zoom/pan viewer owned by the Editor.
 * Edit mode: shows the raw ```mermaid source as real ProseMirror content
 * (undo/redo, selection) with a "View" button to render again.
 */
export function MermaidNodeView({ node, editor, extension, getPos }: NodeViewProps) {
  const [editing, setEditing] = useState(false)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)

  // node.textContent updates on every edit, so graph mode always re-renders
  // from the latest source once the user switches back to View.
  const source = node.textContent

  const renderDiagram = useCallback(async () => {
    const code = node.textContent.trim()
    if (!code) {
      setSvg('')
      setError(null)
      return
    }
    try {
      const mermaid = await loadMermaid()
      // Re-initialise so the diagram follows the current app theme.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: isDarkMode() ? 'dark' : 'default',
      })
      const { svg: rendered } = await mermaid.render(nextMermaidRenderId(), code)
      setSvg(rendered)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSvg('')
    }
  }, [node.textContent])

  // Render whenever the source changes or we return to graph mode.
  useEffect(() => {
    if (!editing) void renderDiagram()
  }, [editing, source, renderDiagram])

  // Re-render diagrams when the app theme (dark/light class on <html>) changes.
  useEffect(() => {
    if (editing) return
    const observer = new MutationObserver(() => void renderDiagram())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [editing, renderDiagram])

  const stopMouse = useRef((e: React.MouseEvent) => e.preventDefault()).current

  const { onExpand } = extension.options as MermaidOptions

  /** This node's document position, or null if the node view is detached. */
  const safeGetPos = useCallback(() => {
    if (typeof getPos !== 'function') return null
    try {
      const pos = getPos()
      return typeof pos === 'number' ? pos : null
    } catch {
      return null
    }
  }, [getPos])

  // Escape while editing returns to graph mode.
  //
  // This has to be a window-level capture listener, not a React onKeyDown on
  // the wrapper. ProseMirror makes the whole editor a single contentEditable, so
  // keydown always targets `.ProseMirror` — an *ancestor* of this node view. The
  // event never descends into the node view's subtree, so a handler mounted here
  // is simply never in the event path. Capture on window also puts us ahead of
  // the EscapeTabExit extension, which would otherwise blur the editor instead.
  useEffect(() => {
    if (!editing) return

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // An open dialog (e.g. the expanded viewer) owns Escape while it has focus.
      if (document.activeElement?.closest('[role="dialog"]')) return

      // Only the diagram containing the caret should react — several blocks can
      // be in source mode at once.
      const pos = safeGetPos()
      if (pos === null) return
      const { from } = editor.state.selection
      if (from < pos || from >= pos + node.nodeSize) return

      e.preventDefault()
      e.stopPropagation()
      setEditing(false)
      // Park the selection on the node itself. Graph mode hides the source with
      // display:none, so leaving the caret inside it would give ProseMirror an
      // unrenderable selection.
      editor.commands.setNodeSelection(pos)
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [editing, editor, safeGetPos, node.nodeSize])

  if (editing) {
    return (
      <NodeViewWrapper className="mermaid-block mermaid-editor">
        <div className="mermaid-toolbar" contentEditable={false}>
          <button type="button" onMouseDown={stopMouse} onClick={() => setEditing(false)} title="Render diagram (Esc)">
            ◧ View
          </button>
        </div>
        <pre>
          <NodeViewContent as="code" className="language-mermaid" spellCheck={false} />
        </pre>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="mermaid-block">
      <div className="mermaid-graph" onDoubleClick={() => setEditing(true)}>
        {/* Expanding is read-only, so the toolbar is not gated on isEditable —
            only the Edit button is. */}
        <div className="mermaid-toolbar" contentEditable={false}>
          {svg && (
            <button
              type="button"
              onMouseDown={stopMouse}
              onClick={() => onExpand?.(node.textContent)}
              aria-label="Expand diagram"
              title="Expand diagram (Alt+Enter)"
            >
              ⤢ Expand
            </button>
          )}
          {editor.isEditable && (
            <button type="button" onMouseDown={stopMouse} onClick={() => setEditing(true)} title="Edit diagram source">
              ✎ Edit
            </button>
          )}
        </div>
        {error ? (
          <div className="mermaid-error" contentEditable={false}>
            <strong>Diagram error</strong>
            {'\n'}
            {error}
          </div>
        ) : svg ? (
          <div className="mermaid-svg" contentEditable={false} dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="mermaid-empty" contentEditable={false}>
            Empty diagram — click Edit to add Mermaid source.
          </div>
        )}
        {/* The source must stay mounted so ProseMirror keeps its contentDOM. */}
        <NodeViewContent as="code" style={{ display: 'none' }} />
      </div>
    </NodeViewWrapper>
  )
}
