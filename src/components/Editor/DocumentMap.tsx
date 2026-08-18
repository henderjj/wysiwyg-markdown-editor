import { useEffect, useState, useCallback, useRef } from 'react'
import { Editor } from '@tiptap/react'

interface HeadingItem {
  level: number
  text: string
  pos: number
}

interface DocumentMapProps {
  editor: Editor | null
  onClose: () => void
  activeDocId?: string
}

const MIN_WIDTH = 120
const MAX_WIDTH = 480
const STORAGE_KEY = 'wysiwyg-md-docmap-width'

function loadWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const val = parseInt(stored, 10)
      if (val >= MIN_WIDTH && val <= MAX_WIDTH) return val
    }
  } catch {
    // localStorage unavailable (private browsing / storage disabled) — use the default
  }
  return 224 // w-56 = 14rem = 224px
}

export function DocumentMap({ editor, onClose, activeDocId }: DocumentMapProps) {
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activePos, setActivePos] = useState<number | null>(null)
  const [width, setWidth] = useState(loadWidth)
  const isResizing = useRef(false)

  const extractHeadings = useCallback(() => {
    if (!editor) return
    const items: HeadingItem[] = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        items.push({
          level: node.attrs.level as number,
          text: node.textContent,
          pos,
        })
      }
    })
    setHeadings(items)
  }, [editor])

  // Extract headings on mount and on any document change (including setContent which doesn't emit 'update')
  useEffect(() => {
    // This project has no React Compiler enabled, so the rule's cascading-
    // render concern doesn't apply to this build; the pattern itself (derive
    // state from an external source on mount/change) is safe and correct.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    extractHeadings()
    if (!editor) return
    const handler = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) extractHeadings()
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor, extractHeadings])

  // Re-extract headings when the active document changes (tab switch, file open)
  useEffect(() => {
    const timer = setTimeout(extractHeadings, 150)
    return () => clearTimeout(timer)
  }, [activeDocId, extractHeadings])

  // Track cursor position to highlight current heading
  useEffect(() => {
    if (!editor) return
    const updateActive = () => {
      const cursorPos = editor.state.selection.$head.pos
      // Find the heading closest to (and before) the cursor
      let closest: HeadingItem | null = null
      for (const h of headings) {
        if (h.pos <= cursorPos) {
          closest = h
        } else {
          break
        }
      }
      setActivePos(closest?.pos ?? null)
    }
    updateActive()
    editor.on('selectionUpdate', updateActive)
    return () => { editor.off('selectionUpdate', updateActive) }
  }, [editor, headings])

  const handleClick = useCallback((pos: number) => {
    if (!editor) return
    editor.commands.setTextSelection(pos + 1)
    editor.commands.focus()
    // Scroll the heading into view
    const domNode = editor.view.domAtPos(pos + 1)
    const el = domNode.node instanceof HTMLElement ? domNode.node : domNode.node.parentElement
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [editor])

  // Resize handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = width

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)))
      setWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth((w) => {
        localStorage.setItem(STORAGE_KEY, String(w))
        return w
      })
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [width])

  return (
    <div className="flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto relative" style={{ width }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-600">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Document Map
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
        >
          ×
        </button>
      </div>
      <nav className="py-2">
        {headings.length === 0 ? (
          <p className="px-3 text-xs text-gray-400 dark:text-gray-500 italic">No headings found</p>
        ) : (
          headings.map((h, i) => (
            <button
              key={i}
              onClick={() => handleClick(h.pos)}
              className={`w-full text-left px-3 py-1 text-sm truncate transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                h.pos === activePos
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 font-medium'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
              style={{ paddingLeft: `${(h.level - 1) * 12 + 12}px` }}
              title={h.text}
            >
              <span className="text-gray-400 dark:text-gray-500 text-xs mr-1">H{h.level}</span>
              {h.text}
            </button>
          ))
        )}
      </nav>
      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 transition-colors"
        onMouseDown={handleResizeStart}
      />
    </div>
  )
}
