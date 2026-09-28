import { decodeHTMLStrict } from 'entities'

/**
 * HTML entity references as CommonMark defines them: a named entity, or a
 * decimal (1–7 digits) or hex (1–6 digits) numeric reference, always ending
 * in `;`. Shared by the parser (decode on import) and the exporter (escape a
 * bare `&` that would otherwise be read back as an entity).
 */
export const ENTITY_PATTERN = /&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/

/**
 * Decode one entity reference such as `&copy;` or `&#169;`, or return null if
 * it isn't one GitHub would render (e.g. `&foo;`). Uses the full HTML5 named
 * entity list; invalid code points decode to U+FFFD, as in CommonMark.
 */
export function decodeEntity(source: string): string | null {
  const decoded = decodeHTMLStrict(source)
  return decoded === source ? null : decoded
}

/** True when `text` starts with an entity reference that would decode. */
export function startsWithEntity(text: string): boolean {
  const match = new RegExp('^' + ENTITY_PATTERN.source).exec(text)
  return match !== null && decodeEntity(match[0]) !== null
}
