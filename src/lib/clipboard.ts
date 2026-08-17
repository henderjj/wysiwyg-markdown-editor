/**
 * Clipboard utilities — uses Tauri's native clipboard-manager plugin when
 * running as a desktop app, falling back to navigator.clipboard for browsers.
 */

import { isTauri } from './tauri'

export async function readClipboardText(): Promise<string> {
  if (isTauri()) {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
    return await readText()
  }
  return await navigator.clipboard.readText()
}

export async function writeClipboardText(text: string): Promise<void> {
  if (isTauri()) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(text)
    return
  }
  await navigator.clipboard.writeText(text)
}
