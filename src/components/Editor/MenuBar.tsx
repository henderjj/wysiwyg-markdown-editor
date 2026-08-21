import { Editor } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import { common } from 'lowlight'
import { TableCreationDialog } from './TableCreationDialog'
import { ImageDialog } from './ImageDialog'

const codeLanguages = Object.keys(common).sort()

// Display names for code languages
const languageDisplayNames: Record<string, string> = {
  arduino: 'Arduino',
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  graphql: 'GraphQL',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  makefile: 'Makefile',
  markdown: 'Markdown',
  objectivec: 'Objective-C',
  perl: 'Perl',
  php: 'PHP',
  'php-template': 'PHP Template',
  plaintext: 'Plain Text',
  python: 'Python',
  'python-repl': 'Python REPL',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  vbnet: 'VB.NET',
  wasm: 'WebAssembly',
  xml: 'XML',
  yaml: 'YAML',
}

function getLanguageDisplayName(lang: string): string {
  return languageDisplayNames[lang] || lang
}

interface MenuBarProps {
  editor: Editor | null
  showSearchBar?: boolean
  onToggleFind?: () => void
}

interface MenuButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title: string
}

function MenuButton({ onClick, isActive, disabled, children, title }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        px-2 py-1 rounded-sm text-sm font-medium transition-colors
        ${isActive
          ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800'
          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        border border-gray-300 dark:border-gray-600
      `}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
}

type TableMenuItem =
  | { type: 'divider' }
  | { type: 'action'; label: string; action: () => void; danger?: boolean }

function TableMenu({ editor }: { editor: Editor }) {
  const [showDialog, setShowDialog] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isInTable = editor.isActive('table')

  const handleInsertTable = (rows: number, cols: number, withHeader: boolean) => {
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: withHeader }).run()
  }

  const handleButtonClick = () => {
    if (isInTable) {
      setIsMenuOpen(!isMenuOpen)
    } else {
      setShowDialog(true)
    }
  }

  const menuItems: TableMenuItem[] = [
    { type: 'action', label: 'Add Column Before', action: () => editor.chain().focus().addColumnBefore().run() },
    { type: 'action', label: 'Add Column After', action: () => editor.chain().focus().addColumnAfter().run() },
    { type: 'action', label: 'Delete Column', action: () => editor.chain().focus().deleteColumn().run() },
    { type: 'divider' },
    { type: 'action', label: 'Add Row Before', action: () => editor.chain().focus().addRowBefore().run() },
    { type: 'action', label: 'Add Row After', action: () => editor.chain().focus().addRowAfter().run() },
    { type: 'action', label: 'Delete Row', action: () => editor.chain().focus().deleteRow().run() },
    { type: 'divider' },
    { type: 'action', label: 'Toggle Header Row', action: () => editor.chain().focus().toggleHeaderRow().run() },
    { type: 'action', label: 'Merge Cells', action: () => editor.chain().focus().mergeCells().run() },
    { type: 'action', label: 'Split Cell', action: () => editor.chain().focus().splitCell().run() },
    { type: 'divider' },
    { type: 'action', label: 'Delete Table', action: () => editor.chain().focus().deleteTable().run(), danger: true },
  ]

  return (
    <>
      <div className="relative" ref={menuRef}>
        <MenuButton
          onClick={handleButtonClick}
          isActive={isInTable}
          title={isInTable ? "Table options" : "Insert table"}
        >
          <span className="text-xs">Table</span>
        </MenuButton>

        {isMenuOpen && isInTable && (
          <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[180px] py-1">
            {menuItems.map((item, index) =>
              item.type === 'divider' ? (
                <div key={index} className="border-t border-gray-200 dark:border-gray-600 my-1" />
              ) : (
                <button
                  key={index}
                  onClick={() => {
                    item.action()
                    setIsMenuOpen(false)
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                    item.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {item.label}
                </button>
              )
            )}
          </div>
        )}
      </div>

      <TableCreationDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onInsert={handleInsertTable}
      />
    </>
  )
}

function HeadingMenu({ editor }: { editor: Editor }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeLevel = ([4, 5, 6] as const).find(level => editor.isActive('heading', { level }))
  const buttonLabel = activeLevel ? `H${activeLevel}\u25BE` : 'H\u25BE'

  const levels = [1, 2, 3, 4, 5, 6] as const
  const fontSizes = ['text-lg', 'text-base', 'text-sm', 'text-sm', 'text-xs', 'text-xs']
  const fontWeights = ['font-bold', 'font-bold', 'font-semibold', 'font-semibold', 'font-medium', 'font-medium']

  return (
    <div className="relative" ref={menuRef}>
      <MenuButton
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        isActive={!!activeLevel}
        title="All heading levels"
      >
        <span className="text-xs">{buttonLabel}</span>
      </MenuButton>

      {isMenuOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[160px] py-1">
          {levels.map((level, index) => (
            <button
              key={level}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level }).run()
                setIsMenuOpen(false)
              }}
              className={`w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 ${fontSizes[index]} ${fontWeights[index]} ${
                editor.isActive('heading', { level })
                  ? 'text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-600'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              H{level} Heading {level}
            </button>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
          <button
            onClick={() => {
              editor.chain().focus().setParagraph().run()
              setIsMenuOpen(false)
            }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
              !editor.isActive('heading')
                ? 'text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-600'
                : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            Paragraph
          </button>
        </div>
      )}
    </div>
  )
}

function CodeBlockMenu({ editor }: { editor: Editor }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isInCodeBlock = editor.isActive('codeBlock')
  const currentLanguage = editor.getAttributes('codeBlock').language || ''

  const handleButtonClick = () => {
    if (isInCodeBlock) {
      setIsMenuOpen(!isMenuOpen)
    } else {
      editor.chain().focus().toggleCodeBlock().run()
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <MenuButton
        onClick={handleButtonClick}
        isActive={isInCodeBlock}
        title={isInCodeBlock ? 'Change code language' : 'Code Block'}
      >
        <span className="text-xs">{isInCodeBlock && currentLanguage ? getLanguageDisplayName(currentLanguage) : '{ }'}</span>
      </MenuButton>

      {isMenuOpen && isInCodeBlock && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[160px] max-h-[300px] overflow-y-auto py-1">
          <button
            onClick={() => {
              editor.chain().focus().updateAttributes('codeBlock', { language: 'plaintext' }).run()
              setIsMenuOpen(false)
            }}
            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
              !currentLanguage || currentLanguage === 'plaintext'
                ? 'text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-600'
                : 'text-gray-700 dark:text-gray-200'
            }`}
          >
            Plain text
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
          {codeLanguages.map((lang) => (
            <button
              key={lang}
              onClick={() => {
                editor.chain().focus().updateAttributes('codeBlock', { language: lang }).run()
                setIsMenuOpen(false)
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                currentLanguage === lang
                  ? 'text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-600'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {getLanguageDisplayName(lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const bulletMarkers = [
  { marker: '-', label: 'Dash', symbol: '•' },
  { marker: '*', label: 'Star', symbol: '○' },
  { marker: '+', label: 'Plus', symbol: '■' },
] as const

function BulletListMenu({ editor }: { editor: Editor }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isInBulletList = editor.isActive('bulletList')
  const currentMarker = editor.getAttributes('bulletList')['data-marker'] || '-'
  const currentSymbol = bulletMarkers.find(m => m.marker === currentMarker)?.symbol || '•'

  const handleButtonClick = () => {
    if (isInBulletList) {
      setIsMenuOpen(!isMenuOpen)
    } else {
      editor.chain().focus().toggleBulletList().run()
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <MenuButton
        onClick={handleButtonClick}
        isActive={isInBulletList}
        title={isInBulletList ? 'Change bullet style' : 'Bullet List'}
      >
        {currentSymbol}
      </MenuButton>

      {isMenuOpen && isInBulletList && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 min-w-[140px] py-1">
          {bulletMarkers.map(({ marker, label, symbol }) => (
            <button
              key={marker}
              onClick={() => {
                editor.chain().focus().updateAttributes('bulletList', { 'data-marker': marker }).run()
                setIsMenuOpen(false)
              }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 ${
                currentMarker === marker
                  ? 'text-blue-600 dark:text-blue-400 bg-gray-50 dark:bg-gray-600'
                  : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="inline-block w-5">{symbol}</span> {label} <span className="text-gray-400 ml-1">({marker})</span>
            </button>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
          <button
            onClick={() => {
              editor.chain().focus().toggleBulletList().run()
              setIsMenuOpen(false)
            }}
            className="w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900"
          >
            Remove List
          </button>
        </div>
      )}
    </div>
  )
}

function ImageMenu({ editor }: { editor: Editor }) {
  const [showDialog, setShowDialog] = useState(false)

  const handleInsertImage = (src: string, alt: string) => {
    editor.chain().focus().setImage({ src, alt }).run()
  }

  return (
    <>
      <MenuButton
        onClick={() => setShowDialog(true)}
        title="Insert image"
      >
        <span className="text-xs">IMG</span>
      </MenuButton>

      <ImageDialog
        isOpen={showDialog}
        onClose={() => setShowDialog(false)}
        onSubmit={handleInsertImage}
        mode="insert"
      />
    </>
  )
}

export function MenuBar({ editor, showSearchBar, onToggleFind }: MenuBarProps) {
  if (!editor) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-1 p-2">
      {/* Text formatting */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <s>S</s>
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <code className="text-xs">&lt;/&gt;</code>
      </MenuButton>

      <Divider />

      {/* Headings */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        H1
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        H2
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        H3
      </MenuButton>

      <HeadingMenu editor={editor} />

      <Divider />

      {/* Lists */}
      <BulletListMenu editor={editor} />

      <MenuButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        1.
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        isActive={editor.isActive('taskList')}
        title="Task List"
      >
        ☐
      </MenuButton>

      <Divider />

      {/* Block elements */}
      <MenuButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Blockquote"
      >
        "
      </MenuButton>

      {editor.isActive('blockquote') && (
        <>
          <MenuButton
            onClick={() => editor.chain().focus().setBlockquote().run()}
            title="Nest blockquote deeper"
          >
            <span className="text-xs">"»</span>
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().lift('blockquote').run()}
            title="Lift out of blockquote"
          >
            <span className="text-xs">«"</span>
          </MenuButton>
        </>
      )}

      <CodeBlockMenu editor={editor} />

      <MenuButton
        onClick={() => editor.chain().focus().insertMermaid().run()}
        isActive={editor.isActive('mermaid')}
        title="Insert Mermaid diagram"
      >
        <span className="text-xs">Diagram</span>
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        ―
      </MenuButton>

      <Divider />

      {/* Links */}
      <MenuButton
        onClick={() => {
          // Get currently selected text
          const { from, to } = editor.state.selection
          const selectedText = editor.state.doc.textBetween(from, to, '')

          const url = window.prompt('Enter URL:')
          if (!url) return

          const displayText = window.prompt('Enter display text (leave empty to show URL):', selectedText)

          // If user cancelled the display text prompt, still proceed with URL or selected text
          const finalText = displayText !== null ? displayText : selectedText

          if (selectedText) {
            // There's selected text - replace it with the link
            if (finalText && finalText !== selectedText) {
              // Replace selected text with new display text
              editor
                .chain()
                .focus()
                .deleteSelection()
                .insertContent(`<a href="${url}">${finalText || url}</a>`)
                .run()
            } else {
              // Just wrap the selected text with the link
              editor.chain().focus().setLink({ href: url }).run()
            }
          } else {
            // No selection - insert new link with display text or URL
            editor
              .chain()
              .focus()
              .insertContent(`<a href="${url}">${finalText || url}</a>`)
              .run()
          }
        }}
        isActive={editor.isActive('link')}
        title="Add Link"
      >
        🔗
      </MenuButton>

      {editor.isActive('link') && (
        <MenuButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove Link"
        >
          ✕
        </MenuButton>
      )}

      <Divider />

      {/* Image */}
      <ImageMenu editor={editor} />

      <Divider />

      {/* Table */}
      <TableMenu editor={editor} />

      <Divider />

      {/* Undo/Redo */}
      <MenuButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        ↶
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Y)"
      >
        ↷
      </MenuButton>

      <Divider />

      {/* Find */}
      <MenuButton
        onClick={() => onToggleFind?.()}
        isActive={showSearchBar}
        title="Find (Ctrl+F)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
        </svg>
      </MenuButton>
    </div>
  )
}
