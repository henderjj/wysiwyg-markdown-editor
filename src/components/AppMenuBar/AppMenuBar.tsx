import { useState, useCallback, useEffect, useRef } from 'react'
import { DropdownMenu } from './DropdownMenu'
import { buildMenus, type MenuState } from './menuDefinitions'

interface AppMenuBarProps {
  menuState: MenuState
  onAction: (action: string) => void
  focusEditor?: () => void
}

export function AppMenuBar({ menuState, onAction, focusEditor }: AppMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const [menuBarActive, setMenuBarActive] = useState(false)
  const [altPressed, setAltPressed] = useState(false)
  const menuBarRef = useRef<HTMLDivElement>(null)

  const menus = buildMenus(menuState)

  const handleMenuClick = useCallback((index: number) => {
    setOpenMenu((prev) => {
      if (prev === index) {
        setMenuBarActive(false)
        return null
      }
      setMenuBarActive(true)
      return index
    })
  }, [])

  const handleMouseEnter = useCallback((index: number) => {
    // Hover-through: only switch if a menu is already open
    if (menuBarActive && openMenu !== null) {
      setOpenMenu(index)
    }
  }, [menuBarActive, openMenu])

  const handleClose = useCallback(() => {
    setOpenMenu(null)
    setMenuBarActive(false)
    focusEditor?.()
  }, [focusEditor])

  // Escape to close menu (window-level)
  useEffect(() => {
    if (openMenu === null) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openMenu, handleClose])

  // Alt+letter accelerators
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return
      const key = e.key.toUpperCase()
      const index = menus.findIndex((m) => m.accelerator === key)
      if (index >= 0) {
        e.preventDefault()
        handleMenuClick(index)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [menus, handleMenuClick])

  // Track Alt key for accelerator underlines
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltPressed(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltPressed(false)
    }
    const onBlur = () => setAltPressed(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur-sm', onBlur)
    }
  }, [])

  // Click outside to close
  useEffect(() => {
    if (openMenu === null) return
    const handler = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openMenu, handleClose])

  const navigateMenu = useCallback((direction: 1 | -1) => {
    setOpenMenu((prev) => (prev !== null ? (prev + direction + menus.length) % menus.length : 0))
  }, [menus.length])

  const isDark = menuState.theme === 'dark' || (menuState.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const cycleTheme = useCallback(() => {
    if (menuState.theme === 'light') onAction('view.theme.dark')
    else if (menuState.theme === 'dark') onAction('view.theme.system')
    else onAction('view.theme.light')
  }, [menuState.theme, onAction])

  return (
    <div ref={menuBarRef} className="flex items-center h-8 select-none">
      {menus.map((menu, index) => {
        // Render label with accelerator underline (only first matching char, only when Alt held)
        let matched = false
        const labelSpans = menu.accelerator ? (
          <>
            {menu.label.split('').map((char, ci) => {
              if (!matched && char.toUpperCase() === menu.accelerator) {
                matched = true
                return (
                  <span key={ci} className={altPressed ? 'underline' : ''}>
                    {char}
                  </span>
                )
              }
              return <span key={ci}>{char}</span>
            })}
          </>
        ) : (
          menu.label
        )

        return (
          <div key={menu.label} className="relative">
            <button
              className={`px-3 h-8 text-sm transition-colors ${
                openMenu === index
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              onClick={() => handleMenuClick(index)}
              onMouseEnter={() => handleMouseEnter(index)}
            >
              <span>{labelSpans}</span>
            </button>
            {openMenu === index && (
              <DropdownMenu
                items={menu.items}
                onAction={(action) => {
                  onAction(action)
                  handleClose()
                }}
                onClose={handleClose}
                onNavigateLeft={() => navigateMenu(-1)}
                onNavigateRight={() => navigateMenu(1)}
              />
            )}
          </div>
        )
      })}
      <div className="ml-auto pr-2">
        <button
          onClick={cycleTheme}
          className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-sm transition-colors"
          title={`Theme: ${menuState.theme} (click to cycle)`}
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
