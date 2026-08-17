import { Editor, BubbleMenu } from '@tiptap/react'

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
      className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
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
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 100,
        placement: 'top',
        offset: [0, 10],
      }}
      shouldShow={({ editor }) => {
        return editor.isActive('table') && !editor.isActive('image')
      }}
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
