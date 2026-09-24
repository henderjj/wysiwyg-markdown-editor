import type { EditorState } from '@tiptap/pm/state'

/**
 * The raw text of the selection when it lies entirely inside code, or null
 * when it should be copied as markdown.
 *
 * "Inside code" means one of:
 * - within a single code block (any node whose spec has `code: true`, so this
 *   covers both CodeBlockLowlight and Mermaid's source editor), or
 * - within one textblock where every selected inline node is text carrying the
 *   `code` mark, i.e. inside a single inline code span.
 *
 * Someone selecting part of a code block or an inline code span is copying a
 * command or snippet, and wants it without the ``` fence or backticks. A
 * selection that reaches outside the code is a fragment of the document and
 * keeps its markdown formatting.
 */
export function codeSelectionText(state: EditorState): string | null {
  const { selection, doc, schema } = state
  if (selection.empty) return null
  const { $from, $to, from, to } = selection
  if (!$from.sameParent($to)) return null

  const parent = $from.parent
  if (parent.type.spec.code) return doc.textBetween(from, to)
  if (!parent.isTextblock) return null

  const codeMark = schema.marks.code
  if (!codeMark) return null
  let allCode = true
  doc.nodesBetween(from, to, node => {
    if (!allCode) return false
    if (node.isInline && !(node.isText && codeMark.isInSet(node.marks))) allCode = false
    return true
  })
  return allCode ? doc.textBetween(from, to) : null
}
