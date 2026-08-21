import { useState, useCallback, useEffect, useRef } from 'react'
import { Editor } from '@tiptap/react'

interface SearchBarProps {
  editor: Editor
  onClose: () => void
  initialShowReplace?: boolean
}

export function SearchBar({ editor, onClose, initialShowReplace = false }: SearchBarProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [showReplace, setShowReplace] = useState(initialShowReplace)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Storage is typed as always-present via the module augmentation in
  // search-replace.ts, but the optional chaining stays as a runtime guard --
  // it's cheap insurance against the extension not being registered.
  const storage = editor.storage.searchReplace
  const matchCount = storage?.results?.length ?? 0
  const currentIndex = storage?.currentIndex ?? 0

  useEffect(() => {
    // This project has no React Compiler enabled, so the rule's cascading-
    // render concern doesn't apply; syncing local UI state from a prop is
    // the standard, safe pattern here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowReplace(initialShowReplace)
  }, [initialShowReplace])

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    editor.commands.setSearchTerm(searchTerm)
  }, [searchTerm, editor])

  useEffect(() => {
    editor.commands.setReplaceTerm(replaceTerm)
  }, [replaceTerm, editor])

  useEffect(() => {
    editor.commands.setCaseSensitive(caseSensitive)
  }, [caseSensitive, editor])

  useEffect(() => {
    editor.commands.setWholeWord(wholeWord)
  }, [wholeWord, editor])

  useEffect(() => {
    editor.commands.setRegex(useRegex)
  }, [useRegex, editor])

  const handleClose = useCallback(() => {
    editor.commands.setSearchTerm('')
    onClose()
  }, [editor, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        editor.commands.goToPrevMatch()
      } else {
        editor.commands.goToNextMatch()
      }
    }
  }, [editor, handleClose])

  const toggleClass = 'px-1.5 py-0.5 text-xs rounded-sm border transition-colors'
  const toggleActiveClass = 'bg-blue-100 dark:bg-blue-900 border-blue-400 text-blue-700 dark:text-blue-300'
  const toggleInactiveClass = 'bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-500'

  return (
    <div className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2">
      <div className="flex items-center gap-2">
        {/* Toggle replace */}
        <button
          onClick={() => setShowReplace(!showReplace)}
          className={`${toggleClass} ${showReplace ? toggleActiveClass : toggleInactiveClass}`}
          title={showReplace ? 'Hide Replace' : 'Show Replace'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showReplace
              ? <polyline points="2,4 6,8 10,4" />
              : <polyline points="4,2 8,6 4,10" />
            }
          </svg>
        </button>

        <div className="flex-1 flex flex-col gap-1.5">
          {/* Search row */}
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 min-w-0"
            />

            {/* Toggle buttons */}
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`${toggleClass} ${caseSensitive ? toggleActiveClass : toggleInactiveClass}`}
              title="Match Case"
            >
              Aa
            </button>
            <button
              onClick={() => setWholeWord(!wholeWord)}
              className={`${toggleClass} ${wholeWord ? toggleActiveClass : toggleInactiveClass}`}
              title="Whole Word"
            >
              ab
            </button>
            <button
              onClick={() => setUseRegex(!useRegex)}
              className={`${toggleClass} ${useRegex ? toggleActiveClass : toggleInactiveClass}`}
              title="Use Regex"
            >
              .*
            </button>

            {/* Match count */}
            <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[60px] text-right">
              {searchTerm ? `${matchCount > 0 ? currentIndex + 1 : 0} of ${matchCount}` : ''}
            </span>

            {/* Nav */}
            <button
              onClick={() => editor.commands.goToPrevMatch()}
              disabled={matchCount === 0}
              className="px-1.5 py-0.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-sm disabled:opacity-30"
              title="Previous (Shift+Enter)"
            >
              &uarr;
            </button>
            <button
              onClick={() => editor.commands.goToNextMatch()}
              disabled={matchCount === 0}
              className="px-1.5 py-0.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-sm disabled:opacity-30"
              title="Next (Enter)"
            >
              &darr;
            </button>

            {/* Close */}
            <button
              onClick={handleClose}
              className="px-1.5 py-0.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-sm"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>

          {/* Replace row */}
          {showReplace && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={replaceTerm}
                onChange={(e) => setReplaceTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Replace..."
                className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 min-w-0"
              />
              <button
                onClick={() => editor.commands.replaceCurrent()}
                disabled={matchCount === 0}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-30"
              >
                Replace
              </button>
              <button
                onClick={() => editor.commands.replaceAll()}
                disabled={matchCount === 0}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-30"
              >
                Replace All
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
