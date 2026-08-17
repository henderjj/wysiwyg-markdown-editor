import { Editor } from '@tiptap/core'
import { DOMSerializer } from '@tiptap/pm/model'
import TurndownService from 'turndown'
import {
  isTauri,
  openFileWithTauri,
  saveFileDirectWithTauri,
  saveHtmlFileWithTauri,
  clearFilePath as clearTauriFilePath,
} from './tauri'
import { writeClipboardText } from './clipboard'

// Configure Turndown for GFM output
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

// Escape markdown-significant characters in text nodes.
// Turndown calls this on raw text content extracted from HTML elements — NOT on the
// markdown syntax it generates (e.g. ** around bold). This means:
//   <em>text</em>  → *text*     (escape not called on the * delimiters)
//   <p>*text*</p>  → \*text\*   (escape IS called on the text node content)
// This is always enabled so that literal markdown chars survive round-trips regardless
// of the MD shortcuts mode. The parser in markdownParser.ts handles \* etc. on import.
turndownService.escape = function turndownEscape(text: string): string {
  // With MD ON, MarkdownEscape consumes \X → X in the editor, so the text
  // only contains literal characters. With MD OFF, the user types \X directly
  // and both chars are in the text.
  //
  // Rules:
  //   \ → always escape to \\ (every \ in editor = \\ in markdown)
  //   bare ` * ~ → escape to \` \* \~
  //   bare _ → escape to \_ unless intraword (word chars on both sides —
  //     the parser's emphasis guards use the same predicate, so an intraword _
  //     can never open/close emphasis; keeps snake_case clean in saved files)
  //   bare # > - + and ordered-list "1. " at line start → second pass below
  //
  // The import parser accepts \X for ALL CommonMark punctuation
  // (ESCAPABLE_PUNCTUATION in markdownParser.ts), so the relationship is
  // deliberately asymmetric: import ACCEPTS more than export EMITS. E.g. \&
  // in an externally-authored file is normalized to a bare & on first save.
  const inlineSpecial = new Set('`*~'.split(''))
  const wordChar = /[\p{L}\p{N}_]/u
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      result += '\\\\'
    } else if (ch === '_') {
      // At text-node edges the neighbor is unknown → escape (safe direction:
      // an extra \_ round-trips fine, a live delimiter would not).
      const intraword = i > 0 && i < text.length - 1
        && wordChar.test(text[i - 1]) && wordChar.test(text[i + 1])
      result += intraword ? '_' : '\\_'
    } else if (inlineSpecial.has(ch)) {
      result += '\\' + ch
    } else {
      result += ch
    }
  }
  // Block-level syntax — escape bare chars at the start of a line.
  // Lines with \# \- etc. from the loop above won't match (\ is not # or -).
  result = result.replace(/^(\s*)(#{1,6})/gm, '$1\\$2')
  result = result.replace(/^(\s*)(>)/gm, '$1\\$2')
  // Ordered-list escape: "1. Text" → "1\. Text" so a paragraph starting with a
  // number-dot doesn't become a list on reimport. Safe because the parser reads
  // \. back as a literal dot and "1\. " cannot match its ordered-list regex.
  result = result.replace(/^(\s*)(\d+)\. /gm, '$1$2\\. ')
  result = result.replace(/^(\s*)([-+]) /gm, '$1\\$2 ')
  return result
}

// Headings: same ATX output as Turndown's default rule, but strip the
// line-start escapes turndownEscape added — after the "### " prefix the line
// can't be re-parsed as a list/heading/blockquote, so "### 1\. Intro" is
// unnecessary noise. Only single-backslash escapes are stripped: a literal
// backslash typed in the editor arrives here as \\ (escaped by the loop
// above), so "1\\." never matches (\d+ then \\ then \. requires dot, gets \).
turndownService.addRule('heading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    const level = Number(node.nodeName.charAt(1))
    const text = content
      .replace(/^(\s*)\\(#{1,6})/, '$1$2')
      .replace(/^(\s*)\\(>)/, '$1$2')
      .replace(/^(\s*)(\d+)\\\. /, '$1$2. ')
      .replace(/^(\s*)\\([-+]) /, '$1$2 ')
    return `\n\n${'#'.repeat(level)} ${text}\n\n`
  },
})

// Blockquote: process children individually so we can insert empty > lines only
// between consecutive <p> elements (real paragraph breaks) and not around other
// block elements like nested blockquotes or lists.
// Merge all adjacent blockquotes (editor splits blockquotes into siblings on lift/nest;
// file-sourced separate groups are kept apart by a <p></p> separator from the parser)
turndownService.addRule('blockquote', {
  filter: 'blockquote',
  replacement: (content, node) => {
    const el = node as HTMLElement
    const children = Array.from(el.children)

    if (children.length > 0) {
      // Process each child through Turndown individually
      const parts: Array<{ md: string; tag: string }> = []
      for (const child of children) {
        const md = turndownService.turndown(child.outerHTML).trim()
        if (md) parts.push({ md, tag: child.tagName })
      }

      // Join children: nested blockquotes attach tightly (no blank > line),
      // all other block element transitions get a blank > line between them.
      content = ''
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          const involvesBlockquote = parts[i - 1].tag === 'BLOCKQUOTE' || parts[i].tag === 'BLOCKQUOTE'
          content += involvesBlockquote ? '\n' : '\n\n'
        }
        content += parts[i].md
      }
    } else {
      // Fallback for empty or text-only blockquotes
      content = content.replace(/^\n+|\n+$/g, '')
      content = content.replace(/\n{2,}/g, '\n')
    }

    content = content.replace(/^/gm, (_, offset) => content[offset] === '>' ? '>' : '> ')

    const prevEl = el.previousElementSibling as HTMLElement | null
    const nextEl = el.nextElementSibling as HTMLElement | null

    const mergeWithPrev = prevEl?.tagName === 'BLOCKQUOTE'
    const mergeWithNext = nextEl?.tagName === 'BLOCKQUOTE'

    return (mergeWithPrev ? '' : '\n\n') + content + (mergeWithNext ? '\n' : '\n\n')
  },
})

// Add strikethrough support
turndownService.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
})

// Add task list support
turndownService.addRule('taskListItem', {
  filter: (node) => {
    return (
      node.nodeName === 'LI' &&
      node.parentElement?.getAttribute('data-type') === 'taskList'
    )
  },
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]')
    const checked = checkbox?.hasAttribute('checked') ?? false
    const prefix = checked ? '- [x] ' : '- [ ] '
    return prefix + content.trim() + '\n'
  },
})

// Add task list wrapper
turndownService.addRule('taskList', {
  filter: (node) => {
    return (
      node.nodeName === 'UL' &&
      node.getAttribute('data-type') === 'taskList'
    )
  },
  replacement: (content) => content + '\n',
})

// Handle regular list items (bullet and numbered) - strip paragraph whitespace but preserve nesting
turndownService.addRule('listItem', {
  filter: (node) => {
    return (
      node.nodeName === 'LI' &&
      node.parentElement?.getAttribute('data-type') !== 'taskList'
    )
  },
  replacement: (content, node, options) => {
    // Calculate nesting depth
    let depth = 0
    let parent = node.parentElement
    while (parent) {
      if (parent.nodeName === 'UL' || parent.nodeName === 'OL') {
        depth++
      }
      parent = parent.parentElement
    }
    const indent = '    '.repeat(Math.max(0, depth - 1))

    // Clean up the content - remove leading/trailing whitespace and collapse multiple blank lines
    // But preserve indented nested content
    let trimmedContent = content.trim().replace(/\n\n+/g, '\n')

    // If there's nested content (nested lists), re-indent it properly
    if (trimmedContent.includes('\n')) {
      const lines = trimmedContent.split('\n')
      trimmedContent = lines.map((line, i) => {
        if (i === 0) return line
        // Nested list items already have their own indentation from recursion
        return line
      }).join('\n')
    }

    const listParent = node.parentElement
    const isOrdered = listParent?.nodeName === 'OL'

    let prefix: string
    if (isOrdered) {
      const items = Array.from(listParent?.children || [])
      const index = items.indexOf(node as Element) + 1
      prefix = index + '. '
    } else {
      const marker = (listParent as HTMLElement)?.getAttribute('data-marker') || options.bulletListMarker
      prefix = marker + ' '
    }

    return indent + prefix + trimmedContent + '\n'
  },
})

// Handle ul/ol wrappers to prevent extra whitespace
turndownService.addRule('list', {
  filter: (node) => {
    return (
      (node.nodeName === 'UL' || node.nodeName === 'OL') &&
      node.getAttribute('data-type') !== 'taskList'
    )
  },
  replacement: (content) => '\n' + content + '\n',
})

// Add code block with language support
turndownService.addRule('fencedCodeBlock', {
  filter: (node) => {
    return (
      node.nodeName === 'PRE' &&
      node.firstChild?.nodeName === 'CODE'
    )
  },
  replacement: (_content, node) => {
    const code = node.firstChild as HTMLElement
    let language = code?.getAttribute('class')?.replace('language-', '') || ''
    if (language === 'plaintext') language = ''
    let text = code?.textContent || ''
    // Ensure code ends with newline so closing fence is on its own line
    if (text && !text.endsWith('\n')) {
      text += '\n'
    }
    return `\n\`\`\`${language}\n${text}\`\`\`\n\n`
  },
})

// Add GFM table support
turndownService.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const table = node as HTMLTableElement
    const rows = Array.from(table.querySelectorAll('tr'))

    if (rows.length === 0) return ''

    const result: string[] = []

    rows.forEach((row, rowIndex) => {
      const cells = Array.from(row.querySelectorAll('th, td'))
      const cellContents = cells.map((cell) => {
        // Convert cell HTML to markdown to preserve inline formatting (bold, code, etc.)
        const text = turndownService.turndown(cell.innerHTML || '')
          .trim()
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ')
        return text
      })

      result.push('| ' + cellContents.join(' | ') + ' |')

      // Add separator row after header (first row)
      if (rowIndex === 0) {
        const separator = cells.map(() => '---').join(' | ')
        result.push('| ' + separator + ' |')
      }
    })

    return '\n' + result.join('\n') + '\n\n'
  },
})

// Skip individual table elements (handled by table rule)
turndownService.addRule('tableCell', {
  filter: ['th', 'td', 'tr', 'thead', 'tbody', 'tfoot'],
  replacement: () => '',
})

/**
 * Convert editor HTML content to Markdown.
 * Markdown-significant characters in plain text are always backslash-escaped
 * so they survive round-trips through the parser.
 */
export function htmlToMarkdown(html: string): string {
  let md = turndownService.turndown(html)
  // Collapse 3+ consecutive newlines into a single blank line
  md = md.replace(/\n{3,}/g, '\n\n')
  // Remove blank lines around non-blockquote lines sandwiched between blockquote lines
  // (a line that was un-blockquoted: > line / blank / text / blank / > line)
  const lines = md.split('\n')
  const remove = new Set<number>()
  for (let i = 0; i < lines.length - 4; i++) {
    if (lines[i].startsWith('>')
      && lines[i + 1] === ''
      && lines[i + 2] !== '' && !lines[i + 2].startsWith('>')
      && lines[i + 3] === ''
      && lines[i + 4].startsWith('>')) {
      remove.add(i + 1)
      remove.add(i + 3)
    }
  }
  if (remove.size > 0) {
    md = lines.filter((_, i) => !remove.has(i)).join('\n')
  }
  // Ensure trailing newline for POSIX compatibility
  if (md.length > 0 && !md.endsWith('\n')) {
    md += '\n'
  }
  return md
}

/**
 * Export editor content as Markdown.
 */
export function exportMarkdown(editor: Editor): string {
  const html = editor.getHTML()
  return htmlToMarkdown(html)
}

/**
 * Get HTML string from the editor's current selection.
 * Returns null if nothing is selected.
 */
export function getSelectedHtml(editor: Editor): string | null {
  if (editor.state.selection.empty) return null
  const slice = editor.state.selection.content()
  const serializer = DOMSerializer.fromSchema(editor.state.schema)
  const div = document.createElement('div')
  div.appendChild(serializer.serializeFragment(slice.content))
  return div.innerHTML
}

/**
 * Wrap raw editor HTML in a standalone HTML document with basic styling
 */
export function wrapHtmlDocument(bodyHtml: string, title: string = 'Document'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title.replace(/</g, '&lt;')}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
  pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 1rem; color: #555; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; }
  a { color: #2563eb; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
  ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.3em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

/**
 * Download HTML content as a file (browser fallback)
 */
export function downloadHtml(content: string, filename: string = 'document.html'): void {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export HTML file — uses Tauri save dialog if available, otherwise browser download
 */
export async function exportHtmlFile(
  htmlContent: string,
  suggestedName: string = 'document.html'
): Promise<string | null> {
  if (isTauri()) {
    return await saveHtmlFileWithTauri(htmlContent, suggestedName)
  }

  // Try modern File System Access API
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await (window as Window & { showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'HTML files',
            accept: { 'text/html': ['.html', '.htm'] },
          },
        ],
      })
      const writable = await fileHandle.createWritable()
      await writable.write(htmlContent)
      await writable.close()
      return fileHandle.name
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null
      throw err
    }
  }

  // Fallback to download
  downloadHtml(htmlContent, suggestedName)
  return suggestedName
}

/**
 * Download markdown content as a file
 */
export function downloadMarkdown(content: string, filename: string = 'document.md'): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Copy markdown content to clipboard
 */
export async function copyMarkdownToClipboard(content: string): Promise<boolean> {
  try {
    await writeClipboardText(content)
    return true
  } catch {
    return false
  }
}

/**
 * Read a markdown file and return its content
 */
export async function readMarkdownFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target?.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

/**
 * Open file picker and read markdown file
 */
export async function openMarkdownFile(): Promise<{ content: string; filename: string; fileHandle?: FileSystemFileHandle; filePath?: string } | null> {
  // Try Tauri native dialog first
  if (isTauri()) {
    const result = await openFileWithTauri()
    return result ? { content: result.content, filename: result.filename, filePath: result.path } : null
  }

  // Try modern File System Access API
  if ('showOpenFilePicker' in window) {
    try {
      const [fileHandle] = await (window as Window & { showOpenFilePicker: (options?: object) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
        types: [
          {
            description: 'Markdown files',
            accept: { 'text/markdown': ['.md', '.markdown'] },
          },
        ],
      })
      const file = await fileHandle.getFile()
      const content = await file.text()
      return { content, filename: file.name, fileHandle }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null
      throw err
    }
  }

  // Fallback to input element
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,text/markdown'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const content = await readMarkdownFile(file)
      resolve({ content, filename: file.name })
    }
    input.click()
  })
}

// Store file handles for reuse (allows overwriting same file)
const fileHandles = new Map<string, FileSystemFileHandle>()

// Store detected line endings per document
const lineEndings = new Map<string, string>()

function getPlatformLineEnding(): string {
  return navigator.platform?.startsWith('Win') ? '\r\n' : '\n'
}

function detectLineEnding(content: string): string {
  const crlfCount = (content.match(/\r\n/g) || []).length
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length
  if (crlfCount === 0 && lfCount === 0) return getPlatformLineEnding()
  return crlfCount >= lfCount ? '\r\n' : '\n'
}

/**
 * Detect and store the line ending style of a file for a given document ID.
 * Call after opening a file to ensure round-trip line-ending fidelity on save.
 */
export function setDocumentLineEnding(documentId: string, content: string): void {
  lineEndings.set(documentId, detectLineEnding(content))
}

function applyLineEnding(content: string, documentId?: string): string {
  const eol = documentId ? lineEndings.get(documentId) ?? getPlatformLineEnding() : getPlatformLineEnding()
  if (eol === '\n') return content
  return content.replace(/\n/g, eol)
}

/**
 * Save markdown file using File System Access API or download fallback
 * If a file handle exists for this document, it will overwrite without prompting
 */
export async function saveMarkdownFile(
  content: string,
  suggestedName: string = 'document.md',
  documentId?: string,
  forceNewDialog: boolean = false
): Promise<string | null> {
  // Apply platform-appropriate line endings for file output
  const fileContent = applyLineEnding(content, documentId)

  // Try Tauri native save first
  if (isTauri() && documentId) {
    const result = await saveFileDirectWithTauri(fileContent, documentId, suggestedName, forceNewDialog)
    return result
  }

  // Try modern File System Access API
  if ('showSaveFilePicker' in window) {
    try {
      // Check if we have an existing file handle for this document
      let fileHandle = (!forceNewDialog && documentId) ? fileHandles.get(documentId) : undefined

      if (fileHandle) {
        // Verify we still have permission to write
        const permission = await (fileHandle as FileSystemFileHandle & {
          queryPermission: (opts: { mode: string }) => Promise<string>
        }).queryPermission({ mode: 'readwrite' })

        if (permission !== 'granted') {
          // Try to request permission again
          const requestResult = await (fileHandle as FileSystemFileHandle & {
            requestPermission: (opts: { mode: string }) => Promise<string>
          }).requestPermission({ mode: 'readwrite' })

          if (requestResult !== 'granted') {
            fileHandle = undefined // Will prompt for new location
          }
        }
      }

      if (!fileHandle) {
        // No existing handle, prompt user for save location
        fileHandle = await (window as Window & { showSaveFilePicker: (options?: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Markdown files',
              accept: { 'text/markdown': ['.md'] },
            },
          ],
        })

        // Store the handle for future saves
        if (documentId) {
          fileHandles.set(documentId, fileHandle)
        }
      }

      const writable = await fileHandle.createWritable()
      await writable.write(fileContent)
      await writable.close()
      return fileHandle.name
    } catch (err) {
      if ((err as Error).name === 'AbortError') return null
      // If permission denied or other error, clear the handle and fall through
      if (documentId) {
        fileHandles.delete(documentId)
      }
      throw err
    }
  }

  // Fallback to download
  downloadMarkdown(fileContent, suggestedName)
  return suggestedName
}

/**
 * Save As — always shows file picker, updates stored handle
 */
export async function saveMarkdownFileAs(
  content: string,
  suggestedName: string = 'document.md',
  documentId?: string
): Promise<string | null> {
  return saveMarkdownFile(content, suggestedName, documentId, true)
}

/**
 * Store a file handle for a document (used when opening files)
 */
export function setFileHandle(documentId: string, handle: FileSystemFileHandle): void {
  fileHandles.set(documentId, handle)
}

/**
 * Check if a document has an existing file handle (has been saved/opened from a file)
 */
export function hasFileHandle(documentId: string): boolean {
  return fileHandles.has(documentId)
}

/**
 * Re-read a file from its stored file handle (browser File System Access API)
 */
export async function readFromFileHandle(documentId: string): Promise<string | null> {
  const handle = fileHandles.get(documentId)
  if (!handle) return null
  try {
    const file = await handle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

/**
 * Clear a file handle (used when closing documents)
 */
export function clearFileHandle(documentId: string): void {
  fileHandles.delete(documentId)
  lineEndings.delete(documentId)
  clearTauriFilePath(documentId)
}

/**
 * Watch a file handle for external changes by polling lastModified.
 * Reports { kind: 'changed' } for modifications and { kind: 'removed' } for deletion.
 * If a deleted file is recreated, reports 'changed' again.
 * Returns a cleanup function, or null if no handle exists.
 */
export function watchFileHandle(
  documentId: string,
  onChange: (event: { kind: 'changed' | 'removed' }) => void,
  intervalMs = 2000
): (() => void) | null {
  const handle = fileHandles.get(documentId)
  if (!handle) return null
  let lastModified = 0
  let deleted = false
  handle.getFile().then((f) => { lastModified = f.lastModified }).catch(() => {})
  const id = setInterval(async () => {
    try {
      const file = await handle.getFile()
      if (deleted) {
        // File was recreated
        deleted = false
        lastModified = file.lastModified
        onChange({ kind: 'changed' })
      } else if (lastModified && file.lastModified > lastModified) {
        lastModified = file.lastModified
        onChange({ kind: 'changed' })
      }
    } catch {
      if (!deleted) {
        deleted = true
        onChange({ kind: 'removed' })
      }
      // Keep polling so we can detect recreation
    }
  }, intervalMs)
  return () => clearInterval(id)
}
