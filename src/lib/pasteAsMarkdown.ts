import { markdownToHtml } from './markdownParser'
import { readClipboardText } from './clipboard'

/**
 * Read clipboard text and convert it from Markdown to HTML.
 * Returns the HTML string, or null on empty clipboard / failure.
 */
export async function pasteAsMarkdown(): Promise<string | null> {
  try {
    const text = await readClipboardText()
    if (!text.trim()) return null
    return markdownToHtml(text)
  } catch {
    return null
  }
}
