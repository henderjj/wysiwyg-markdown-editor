import { useEffect, useRef } from 'react'

interface TabContextMenuProps {
  x: number
  y: number
  docId: string
  onClose: () => void
  onCloseTab: (docId: string) => void
  onCloseOtherTabs: (docId: string) => void
  onCloseAllTabs: () => void
  onReload: (docId: string) => void
  onRename: (docId: string, filename: string) => void
  filename: string
  canReload: boolean
}

export function TabContextMenu({
  x,
  y,
  onClose,
  docId,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onReload,
  onRename,
  filename,
  canReload,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const items = [
    { label: 'Close', action: () => onCloseTab(docId) },
    { label: 'Close Others', action: () => onCloseOtherTabs(docId) },
    { label: 'Close All', action: () => onCloseAllTabs() },
    { type: 'divider' as const },
    { label: 'Reload from Disk', action: () => onReload(docId), disabled: !canReload },
    { label: 'Rename', action: () => onRename(docId, filename) },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-[160px] py-1 z-50"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) =>
        'type' in item && item.type === 'divider' ? (
          <div key={i} className="border-t border-gray-200 dark:border-gray-600 my-1" />
        ) : (
          <button
            key={i}
            className={`w-full text-left px-3 py-1.5 text-sm ${
              (item as { disabled?: boolean }).disabled
                ? 'text-gray-400 dark:text-gray-500 cursor-default'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
            disabled={(item as { disabled?: boolean }).disabled}
            onClick={() => {
              (item as { action: () => void }).action()
              onClose()
            }}
          >
            {(item as { label: string }).label}
          </button>
        )
      )}
    </div>
  )
}
