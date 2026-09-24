import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { mergeAttributes } from '@tiptap/core'
import { writeClipboardText } from '../lib/clipboard'

const COPY_LABEL = 'Copy'
const FEEDBACK_MS = 1500

/**
 * CodeBlockLowlight with a hover "Copy" button that puts the block's raw
 * contents on the clipboard, without the ``` fence a Ctrl+C would add.
 *
 * The node view is display-only: renderHTML is untouched, so getHTML(), the
 * markdown export and the clipboard serializer never see the button. Lowlight's
 * syntax highlighting is decorations on the text, so it applies inside
 * contentDOM exactly as it does without a node view.
 */
export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    const { HTMLAttributes: optionAttrs, languageClassPrefix } = this.options
    return ({ node: initialNode, HTMLAttributes }) => {
      let node = initialNode

      const dom = document.createElement('div')
      dom.className = 'code-block'

      const pre = document.createElement('pre')
      for (const [name, value] of Object.entries(mergeAttributes(optionAttrs, HTMLAttributes))) {
        if (value != null) pre.setAttribute(name, String(value))
      }

      const code = document.createElement('code')
      const setLanguageClass = () => {
        const language = node.attrs.language
        if (language && languageClassPrefix) code.className = languageClassPrefix + language
        else code.removeAttribute('class')
      }
      setLanguageClass()
      pre.appendChild(code)

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-block-copy'
      button.contentEditable = 'false'
      button.textContent = COPY_LABEL
      button.title = 'Copy code'
      button.setAttribute('aria-label', 'Copy code')

      let resetTimer: ReturnType<typeof setTimeout> | undefined
      const showFeedback = (label: string) => {
        button.textContent = label
        clearTimeout(resetTimer)
        resetTimer = setTimeout(() => { button.textContent = COPY_LABEL }, FEEDBACK_MS)
      }
      // Keep the caret and selection where they are.
      button.addEventListener('mousedown', e => e.preventDefault())
      button.addEventListener('click', () => {
        writeClipboardText(node.textContent).then(
          () => showFeedback('Copied'),
          () => showFeedback('Copy failed'),
        )
      })

      dom.append(button, pre)

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== node.type) return false
          node = updated
          setLanguageClass()
          return true
        },
        // The button is not document content: ProseMirror must neither handle
        // its events nor treat its label changes as edits to re-parse.
        stopEvent: event => button.contains(event.target as Node),
        ignoreMutation: mutation => button.contains(mutation.target),
        destroy() {
          clearTimeout(resetTimer)
        },
      }
    }
  },
})
