import { useState, useId } from 'react'
import { isAllowedLinkHref, type HeadingOption } from '../../lib/linkEditing'

interface LinkDialogProps {
  mode: 'insert' | 'edit'
  initialHref: string
  initialText: string
  /** False when the target's text can't be replaced (see LinkTarget.textEditable) */
  textEditable: boolean
  headings: HeadingOption[]
  onSubmit: (href: string, text: string) => void
  onRemove: () => void
  onClose: () => void
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 ' +
  'text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 ' +
  'disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800 dark:disabled:text-gray-400'

// Mounted only while open, so state initialises from props on every opening.
export function LinkDialog({
  mode, initialHref, initialText, textEditable, headings, onSubmit, onRemove, onClose,
}: LinkDialogProps) {
  const [href, setHref] = useState(initialHref)
  const [text, setText] = useState(initialText)
  const id = useId()

  const trimmedHref = href.trim()
  const disallowed = trimmedHref !== '' && !isAllowedLinkHref(trimmedHref)
  const canSubmit = trimmedHref !== '' && !disallowed
  const selectedHeading = headings.find(h => `#${h.slug}` === trimmedHref)?.slug ?? ''

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(trimmedHref, textEditable ? text : initialText)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleHeadingChange = (slug: string) => {
    if (!slug) return
    setHref(`#${slug}`)
    const heading = headings.find(h => h.slug === slug)
    if (heading && textEditable && !text.trim()) setText(heading.text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[440px] max-w-[calc(100vw-32px)]"
      >
        <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {mode === 'insert' ? 'Insert Link' : 'Edit Link'}
        </h2>

        {/* Display text */}
        <div className="mb-4">
          <label htmlFor={`${id}-text`} className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Text to display
          </label>
          <input
            id={`${id}-text`}
            type="text"
            value={textEditable ? text : initialText}
            onChange={(e) => setText(e.target.value)}
            disabled={!textEditable}
            placeholder="Leave empty to show the URL"
            className={inputClass}
          />
          {!textEditable && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              The selection spans several paragraphs or contains images or comments, so only the URL can be changed.
            </p>
          )}
        </div>

        {/* URL */}
        <div className="mb-4">
          <label htmlFor={`${id}-href`} className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            URL
          </label>
          <input
            id={`${id}-href`}
            type="text"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://example.com or #heading"
            autoFocus
            aria-invalid={disallowed}
            aria-describedby={disallowed ? `${id}-href-error` : undefined}
            className={inputClass}
          />
          {disallowed && (
            <p id={`${id}-href-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
              This kind of link isn't allowed.
            </p>
          )}
        </div>

        {/* Heading picker */}
        {headings.length > 0 && (
          <div className="mb-4">
            <label htmlFor={`${id}-heading`} className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              Or link to a heading in this document
            </label>
            <select
              id={`${id}-heading`}
              value={selectedHeading}
              onChange={(e) => handleHeadingChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose a heading…</option>
              {headings.map(h => (
                <option key={h.slug} value={h.slug}>
                  {'  '.repeat(h.level - 1)}{h.text}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {mode === 'edit' && (
            <button
              type="button"
              onClick={onRemove}
              className="px-4 py-2 text-sm text-red-600 dark:text-red-400 rounded-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              Remove Link
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'insert' ? 'Insert Link' : 'Update Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
