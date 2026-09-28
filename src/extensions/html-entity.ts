import { Mark } from '@tiptap/core'

/**
 * HTML entity references in markdown (issue #58): &amp; &copy; &#169; &#xA9; …
 *
 * The parser (parseInline in markdownParser.ts) decodes each entity for
 * display and wraps the character in this mark, which remembers the original
 * spelling in `data-entity`. The Turndown `htmlEntity` rule in markdown.ts
 * writes that spelling back on save, so a file keeps `&nbsp;` rather than
 * gaining an invisible U+00A0.
 *
 * A mark rather than an atom node so the character stays ordinary text:
 * search-replace only reads text nodes, so "Tom & Jerry" is still findable.
 */
export const HtmlEntity = Mark.create({
  name: 'htmlEntity',

  // Below the formatting marks (default 100), so bold/links wrap the entity
  // rather than splitting around it.
  priority: 50,

  // Typing next to an entity must not become part of it.
  inclusive: false,

  addAttributes() {
    return {
      source: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity'),
        renderHTML: (attributes) => ({ 'data-entity': attributes.source }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-entity]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
})
