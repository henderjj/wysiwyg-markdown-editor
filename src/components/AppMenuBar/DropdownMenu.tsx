import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { MenuItem, MenuAction, MenuToggle, MenuSubmenu } from './menuDefinitions'

interface DropdownMenuProps {
  items: MenuItem[]
  onAction: (action: string) => void
  onClose: () => void
  onNavigateLeft?: () => void
  onNavigateRight?: () => void
}

function MenuItemComponent({
  item,
  onAction,
  onClose,
  isFocused,
  onMouseEnterItem,
  onCloseSubmenu,
  submenuForcedOpen,
}: {
  item: MenuItem
  onAction: (action: string) => void
  onClose: () => void
  isFocused: boolean
  onMouseEnterItem: () => void
  onCloseSubmenu?: () => void
  submenuForcedOpen?: boolean
}) {
  const [submenuHover, setSubmenuHover] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)
  const submenuTimerRef = useRef<number | null>(null)

  const submenuOpen = submenuHover || (submenuForcedOpen ?? false)

  const handleMouseEnter = useCallback(() => {
    onMouseEnterItem()
    if (item.type === 'submenu') {
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current)
      setSubmenuHover(true)
    }
  }, [item.type, onMouseEnterItem])

  const handleMouseLeave = useCallback(() => {
    if (item.type === 'submenu') {
      submenuTimerRef.current = window.setTimeout(() => setSubmenuHover(false), 200)
    }
  }, [item.type])

  useEffect(() => {
    return () => {
      if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current)
    }
  }, [])

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && itemRef.current) {
      itemRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [isFocused])

  if (item.type === 'divider') {
    return <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
  }

  const focusedClass = isFocused ? 'bg-gray-100 dark:bg-gray-600' : ''

  if (item.type === 'submenu') {
    const sub = item as MenuSubmenu
    return (
      <div
        ref={itemRef}
        className="relative"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className={`flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-default ${focusedClass}`}>
          <span className="flex items-center gap-2"><span className="w-4" /><span>{sub.label}</span></span>
          <span className="ml-4 text-gray-400 text-xs">&gt;</span>
        </div>
        {submenuOpen && (
          <DropdownMenu
            items={sub.items}
            onAction={onAction}
            onClose={onClose}
            onNavigateLeft={() => {
              setSubmenuHover(false)
              onCloseSubmenu?.()
            }}
            isSubmenu
          />
        )}
      </div>
    )
  }

  if (item.type === 'toggle') {
    const toggle = item as MenuToggle
    return (
      <div ref={itemRef} onMouseEnter={handleMouseEnter}>
        <button
          className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 text-left ${focusedClass}`}
          onClick={() => {
            onAction(toggle.action)
            onClose()
          }}
        >
          <span className="flex items-center gap-2">
            <span className="w-4 text-center">{toggle.checked ? '\u2713' : ''}</span>
            <span>{toggle.label}</span>
          </span>
          {toggle.shortcut && (
            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{toggle.shortcut}</span>
          )}
        </button>
      </div>
    )
  }

  // action
  const action = item as MenuAction
  return (
    <div ref={itemRef} onMouseEnter={handleMouseEnter}>
      <button
        className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left ${
          action.disabled
            ? 'text-gray-400 dark:text-gray-500 cursor-default'
            : `text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 ${focusedClass}`
        }`}
        disabled={action.disabled}
        onClick={() => {
          if (!action.disabled) {
            onAction(action.action)
            onClose()
          }
        }}
      >
        <span className="flex items-center gap-2">
          <span className="w-4" />
          <span>{action.label}</span>
        </span>
        {action.shortcut && (
          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{action.shortcut}</span>
        )}
      </button>
    </div>
  )
}

export function DropdownMenu({ items, onAction, onClose, onNavigateLeft, onNavigateRight, isSubmenu }: DropdownMenuProps & { isSubmenu?: boolean }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [submenuOpenIndex, setSubmenuOpenIndex] = useState<number | null>(null)

  // Build list of focusable indices (non-divider, non-disabled items)
  const focusableIndices = useMemo(() => {
    const indices: number[] = []
    items.forEach((item, i) => {
      if (item.type === 'divider') return
      if (item.type === 'action' && (item as MenuAction).disabled) return
      indices.push(i)
    })
    return indices
  }, [items])

  // Auto-focus the menu container when it opens
  useEffect(() => {
    if (menuRef.current) {
      menuRef.current.focus()
    }
  }, [])

  // Click outside to close (only for top-level menus)
  useEffect(() => {
    if (isSubmenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose, isSubmenu])

  const moveFocus = useCallback((direction: 1 | -1) => {
    setFocusedIndex((prev) => {
      const currentPos = focusableIndices.indexOf(prev)
      if (currentPos === -1) return focusableIndices[0] ?? 0
      const nextPos = (currentPos + direction + focusableIndices.length) % focusableIndices.length
      return focusableIndices[nextPos]
    })
    setSubmenuOpenIndex(null)
  }, [focusableIndices])

  const activateItem = useCallback((index: number) => {
    const item = items[index]
    if (!item || item.type === 'divider') return

    if (item.type === 'submenu') {
      setSubmenuOpenIndex(index)
      return
    }

    if (item.type === 'toggle') {
      onAction((item as MenuToggle).action)
      onClose()
      return
    }

    const action = item as MenuAction
    if (!action.disabled) {
      onAction(action.action)
      onClose()
    }
  }, [items, onAction, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        moveFocus(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        moveFocus(-1)
        break
      case 'Home':
        e.preventDefault()
        e.stopPropagation()
        if (focusableIndices.length > 0) {
          setFocusedIndex(focusableIndices[0])
          setSubmenuOpenIndex(null)
        }
        break
      case 'End':
        e.preventDefault()
        e.stopPropagation()
        if (focusableIndices.length > 0) {
          setFocusedIndex(focusableIndices[focusableIndices.length - 1])
          setSubmenuOpenIndex(null)
        }
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        e.stopPropagation()
        activateItem(focusedIndex)
        break
      case 'ArrowRight': {
        e.preventDefault()
        e.stopPropagation()
        const item = items[focusedIndex]
        if (item?.type === 'submenu') {
          setSubmenuOpenIndex(focusedIndex)
        } else {
          onNavigateRight?.()
        }
        break
      }
      case 'ArrowLeft':
        e.preventDefault()
        e.stopPropagation()
        if (isSubmenu) {
          onNavigateLeft?.()
        } else {
          onNavigateLeft?.()
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
    }
  }, [moveFocus, activateItem, focusedIndex, focusableIndices, items, onNavigateLeft, onNavigateRight, isSubmenu, onClose])

  const positionClass = isSubmenu
    ? 'absolute left-full top-0 ml-0'
    : 'absolute top-full left-0 mt-0.5'

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      className={`${positionClass} bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-[220px] py-1 z-50 outline-none`}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, i) => (
        <MenuItemComponent
          key={i}
          item={item}
          onAction={onAction}
          onClose={onClose}
          isFocused={i === focusedIndex}
          onMouseEnterItem={() => {
            if (item.type !== 'divider') {
              setFocusedIndex(i)
            }
          }}
          onCloseSubmenu={() => {
            setSubmenuOpenIndex(null)
            menuRef.current?.focus()
          }}
          submenuForcedOpen={submenuOpenIndex === i}
        />
      ))}
    </div>
  )
}
