import { useState, useEffect } from 'react'

interface ImageDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (src: string, alt: string) => void
  initialSrc?: string
  initialAlt?: string
  mode: 'insert' | 'edit'
}

export function ImageDialog({ isOpen, onClose, onSubmit, initialSrc = '', initialAlt = '', mode }: ImageDialogProps) {
  const [src, setSrc] = useState(initialSrc)
  const [alt, setAlt] = useState(initialAlt)
  const [previewStatus, setPreviewStatus] = useState<'empty' | 'loading' | 'loaded' | 'error'>('empty')
  const [imageDimensions, setImageDimensions] = useState<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (isOpen) {
      // This project has no React Compiler enabled, so the rule's cascading-
      // render concern doesn't apply; resetting form state when the dialog
      // opens is the standard, safe controlled-dialog pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSrc(initialSrc)
      setAlt(initialAlt)
      setPreviewStatus(initialSrc ? 'loading' : 'empty')
      setImageDimensions(null)
    }
  }, [isOpen, initialSrc, initialAlt])

  const handleSubmit = () => {
    if (!src.trim()) return
    onSubmit(src.trim(), alt.trim())
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[400px]">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {mode === 'insert' ? 'Insert Image' : 'Edit Image'}
        </h2>

        {/* Image URL */}
        <div className="mb-4">
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Image URL
          </label>
          <input
            type="text"
            value={src}
            onChange={(e) => {
              setSrc(e.target.value)
              setPreviewStatus(e.target.value.trim() ? 'loading' : 'empty')
              setImageDimensions(null)
            }}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/image.png"
            autoFocus
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>

        {/* Alt text */}
        <div className="mb-4">
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
            Alt text (optional)
          </label>
          <input
            type="text"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the image"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>

        {/* Fixed-size image preview */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-gray-600 dark:text-gray-300">Preview</p>
            {imageDimensions && (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {imageDimensions.w} × {imageDimensions.h}px
              </p>
            )}
          </div>
          <div className="h-40 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-hidden">
            {previewStatus === 'empty' && (
              <span className="text-sm text-gray-400 dark:text-gray-500">No image URL</span>
            )}
            {previewStatus === 'loading' && (
              <>
                <span className="text-sm text-gray-400 dark:text-gray-500">Loading...</span>
                <img
                  src={src.trim()}
                  alt={alt || 'Preview'}
                  className="hidden"
                  onLoad={(e) => {
                    const img = e.currentTarget
                    setImageDimensions({ w: img.naturalWidth, h: img.naturalHeight })
                    setPreviewStatus('loaded')
                  }}
                  onError={() => setPreviewStatus('error')}
                />
              </>
            )}
            {previewStatus === 'loaded' && (
              <img
                src={src.trim()}
                alt={alt || 'Preview'}
                className="max-w-full max-h-full object-contain"
              />
            )}
            {previewStatus === 'error' && (
              <span className="text-sm text-red-400 dark:text-red-500">Failed to load image</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!src.trim()}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'insert' ? 'Insert Image' : 'Update Image'}
          </button>
        </div>
      </div>
    </div>
  )
}
