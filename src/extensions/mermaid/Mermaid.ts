import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection, type EditorState } from '@tiptap/pm/state'
import { MermaidNodeView } from './MermaidNodeView'

const DEFAULT_DIAGRAM = 'graph TD;\n  A[Start] --> B[End];'

export interface MermaidOptions {
  /**
   * Called with the diagram source when the user asks for the expanded viewer.
   * Wired up by the Editor component, which owns the viewer dialog.
   */
  onExpand: ((source: string) => void) | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      /** Insert a new Mermaid diagram block (defaults to a starter flowchart). */
      insertMermaid: (source?: string) => ReturnType
      /** Open the expanded viewer for the diagram containing the cursor. */
      expandMermaid: () => ReturnType
    }
  }
}

/**
 * Source text of the mermaid node containing the selection, or null if the
 * selection is not inside one.
 *
 * Walks the position's ancestors rather than using `editor.isActive('mermaid')`
 * so that it stays a pure function of the state (testable without an editor),
 * handles a NodeSelection on a click-selected block, and returns the source in
 * the same call.
 */
export function findMermaidSource(state: EditorState): string | null {
  const { selection } = state
  if (selection instanceof NodeSelection && selection.node.type.name === 'mermaid') {
    return selection.node.textContent
  }
  const { $from } = selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'mermaid') return node.textContent
  }
  return null
}

/**
 * A dedicated node for Mermaid diagrams. It claims `<pre><code class="language-mermaid">`
 * on parse (higher priority than CodeBlockLowlight, which handles every other
 * fenced code block) and serialises back to the identical HTML, so the existing
 * Turndown `fencedCodeBlock` rule exports it as a ```mermaid fence unchanged.
 * Rendering/editing is handled by MermaidNodeView.
 */
export const Mermaid = Node.create<MermaidOptions>({
  name: 'mermaid',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,

  addOptions() {
    return { onExpand: null }
  },

  parseHTML() {
    return [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        priority: 100,
        getAttrs: (element) => {
          const code = (element as HTMLElement).firstElementChild
          const className = code?.getAttribute('class') || ''
          // Match only mermaid code blocks; return false so everything else
          // falls through to CodeBlockLowlight's lower-priority rule.
          return /(?:^|\s)language-mermaid(?:\s|$)/.test(className) ? {} : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes), ['code', { class: 'language-mermaid' }, 0]]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView)
  },

  addCommands() {
    return {
      insertMermaid:
        (source = DEFAULT_DIAGRAM) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'text', text: source }],
          }),

      expandMermaid:
        () =>
        ({ state }) => {
          const source = findMermaidSource(state)
          if (source === null || !source.trim()) return false
          this.options.onExpand?.(source)
          return true
        },
    }
  },

  // Alt+Enter rather than a Ctrl combination: App.tsx's global shortcut handler
  // bails on anything without Ctrl/Cmd, so an Alt combo cannot collide with it.
  // (Ctrl+Shift+M is not free — App.tsx handles `case 'm'` without checking
  // shiftKey, so it toggles the Markdown Preview pane.)
  addKeyboardShortcuts() {
    return {
      'Alt-Enter': ({ editor }) => editor.commands.expandMermaid(),
    }
  },
})
