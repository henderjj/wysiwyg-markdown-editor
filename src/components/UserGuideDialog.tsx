import { useEffect } from 'react'

interface UserGuideDialogProps {
  isOpen: boolean
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-sm text-gray-600 dark:text-gray-300">
      {children}
    </kbd>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">{children}</div>
    </div>
  )
}

export function UserGuideDialog({ isOpen, onClose }: UserGuideDialogProps) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[700px] max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Guide</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-1">
          <Section title="Getting Started">
            <p>
              WYSIWYG Markdown is a visual markdown editor — you write and format text as you normally would,
              and your files are saved in standard Markdown format.
            </p>
            <p>
              When you open the app, you'll see a blank document ready for editing. Just start typing.
              Your work is automatically saved in your browser's local storage. To save as
              a <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">.md</code> file,
              use <strong>File &gt; Save</strong> or press <Kbd>Ctrl+S</Kbd>.
            </p>
          </Section>

          <Section title="The Interface">
            <p>From top to bottom:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Menu bar</strong> — File, Edit, View, and Help menus.</li>
              <li><strong>Tabs</strong> — One tab per open document.</li>
              <li><strong>Toolbar</strong> — Formatting buttons (bold, italic, headings, lists, etc.).</li>
              <li><strong>Editor area</strong> — Where you write. Formatting is applied visually.</li>
              <li><strong>Status bar</strong> — Word count, character count, and zoom level.</li>
            </ul>
          </Section>

          <Section title="Working with Files">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>New</strong> — <Kbd>Ctrl+N</Kbd> creates a blank document in a new tab.</li>
              <li><strong>Open</strong> — <Kbd>Ctrl+O</Kbd> opens a markdown file from your computer. You can also drag and drop files onto the editor.</li>
              <li><strong>Save</strong> — <Kbd>Ctrl+S</Kbd> saves to the current file. For new documents, this prompts you for a location.</li>
              <li><strong>Save As</strong> — <Kbd>Ctrl+Shift+S</Kbd> lets you choose a new filename or location.</li>
              <li><strong>Export as HTML</strong> — <strong>File &gt; Export as HTML</strong> saves the document as a standalone <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">.html</code> file with styling.</li>
              <li><strong>Reload from Disk</strong> — <Kbd>F5</Kbd> reloads the file, discarding unsaved changes.</li>
              <li><strong>Auto-save to File</strong> — Enable in <strong>Options</strong> menu to save automatically whenever you edit.</li>
              <li><strong>Close Tab</strong> — <Kbd>Ctrl+W</Kbd> closes the current tab (prompts to save if needed).</li>
              <li><strong>Print</strong> — <Kbd>Ctrl+P</Kbd> prints the current document.</li>
            </ul>
          </Section>

          <Section title="Formatting Text">
            <p>Select text and click a toolbar button, or use shortcuts:</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 mt-1 ml-2">
              <span><strong>Bold</strong></span><span>toolbar <strong>B</strong></span><span><Kbd>Ctrl+B</Kbd></span>
              <span><em>Italic</em></span><span>toolbar <em>I</em></span><span><Kbd>Ctrl+I</Kbd></span>
              <span><s>Strikethrough</s></span><span>toolbar <s>S</s></span><span><Kbd>Ctrl+Shift+X</Kbd></span>
              <span>Inline code</span><span>toolbar <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">&lt;/&gt;</code></span><span><Kbd>Ctrl+E</Kbd></span>
              <span>Underline</span><span>—</span><span><Kbd>Ctrl+U</Kbd></span>
              <span>Blockquote</span><span>toolbar <strong>"</strong></span><span><Kbd>Ctrl+Shift+B</Kbd></span>
            </div>
          </Section>

          <Section title="Headings">
            <p>
              Click <strong>H1</strong>, <strong>H2</strong>, or <strong>H3</strong> on the toolbar for common heading levels.
              Click <strong>H▾</strong> for all six levels (H1–H6) plus a "Paragraph" option.
            </p>
            <p>
              <strong>Document Map</strong> (<Kbd>Ctrl+D</Kbd>) — Opens a sidebar listing all headings.
              Click any heading to jump to it.
            </p>
          </Section>

          <Section title="Lists">
            <p>The toolbar has three list buttons:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Bullet list</strong> — Click again while in a list to change the bullet style (dash, star, or plus).</li>
              <li><strong>Numbered list</strong> (<strong>1.</strong>) — Ordered/numbered list.</li>
              <li><strong>Task list</strong> (<strong>☐</strong>) — Checkbox list. Click a checkbox to toggle it.</li>
            </ul>
            <p>
              Press <Kbd>Tab</Kbd> to indent a list item and <Kbd>Shift+Tab</Kbd> to outdent it.
            </p>
          </Section>

          <Section title="Links and Images">
            <p>
              <strong>Links</strong> — Click the link button (🔗), enter a URL and optional display text.
              Select text first to turn it into a link. A floating toolbar appears when you click a link.
            </p>
            <p>
              <strong>Images</strong> — Click <strong>IMG</strong> to insert an image by URL with alt text.
              A floating toolbar lets you resize or edit the image when selected.
            </p>
          </Section>

          <Section title="Tables">
            <p>
              Click <strong>Table</strong> on the toolbar to insert a table — a dialog lets you set
              rows, columns, and whether to include a header row.
            </p>
            <p>Once inside a table, the Table button opens a menu with options to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Add or delete columns and rows</li>
              <li>Toggle the header row</li>
              <li>Merge or split cells</li>
              <li>Delete the entire table</li>
            </ul>
            <p>
              Navigate cells with <Kbd>Tab</Kbd> (next cell) and <Kbd>Shift+Tab</Kbd> (previous cell).
            </p>
          </Section>

          <Section title="Code Blocks">
            <p>
              Click <strong>{"{ }"}</strong> on the toolbar to insert a code block.
              When your cursor is inside a code block, click the button again to choose a language
              for syntax highlighting (JavaScript, Python, SQL, and many more).
            </p>
            <p>
              Inside a code block, <Kbd>Tab</Kbd> inserts 2 spaces
              and <Kbd>Shift+Tab</Kbd> removes up to 2 leading spaces.
            </p>
          </Section>

          <Section title="Blockquotes">
            <p>
              Click <strong>"</strong> to toggle a blockquote, or press <Kbd>Ctrl+Shift+B</Kbd>.
              When inside a blockquote, extra buttons appear to nest deeper (<strong>"»</strong>)
              or lift out one level (<strong>«"</strong>).
            </p>
          </Section>

          <Section title="Find and Replace">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><Kbd>Ctrl+F</Kbd> — Open Find bar.</li>
              <li><Kbd>Ctrl+H</Kbd> — Open Find & Replace bar.</li>
              <li>Toggle <strong>Match case</strong>, <strong>Whole word</strong>, or <strong>Regex</strong> for advanced matching.</li>
              <li>Use the arrow buttons or <Kbd>Enter</Kbd> / <Kbd>Shift+Enter</Kbd> to navigate between matches.</li>
              <li>Click <strong>Replace</strong> for the current match or <strong>Replace All</strong> for every match.</li>
              <li>Press <Kbd>Escape</Kbd> to close the search bar.</li>
            </ul>
          </Section>

          <Section title="Copy &amp; Export">
            <p>
              When you copy text from the editor (<Kbd>Ctrl+C</Kbd>), the clipboard contains both
              the formatted HTML and the markdown equivalent. Pasting into a rich editor (Word, Google Docs)
              gives you formatted text; pasting into a plain text editor gives you markdown.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Copy as Markdown</strong> — <strong>Edit &gt; Copy as Markdown</strong> copies
                the selected text as markdown, or the full document if nothing is selected.</li>
              <li><strong>Copy as HTML</strong> — <strong>Edit &gt; Copy as HTML</strong> copies
                the raw HTML source to the clipboard.</li>
              <li><strong>Export as HTML</strong> — <strong>File &gt; Export as HTML</strong> saves
                the document as a styled <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">.html</code> file.</li>
            </ul>
            <p>
              Both "Copy as Markdown" and "Copy as HTML" are also available in the right-click context menu
              when text is selected.
            </p>
          </Section>

          <Section title="Markdown Preview">
            <p>
              Press <Kbd>Ctrl+M</Kbd> or use <strong>View &gt; Markdown Preview</strong> to toggle a
              side-by-side preview of the raw markdown output.
            </p>
          </Section>

          <Section title="Tabs">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Switch</strong> — Click a tab, or use <Kbd>Ctrl+Tab</Kbd> / <Kbd>Ctrl+Shift+Tab</Kbd>.</li>
              <li><strong>Reorder</strong> — Drag tabs left or right.</li>
              <li><strong>Rename</strong> — Double-click a tab's name.</li>
              <li><strong>Close</strong> — Click the × on a tab, or press <Kbd>Ctrl+W</Kbd>.</li>
              <li><strong>Context menu</strong> — Right-click a tab for Close, Close Others, and Close All.</li>
            </ul>
            <p>A dot on a tab indicates unsaved changes.</p>
          </Section>

          <Section title="Appearance">
            <p><strong>Theme</strong> — Choose Light, Dark, or System from <strong>View &gt; Theme</strong>.</p>
            <p><strong>Zoom</strong> — <Kbd>Ctrl+=</Kbd> to zoom in, <Kbd>Ctrl+-</Kbd> to zoom out, <Kbd>Ctrl+0</Kbd> to reset. You can also use the +/− buttons in the status bar.</p>
          </Section>

          <Section title="Keyboard Shortcuts">
            <p>Press <Kbd>F1</Kbd> for the full shortcuts reference. Key shortcuts:</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1 ml-2">
              <span><Kbd>Ctrl+N</Kbd> New document</span>
              <span><Kbd>Ctrl+O</Kbd> Open file</span>
              <span><Kbd>Ctrl+S</Kbd> Save</span>
              <span><Kbd>Ctrl+Shift+S</Kbd> Save As</span>
              <span><Kbd>Ctrl+B</Kbd> Bold</span>
              <span><Kbd>Ctrl+I</Kbd> Italic</span>
              <span><Kbd>Ctrl+E</Kbd> Code</span>
              <span><Kbd>Ctrl+Shift+X</Kbd> Strikethrough</span>
              <span><Kbd>Ctrl+F</Kbd> Find</span>
              <span><Kbd>Ctrl+H</Kbd> Find & Replace</span>
              <span><Kbd>Ctrl+Z</Kbd> Undo</span>
              <span><Kbd>Ctrl+Y</Kbd> Redo</span>
              <span><Kbd>Ctrl+M</Kbd> Markdown Preview</span>
              <span><Kbd>Ctrl+D</Kbd> Document Map</span>
              <span><Kbd>Ctrl+Tab</Kbd> Next tab</span>
              <span><Kbd>Ctrl+Shift+Tab</Kbd> Previous tab</span>
              <span><Kbd>Alt+Enter</Kbd> Expand diagram</span>
            </div>
          </Section>

          <Section title="Markdown Shortcuts">
            <p>
              When <strong>Edit &gt; Markdown Shortcuts</strong> is enabled, typing markdown
              syntax auto-converts to formatted text:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm"># </code> at the start of a line for Heading 1, <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">## </code> for Heading 2, etc.</li>
              <li><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">- </code> or <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">* </code> for a bullet list</li>
              <li><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">1. </code> for a numbered list</li>
              <li><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">&gt; </code> for a blockquote</li>
              <li><code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">```</code> for a code block</li>
              <li>Wrap text with <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">**</code> for bold, <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">*</code> for italic</li>
            </ul>
            <p>Disable this from the Edit menu if you prefer toolbar-only formatting.</p>
          </Section>

          <Section title="Desktop App">
            <p>When running as a desktop app (Tauri), you get extras:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Native file dialogs</strong> — Uses your OS file picker.</li>
              <li><strong>Open Recent</strong> — Remembers recently opened files.</li>
              <li><strong>Open with</strong> — Associate <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded-sm">.md</code> files with the app.</li>
            </ul>
            <p>The web version uses the browser's File System Access API or standard file upload/download.</p>
          </Section>

          <Section title="Accessibility">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Escape then Tab</strong> — Press <Kbd>Escape</Kbd> to exit the editor, then <Kbd>Tab</Kbd> to move focus to the next UI element.</li>
              <li><strong>Menu bar</strong> — Accessible via keyboard.</li>
              <li><strong>Dialogs</strong> — Press <Kbd>Escape</Kbd> to close. All controls reachable with <Kbd>Tab</Kbd>.</li>
              <li><strong>Tab switching</strong> — <Kbd>Ctrl+Tab</Kbd> and <Kbd>Ctrl+Shift+Tab</Kbd>.</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
