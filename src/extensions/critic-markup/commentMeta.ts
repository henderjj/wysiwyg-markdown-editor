/**
 * Author/timestamp metadata stored at the start of a CriticMarkup comment
 * body. There is no standard for this, so the app uses its own prefix:
 *
 *   [Joe Bloggs 2026-09-21 14:00]: body   author + timestamp
 *   [Joe Bloggs]: body                    author only
 *   [2026-09-21 14:00]: body              timestamp only
 *   body                                  neither
 *
 * The stored comment string is never rewritten on load — this module only
 * parses it for display. Any other shape is treated as plain comment text.
 */

export interface CommentMeta {
  author: string | null
  timestamp: string | null
  body: string
}

export interface CommentPrefixOptions {
  includeAuthor: boolean
  includeTimestamp: boolean
  author: string
}

const TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2} \d{2}:\d{2}`
// Leading/trailing whitespace is captured so replaceCommentBody can keep it.
const WITH_TIMESTAMP = new RegExp(String.raw`^(\s*\[(?:(.+?) )?(${TIMESTAMP})\]:[ ]?)([\s\S]*?)(\s*)$`)
const AUTHOR_ONLY = /^(\s*\[([^\]]+)\]:[ ]?)([\s\S]*?)(\s*)$/

function match(raw: string): { prefix: string; author: string | null; timestamp: string | null; body: string; trailing: string } | null {
  let m = WITH_TIMESTAMP.exec(raw)
  if (m) return { prefix: m[1], author: m[2] ?? null, timestamp: m[3], body: m[4], trailing: m[5] }
  m = AUTHOR_ONLY.exec(raw)
  if (m) return { prefix: m[1], author: m[2], timestamp: null, body: m[3], trailing: m[4] }
  return null
}

export function parseCommentMeta(raw: string): CommentMeta {
  const m = match(raw)
  if (!m) return { author: null, timestamp: null, body: raw.trim() }
  return { author: m.author, timestamp: m.timestamp, body: m.body }
}

export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Remove characters that would break the prefix or the CriticMarkup span. */
export function sanitizeAuthor(author: string): string {
  return author.replace(/<<\}/g, '').replace(/[\][\r\n]/g, '').replace(/\s+/g, ' ').trim()
}

/** Collapse newlines — CriticMarkup advises against them inside its tags. */
export function sanitizeCommentBody(body: string): string {
  return body.replace(/\s*\r?\n\s*/g, ' ').trim()
}

export function buildComment(body: string, options: CommentPrefixOptions, now: Date = new Date()): string {
  const parts: string[] = []
  const author = sanitizeAuthor(options.author)
  if (options.includeAuthor && author) parts.push(author)
  if (options.includeTimestamp) parts.push(formatTimestamp(now))
  const text = sanitizeCommentBody(body)
  return parts.length > 0 ? `[${parts.join(' ')}]: ${text}` : text
}

/** Replace a comment's body, keeping any metadata prefix exactly as written. */
export function replaceCommentBody(raw: string, body: string): string {
  const text = sanitizeCommentBody(body)
  const m = match(raw)
  return m ? m.prefix + text + m.trailing : text
}
