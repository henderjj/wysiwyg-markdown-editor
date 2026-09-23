import { useEffect } from 'react'

/**
 * While a modal form dialog is open, keep App.tsx's window-level shortcuts
 * (Ctrl/Cmd+anything, F1, F5) from acting on the document behind it.
 *
 * Capture phase on `window` so it runs before App's bubble-phase handler.
 * Only propagation is stopped — never the default action — so Ctrl+A/C/V/Z
 * still work natively inside the dialog's text inputs. Tab is never touched
 * (WCAG 2.1.2: no keyboard trap). Same approach as MermaidViewerDialog.
 */
export function useModalKeyIsolation(isOpen: boolean): void {
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return
      if (e.ctrlKey || e.metaKey || e.key === 'F1' || e.key === 'F5') e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isOpen])
}
