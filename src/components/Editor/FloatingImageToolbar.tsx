import { useCallback, useMemo } from 'react'
import { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'

interface FloatingImageToolbarProps {
  editor: Editor
  onEditImage: () => void
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

export function FloatingImageToolbar({ editor, onEditImage }: FloatingImageToolbarProps) {
  // BubbleMenu's React wrapper has an internal effect keyed on [shouldShow,
  // options, ...] whose body dispatches a ProseMirror transaction to sync
  // them into the plugin. Passing these inline means a fresh function/object
  // reference every render, so with shouldRerenderOnTransaction: true on
  // useEditor (needed for live toolbar highlighting elsewhere), the loop is:
  // transaction -> Editor re-renders -> new shouldShow/options references ->
  // effect fires -> dispatches a transaction -> repeat. React catches this
  // as "Maximum update depth exceeded" and the app fails to render at all --
  // caught by a manual browser verification pass, not by the type checker or
  // the test suite. Memoizing both breaks the cycle at its root.
  const shouldShow = useCallback(({ editor }: { editor: Editor }) => editor.isActive('image'), [])
  const options = useMemo(() => ({ placement: 'top' as const, offset: 10 }), [])

  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      options={options}
      shouldShow={shouldShow}
      className="flex items-center gap-0.5 px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg"
    >
      <ToolbarButton
        onClick={onEditImage}
        title="Edit image"
      >
        Edit
      </ToolbarButton>

      <Separator />

      <ToolbarButton
        onClick={() => editor.chain().focus().deleteSelection().run()}
        title="Delete image"
        danger
      >
        Delete
      </ToolbarButton>
    </BubbleMenu>
  )
}
