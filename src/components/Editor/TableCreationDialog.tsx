import { useState, useCallback } from 'react'

interface TableCreationDialogProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (rows: number, cols: number, withHeader: boolean) => void
}

export function TableCreationDialog({ isOpen, onClose, onInsert }: TableCreationDialogProps) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [withHeader, setWithHeader] = useState(true)
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null)

  const handleInsert = useCallback(() => {
    onInsert(rows, cols, withHeader)
    onClose()
    // Reset for next time
    setRows(3)
    setCols(3)
    setWithHeader(true)
  }, [rows, cols, withHeader, onInsert, onClose])

  const handleGridClick = useCallback((row: number, col: number) => {
    onInsert(row, col, withHeader)
    onClose()
    setRows(3)
    setCols(3)
    setWithHeader(true)
  }, [withHeader, onInsert, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 min-w-[320px]">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Insert Table
        </h2>

        {/* Grid picker */}
        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
            Click to select size: {hoverCell ? `${hoverCell.row} × ${hoverCell.col}` : `${rows} × ${cols}`}
          </p>
          <div
            className="inline-grid gap-1 p-2 bg-gray-100 dark:bg-gray-700 rounded"
            style={{ gridTemplateColumns: `repeat(8, 1fr)` }}
          >
            {Array.from({ length: 8 }, (_, rowIndex) =>
              Array.from({ length: 8 }, (_, colIndex) => {
                const row = rowIndex + 1
                const col = colIndex + 1
                const isSelected = hoverCell
                  ? row <= hoverCell.row && col <= hoverCell.col
                  : row <= rows && col <= cols

                return (
                  <button
                    key={`${row}-${col}`}
                    type="button"
                    className={`w-6 h-6 border rounded transition-colors ${
                      isSelected
                        ? 'bg-blue-500 border-blue-600'
                        : 'bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 hover:border-blue-400'
                    }`}
                    onMouseEnter={() => setHoverCell({ row, col })}
                    onMouseLeave={() => setHoverCell(null)}
                    onClick={() => handleGridClick(row, col)}
                  />
                )
              })
            )}
          </div>
        </div>

        {/* Manual input */}
        <div className="flex gap-4 mb-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              Rows
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={rows}
              onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
              Columns
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={cols}
              onChange={(e) => setCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Header option */}
        <label className="flex items-center gap-2 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={withHeader}
            onChange={(e) => setWithHeader(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">
            Include header row
          </span>
        </label>

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
            onClick={handleInsert}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
          >
            Insert Table
          </button>
        </div>
      </div>
    </div>
  )
}
