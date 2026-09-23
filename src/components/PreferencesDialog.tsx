import { useState, useEffect, useId, useRef } from 'react'
import { useModalKeyIsolation } from '../hooks/useModalKeyIsolation'
import type { CommentSettings } from '../lib/commentSettings'

interface PreferencesDialogProps {
  isOpen: boolean
  onClose: () => void
  commentSettings: CommentSettings
  onSave: (settings: CommentSettings) => void
  /** Name reported by the OS (desktop app only), shown as the author fallback */
  detectedAuthor: string | null
}

export function PreferencesDialog({ isOpen, onClose, commentSettings, onSave, detectedAuthor }: PreferencesDialogProps) {
  const [draft, setDraft] = useState(commentSettings)
  const titleId = useId()
  const authorId = useId()
  const triggerRef = useRef<Element | null>(null)
  useModalKeyIsolation(isOpen)

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement
      // Resetting form state when the dialog opens — see ImageDialog.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(commentSettings)
    }
  }, [isOpen, commentSettings])

  const close = () => {
    onClose()
    // Restore focus rather than dropping it on <body>.
    const trigger = triggerRef.current
    if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
  }

  const save = () => {
    onSave({ ...draft, authorOverride: draft.authorOverride.trim() })
    close()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text') {
      e.preventDefault()
      save()
    }
  }

  if (!isOpen) return null

  const effectiveAuthor = draft.authorOverride.trim() || detectedAuthor
  const checkboxClass = 'h-4 w-4 rounded-sm border-gray-300 dark:border-gray-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[460px] max-w-[calc(100vw-2rem)]"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Preferences</h2>

        <fieldset className="mb-6">
          <legend className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Comments</legend>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Added to the start of new review comments, e.g. <code>[Joe Bloggs 2026-09-21 14:00]: …</code>
          </p>

          <label className="flex items-center gap-2 mb-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={draft.includeAuthor}
              onChange={(e) => setDraft({ ...draft, includeAuthor: e.target.checked })}
              autoFocus
            />
            Include author name
          </label>

          <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              className={checkboxClass}
              checked={draft.includeTimestamp}
              onChange={(e) => setDraft({ ...draft, includeTimestamp: e.target.checked })}
            />
            Include date and time
          </label>

          <label htmlFor={authorId} className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Author name
          </label>
          <input
            id={authorId}
            type="text"
            value={draft.authorOverride}
            onChange={(e) => setDraft({ ...draft, authorOverride: e.target.value })}
            disabled={!draft.includeAuthor}
            placeholder={detectedAuthor ? `Detected: ${detectedAuthor}` : 'Your name'}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {draft.includeAuthor && !effectiveAuthor
              ? 'No name set — comments will not include an author.'
              : detectedAuthor
                ? 'Leave blank to use the name from your computer account.'
                : 'Your name as it should appear on comments.'}
          </p>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
