import { useEffect, useRef, useCallback } from 'react'
import { Editor } from '@tiptap/react'
import { pasteAsMarkdown } from '../../lib/pasteAsMarkdown'
import { readClipboardText, writeClipboardText } from '../../lib/clipboard'
import { getSelectedHtml, htmlToMarkdown } from '../../lib/markdown'

interface ContextMenuProps {
  x: number
  y: number
  editor: Editor
  onClose: () => void
}

interface ContextMenuItem {
  type: 'action' | 'divider'
  label?: string
  action?: () => void
  danger?: boolean
}

export function ContextMenu({ x, y, editor, onClose }: ContextMenuProps) {
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

  const hasSelection = !editor.state.selection.empty

  const handleCut = useCallback(() => {
    document.execCommand('cut')
    onClose()
  }, [onClose])

  const handleCopy = useCallback(() => {
    document.execCommand('copy')
    onClose()
  }, [onClose])

  const handlePaste = useCallback(async () => {
    try {
      const text = await readClipboardText()
      editor.chain().focus().insertContent(text).run()
    } catch {
      document.execCommand('paste')
    }
    onClose()
  }, [editor, onClose])

  const handlePasteAsMarkdown = useCallback(async () => {
    const html = await pasteAsMarkdown()
    if (html) {
      editor.chain().focus().insertContent(html).run()
    }
    onClose()
  }, [editor, onClose])

  const handleCopyAsMarkdown = useCallback(async () => {
    const html = getSelectedHtml(editor)
    if (html) {
      const markdown = htmlToMarkdown(html)
      await writeClipboardText(markdown)
    }
    onClose()
  }, [editor, onClose])

  const handleCopyAsHtml = useCallback(async () => {
    const html = getSelectedHtml(editor)
    if (html) {
      await writeClipboardText(html)
    }
    onClose()
  }, [editor, onClose])

  const handleCopyAsPlainText = useCallback(async () => {
    const html = getSelectedHtml(editor)
    if (html) {
      const div = document.createElement('div')
      div.innerHTML = html
      await writeClipboardText(div.textContent || '')
    }
    onClose()
  }, [editor, onClose])

  const handleSelectAll = useCallback(() => {
    editor.chain().focus().setTextSelection({ from: 0, to: editor.state.doc.content.size }).run()
    onClose()
  }, [editor, onClose])

  const items: ContextMenuItem[] = [
    { type: 'action', label: 'Cut', action: handleCut },
    { type: 'action', label: 'Copy', action: handleCopy },
    { type: 'action', label: 'Paste', action: handlePaste },
    { type: 'action', label: 'Paste as Markdown', action: handlePasteAsMarkdown },
    ...(hasSelection ? [
      { type: 'action' as const, label: 'Copy as Markdown', action: handleCopyAsMarkdown },
      { type: 'action' as const, label: 'Copy as HTML', action: handleCopyAsHtml },
      { type: 'action' as const, label: 'Copy as Plain Text', action: handleCopyAsPlainText },
    ] : []),
    { type: 'divider' },
    { type: 'action', label: 'Select All', action: handleSelectAll },
  ]

  // Add formatting options if text is selected
  if (hasSelection) {
    items.push(
      { type: 'divider' },
      { type: 'action', label: 'Bold', action: () => { editor.chain().focus().toggleBold().run(); onClose() } },
      { type: 'action', label: 'Italic', action: () => { editor.chain().focus().toggleItalic().run(); onClose() } },
      { type: 'action', label: 'Strikethrough', action: () => { editor.chain().focus().toggleStrike().run(); onClose() } },
      { type: 'action', label: 'Code', action: () => { editor.chain().focus().toggleCode().run(); onClose() } },
    )
  }

  // Link options
  if (editor.isActive('link')) {
    items.push(
      { type: 'divider' },
      {
        type: 'action',
        label: 'Edit Link',
        action: () => {
          const currentHref = editor.getAttributes('link').href
          const url = window.prompt('Edit URL:', currentHref)
          if (url !== null) {
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }
          onClose()
        },
      },
      {
        type: 'action',
        label: 'Remove Link',
        action: () => { editor.chain().focus().unsetLink().run(); onClose() },
      },
      {
        type: 'action',
        label: 'Open Link',
        action: () => {
          const href = editor.getAttributes('link').href
          if (href) window.open(href, '_blank')
          onClose()
        },
      },
    )
  }

  // Image options
  if (editor.isActive('image')) {
    items.push(
      { type: 'divider' },
      {
        type: 'action',
        label: 'Delete Image',
        action: () => { editor.chain().focus().deleteSelection().run(); onClose() },
        danger: true,
      },
    )
  }

  // Adjust position to keep menu on screen
  const adjustedX = Math.min(x, window.innerWidth - 200)
  const adjustedY = Math.min(y, window.innerHeight - 300)

  return (
    <div
      ref={menuRef}
      className="fixed bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-[160px] py-1 z-50"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {items.map((item, i) =>
        item.type === 'divider' ? (
          <div key={i} className="border-t border-gray-200 dark:border-gray-600 my-1" />
        ) : (
          <button
            key={i}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
              item.danger ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'
            }`}
            onClick={item.action}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
