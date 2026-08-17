import { useEffect } from 'react'

interface KeyboardShortcutsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; description: string }[]
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'File',
    shortcuts: [
      { keys: 'Ctrl+N', description: 'New document' },
      { keys: 'Ctrl+O', description: 'Open file' },
      { keys: 'Ctrl+S', description: 'Save' },
      { keys: 'Ctrl+Shift+S', description: 'Save As' },
      { keys: 'Ctrl+W', description: 'Close tab' },
      { keys: 'F5', description: 'Reload from disk' },
      { keys: 'Ctrl+P', description: 'Print' },
    ],
  },
  {
    title: 'Formatting',
    shortcuts: [
      { keys: 'Ctrl+B', description: 'Bold' },
      { keys: 'Ctrl+I', description: 'Italic' },
      { keys: 'Ctrl+U', description: 'Underline' },
      { keys: 'Ctrl+Shift+X', description: 'Strikethrough' },
      { keys: 'Ctrl+E', description: 'Code' },
      { keys: 'Ctrl+Shift+B', description: 'Blockquote' },
    ],
  },
  {
    title: 'Editor',
    shortcuts: [
      { keys: 'Tab', description: 'Indent list item / Next table cell / Indent code' },
      { keys: 'Shift+Tab', description: 'Outdent list item / Previous table cell / Outdent code' },
      { keys: 'Escape, Tab', description: 'Move focus out of editor' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: 'Ctrl+F', description: 'Find' },
      { keys: 'Ctrl+H', description: 'Find & Replace' },
      { keys: 'Ctrl+Tab', description: 'Next tab' },
      { keys: 'Ctrl+Shift+Tab', description: 'Previous tab' },
      { keys: 'Ctrl+Shift+V', description: 'Paste as Markdown' },
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Y', description: 'Redo' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: 'Ctrl+M', description: 'Markdown Preview' },
      { keys: 'Ctrl+D', description: 'Document Map' },
      { keys: 'Ctrl+=', description: 'Zoom in' },
      { keys: 'Ctrl+-', description: 'Zoom out' },
      { keys: 'Ctrl+0', description: 'Reset zoom' },
      { keys: 'Alt+Enter', description: 'Expand diagram (cursor in a diagram)' },
      { keys: 'F1', description: 'Keyboard shortcuts' },
    ],
  },
]

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[520px] max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-5">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.keys} className="flex items-center justify-between py-1">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
                    <kbd className="px-2 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
