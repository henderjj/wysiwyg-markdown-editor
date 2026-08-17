/**
 * Parse Markdown to HTML for importing into the editor
 * This is a simple parser for GFM - handles common elements
 */

interface ParseState {
  inCodeBlock: boolean
  codeBlockLang: string
  codeBlockContent: string[]
  inList: boolean
  listType: 'ul' | 'ol' | 'task' | null
  listIndent: number
  inBlockquote: boolean
  blockquoteLines: string[]
  blockquoteWasClosed: boolean
  inTable: boolean
  tableRows: string[][]
  hasTableHeader: boolean
}

/**
 * CommonMark ASCII punctuation — the characters a backslash can escape.
 * Shared with the MarkdownEscape editor extension so import, export, and
 * typing all agree on what `\X` means. Must stay in sync with the escape
 * regex in parseInline() (pinned by a test in markdownRoundtrip.test.ts).
 */
export const ESCAPABLE_PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

// Normalize common language aliases to their canonical lowlight names
const languageAliases: Record<string, string> = {
  'c#': 'csharp',
  'cs': 'csharp',
  'c++': 'cpp',
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'bash',
  'zsh': 'bash',
  'yml': 'yaml',
  'html': 'xml',
  'htm': 'xml',
  'objc': 'objectivec',
  'objective-c': 'objectivec',
  'vb': 'vbnet',
}

function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim()
  return languageAliases[lower] || lower
}

export function markdownToHtml(markdown: string): string {
  // Normalize line endings (CRLF → LF), strip UTF-8 BOM, and replace raw NUL
  // bytes (CommonMark mandates U+FFFD; NUL would collide with the \x00-framed
  // placeholders used in parseInline)
  const normalized = markdown.replace(/\0/g, '�').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '')
  const lines = normalized.split('\n')
  const result: string[] = []
  const state: ParseState = {
    inCodeBlock: false,
    codeBlockLang: '',
    codeBlockContent: [],
    inList: false,
    listType: null,
    listIndent: 0,
    inBlockquote: false,
    blockquoteLines: [],
    blockquoteWasClosed: false,
    inTable: false,
    tableRows: [],
    hasTableHeader: false,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Handle code blocks
    if (line.startsWith('```')) {
      if (state.inCodeBlock) {
        // End code block
        const code = escapeHtml(state.codeBlockContent.join('\n'))
        const langClass = state.codeBlockLang ? ` class="language-${state.codeBlockLang}"` : ''
        result.push(`<pre><code${langClass}>${code}</code></pre>`)
        state.inCodeBlock = false
        state.codeBlockLang = ''
        state.codeBlockContent = []
      } else {
        // Start code block
        closeList(result, state)
        closeTable(result, state)
        state.inCodeBlock = true
        state.codeBlockLang = normalizeLanguage(line.slice(3).trim())
      }
      continue
    }

    if (state.inCodeBlock) {
      state.codeBlockContent.push(line)
      continue
    }

    // Close blockquote if current line is not a continuation
    if (state.inBlockquote && !line.startsWith('>')) {
      closeBlockquote(result, state)
    }

    // Empty line
    if (line.trim() === '') {
      closeList(result, state)
      closeTable(result, state)
      continue
    }

    // Backslash-escaped block syntax: \# \- \> \+ \* \` \1. etc.
    // Treat as a regular paragraph with the leading backslash removed.
    if (/^\\[#\-+*>`\d!|~]/.test(line)) {
      closeList(result, state)
      closeTable(result, state)
      const content = parseInline(line.slice(1))
      result.push(`<p>${content}</p>`)
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      closeList(result, state)
      closeTable(result, state)
      const level = headingMatch[1].length
      const content = parseInline(headingMatch[2])
      result.push(`<h${level}>${content}</h${level}>`)
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      closeList(result, state)
      closeTable(result, state)
      result.push('<hr>')
      continue
    }

    // Blockquote (supports multi-line and nested >> syntax)
    if (line.startsWith('>')) {
      closeList(result, state)
      closeTable(result, state)
      if (!state.inBlockquote) {
        // Insert separator between file-sourced separate blockquote groups
        if (state.blockquoteWasClosed) {
          result.push('<p></p>')
        }
        state.blockquoteWasClosed = false
        state.inBlockquote = true
        state.blockquoteLines = []
      }
      // Strip outermost > and optional following space; inner > preserved for recursive nesting
      state.blockquoteLines.push(line.replace(/^>\s?/, ''))
      continue
    }

    // Non-blockquote content clears the blockquote-was-closed flag
    state.blockquoteWasClosed = false

    // Table row (starts with |)
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      closeList(result, state)

      // Check if this is a separator row (contains only |, -, :, and spaces)
      // Match patterns like |---|---| or | --- | --- | or |:---|:---:|
      const trimmedLine = line.trim()
      const isSeparator = /^\|(\s*:?-+:?\s*\|)+$/.test(trimmedLine)

      if (isSeparator) {
        // Mark that we have a header (the previous row was the header)
        state.hasTableHeader = true
        continue
      }

      // Parse the cells
      const cells = line
        .trim()
        .slice(1, -1) // Remove leading and trailing |
        .split('|')
        .map(cell => cell.trim())

      if (!state.inTable) {
        state.inTable = true
        state.tableRows = []
      }

      state.tableRows.push(cells)
      continue
    } else if (state.inTable) {
      // End of table - output it
      closeTable(result, state)
    }

    // Task list item (allow empty task content with .* instead of .+)
    const taskMatch = line.match(/^(\s*)- \[([ xX])\]\s*(.*)$/)
    if (taskMatch) {
      closeTable(result, state)
      const checked = taskMatch[2].toLowerCase() === 'x'
      const content = parseInline(taskMatch[3])

      if (!state.inList || state.listType !== 'task') {
        closeList(result, state)
        result.push('<ul data-type="taskList">')
        state.inList = true
        state.listType = 'task'
      }

      // TipTap TaskItem expects data-type="taskItem" and data-checked attributes
      const checkedAttr = checked ? 'true' : 'false'
      result.push(`<li data-type="taskItem" data-checked="${checkedAttr}"><label><input type="checkbox"${checked ? ' checked="checked"' : ''}><span></span></label><div><p>${content}</p></div></li>`)
      continue
    }

    // Unordered list item
    const ulMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
    if (ulMatch) {
      closeTable(result, state)
      const marker = ulMatch[2]
      const content = parseInline(ulMatch[3])

      if (!state.inList || state.listType !== 'ul') {
        closeList(result, state)
        const markerAttr = marker !== '-' ? ` data-marker="${marker}"` : ''
        result.push(`<ul${markerAttr}>`)
        state.inList = true
        state.listType = 'ul'
      }

      result.push(`<li><p>${content}</p></li>`)
      continue
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/)
    if (olMatch) {
      closeTable(result, state)
      const content = parseInline(olMatch[2])

      if (!state.inList || state.listType !== 'ol') {
        closeList(result, state)
        result.push('<ol>')
        state.inList = true
        state.listType = 'ol'
      }

      result.push(`<li><p>${content}</p></li>`)
      continue
    }

    // Regular paragraph
    closeList(result, state)
    closeTable(result, state)
    const content = parseInline(line)
    result.push(`<p>${content}</p>`)
  }

  // Close any remaining open elements
  closeBlockquote(result, state)
  closeList(result, state)
  closeTable(result, state)

  return result.join('\n')
}

function closeList(result: string[], state: ParseState): void {
  if (state.inList) {
    if (state.listType === 'task') {
      result.push('</ul>')
    } else if (state.listType === 'ul') {
      result.push('</ul>')
    } else if (state.listType === 'ol') {
      result.push('</ol>')
    }
    state.inList = false
    state.listType = null
  }
}

/** Does this line start a block-level construct (and therefore must not be
 *  joined with a preceding plain-text line)? */
function isBlockSyntax(line: string): boolean {
  const t = line.trimStart()
  if (t.startsWith('>')) return true                    // nested blockquote
  if (/^#{1,6}\s/.test(t)) return true                  // ATX heading
  if (t.startsWith('```')) return true                   // fenced code
  if (/^[-*+]\s/.test(t)) return true                   // unordered list
  if (/^\d+\.\s/.test(t)) return true                   // ordered list
  if (t.startsWith('|')) return true                     // table row
  if (/^(---+|\*\*\*+|___+)\s*$/.test(t)) return true   // horizontal rule
  return false
}

function closeBlockquote(result: string[], state: ParseState): void {
  if (!state.inBlockquote || state.blockquoteLines.length === 0) {
    state.inBlockquote = false
    state.blockquoteLines = []
    return
  }

  // Merge consecutive plain-text lines into single paragraphs so that only
  // actual blank lines (from bare ">") create <p> boundaries.  This matches
  // standard Markdown paragraph semantics and preserves blank-line info for
  // round-tripping.
  const merged: string[] = []
  let pending: string[] = []
  for (const line of state.blockquoteLines) {
    if (line.trim() === '' || isBlockSyntax(line)) {
      if (pending.length > 0) {
        merged.push(pending.join(' '))
        pending = []
      }
      merged.push(line)
    } else {
      pending.push(line)
    }
  }
  if (pending.length > 0) {
    merged.push(pending.join(' '))
  }

  // Recursively parse the inner content (with outermost > already stripped).
  // This handles headings, lists, nested blockquotes, etc. inside blockquotes.
  const innerMarkdown = merged.join('\n')
  const innerHtml = markdownToHtml(innerMarkdown)
  result.push(`<blockquote>${innerHtml}</blockquote>`)

  state.inBlockquote = false
  state.blockquoteLines = []
  state.blockquoteWasClosed = true
}

function closeTable(result: string[], state: ParseState): void {
  if (state.inTable && state.tableRows.length > 0) {
    result.push('<table>')

    const startDataRow = state.hasTableHeader ? 1 : 0

    // Output header row if we have one
    if (state.hasTableHeader && state.tableRows.length > 0) {
      const headerRow = state.tableRows[0]
      result.push('<tr>')
      for (const cell of headerRow) {
        result.push(`<th><p>${parseInline(cell)}</p></th>`)
      }
      result.push('</tr>')
    }

    // Output data rows
    for (let i = startDataRow; i < state.tableRows.length; i++) {
      const row = state.tableRows[i]
      result.push('<tr>')
      for (const cell of row) {
        result.push(`<td><p>${parseInline(cell)}</p></td>`)
      }
      result.push('</tr>')
    }

    result.push('</table>')
  }

  state.inTable = false
  state.tableRows = []
  state.hasTableHeader = false
}

function parseInline(text: string): string {
  let result = text

  // Protect backslash-escaped characters by replacing them with placeholders.
  // This prevents \* from being interpreted as italic, \# as heading, etc.
  // Runs on the RAW text (before HTML entity escaping) so sequences like \& and
  // \< are recognized. The character class is the full CommonMark ASCII
  // punctuation set (= ESCAPABLE_PUNCTUATION) written as its four contiguous
  // ranges; a backslash before any other character (e.g. C:\Users) stays a
  // literal backslash per CommonMark.
  const escaped: string[] = []
  result = result.replace(/\\([!-/:-@[-`{-~])/g, (_, ch) => {
    escaped.push(ch)
    return `\x00ESC${escaped.length - 1}\x00`
  })

  // Escape HTML (after escape sequences are safely stashed)
  result = escapeHtml(result)

  // Extract inline code spans first — content inside backticks is literal
  // Double backticks first (allows literal backticks inside), then single.
  // Backslashes are literal inside code spans (CommonMark), so escape
  // placeholders that landed inside backticks are restored as \X verbatim
  // (entity-escaped, since the stashed char came from the raw text).
  const restoreEscapesInCode = (code: string): string =>
    // eslint-disable-next-line no-control-regex -- NUL is the deliberate placeholder sentinel; it cannot appear in input (stripped on normalize)
    code.replace(/\x00ESC(\d+)\x00/g, (_, i) => '\\' + escapeHtml(escaped[parseInt(i)]))
  const codeSpans: string[] = []
  result = result.replace(/``(.+?)``/g, (_, code) => {
    // Strip one leading and one trailing space per GFM spec
    const trimmed = code.replace(/^ (.+) $/, '$1')
    codeSpans.push(`<code>${restoreEscapesInCode(trimmed)}</code>`)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(`<code>${restoreEscapesInCode(code)}</code>`)
    return `\x00CODE${codeSpans.length - 1}\x00`
  })

  // Bold (must come before italic). Underscore delimiters require a non-word
  // character on the outside — GFM forbids intraword _ emphasis (snake_case,
  // dunder__names stay literal) but allows intraword * emphasis. Unicode
  // classes so accented/CJK words count as words too.
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/(?<![\p{L}\p{N}_])__(.+?)__(?![\p{L}\p{N}_])/gu, '<strong>$1</strong>')

  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>')
  result = result.replace(/(?<![\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, '<em>$1</em>')

  // Strikethrough
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>')

  // Images (must come before links so ![alt](url) isn't matched as a link)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Restore inline code spans
  // eslint-disable-next-line no-control-regex -- NUL is the deliberate placeholder sentinel; it cannot appear in input (stripped on normalize)
  result = result.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeSpans[parseInt(i)])

  // Restore backslash-escaped characters as their literal form, entity-escaped
  // because they were stashed from the raw text (\& → &amp;, \< → &lt;)
  // eslint-disable-next-line no-control-regex -- NUL is the deliberate placeholder sentinel; it cannot appear in input (stripped on normalize)
  result = result.replace(/\x00ESC(\d+)\x00/g, (_, i) => escapeHtml(escaped[parseInt(i)]))

  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
