import { useCallback, useMemo } from 'react'
import { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

interface FloatingTableToolbarProps {
  editor: Editor
}

interface ToolbarButtonProps {
  onClick: () => void
  title: string
  children: React.ReactNode
  danger?: boolean
}

function ToolbarButton({ onClick, title, children, danger }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function Separator() {
  return <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
}

export function FloatingTableToolbar({ editor }: FloatingTableToolbarProps) {
  // See the matching comment in FloatingImageToolbar.tsx -- BubbleMenu's
  // internal effect dispatches a transaction whenever shouldShow/options
  // change reference, and inline literals here change reference every
  // render, which loops forever once shouldRerenderOnTransaction is on.
  const shouldShow = useCallback(
    ({ editor }: { editor: Editor }) => editor.isActive('table') && !editor.isActive('image'),
    []
  )
  const options = useMemo(() => ({ placement: 'top' as const, offset: 10 }), [])

  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBubbleMenu"
      options={options}
      shouldShow={shouldShow}
      className="flex items-center gap-0.5 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
    >
      {/* Column operations */}
      <ToolbarButton
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        title="Add column before"
      >
        ← Col
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title="Add column after"
      >
        Col →
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title="Delete column"
        danger
      >
        ✕ Col
      </ToolbarButton>

      <Separator />

      {/* Row operations */}
      <ToolbarButton
        onClick={() => editor.chain().focus().addRowBefore().run()}
        title="Add row above"
      >
        ↑ Row
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title="Add row below"
      >
        Row ↓
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().deleteRow().run()}
        title="Delete row"
        danger
      >
        ✕ Row
      </ToolbarButton>

      <Separator />

      {/* Cell operations */}
      <ToolbarButton
        onClick={() => editor.chain().focus().mergeCells().run()}
        title="Merge cells"
      >
        Merge
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().splitCell().run()}
        title="Split cell"
      >
        Split
      </ToolbarButton>

      <Separator />

      {/* Header toggle */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
        title="Toggle header row"
      >
        Header
      </ToolbarButton>

      <Separator />

      {/* Delete table */}
      <ToolbarButton
        onClick={() => editor.chain().focus().deleteTable().run()}
        title="Delete table"
        danger
      >
        ✕ Table
      </ToolbarButton>
    </BubbleMenu>
  )
}
