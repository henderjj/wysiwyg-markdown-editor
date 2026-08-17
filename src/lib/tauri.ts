/**
 * Tauri integration utilities
 * Provides native file operations when running as a desktop app
 */

// Check if running in Tauri
export const isTauri = (): boolean => {
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

// Dynamically import Tauri APIs only when needed
export async function openFileWithTauri(): Promise<{ content: string; filename: string; path: string } | null> {
  if (!isTauri()) return null

  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')

    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Markdown',
        extensions: ['md', 'markdown']
      }]
    })

    if (!selected) return null

    const path = selected as string
    const content = await readTextFile(path)
    const filename = path.split(/[/\\]/).pop() || 'document.md'

    return { content, filename, path }
  } catch (err) {
    console.error('Tauri file open error:', err)
    return null
  }
}

export async function saveFileWithTauri(
  content: string,
  defaultPath?: string
): Promise<string | null> {
  if (!isTauri()) return null

  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')

    const filePath = await save({
      defaultPath: defaultPath || 'document.md',
      filters: [{
        name: 'Markdown',
        extensions: ['md']
      }]
    })

    if (!filePath) return null

    await writeTextFile(filePath, content)
    return filePath.split(/[/\\]/).pop() || 'document.md'
  } catch (err) {
    console.error('Tauri file save error:', err)
    return null
  }
}

// Store file paths for direct saving (overwriting)
const filePaths = new Map<string, string>()

export function setFilePath(documentId: string, path: string): void {
  filePaths.set(documentId, path)
}

export function getFilePath(documentId: string): string | undefined {
  return filePaths.get(documentId)
}

export function clearFilePath(documentId: string): void {
  filePaths.delete(documentId)
}

export async function getCliFilePath(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string | null>('get_cli_file_path')
  } catch {
    return null
  }
}

export async function readFileByPath(path: string): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path)
  } catch (err) {
    console.error('Tauri readFileByPath error:', err)
    return null
  }
}

export async function saveHtmlFileWithTauri(
  content: string,
  defaultFilename: string
): Promise<string | null> {
  if (!isTauri()) return null

  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const { save } = await import('@tauri-apps/plugin-dialog')

    const filePath = await save({
      defaultPath: defaultFilename,
      filters: [{
        name: 'HTML',
        extensions: ['html', 'htm']
      }]
    })

    if (!filePath) return null
    await writeTextFile(filePath, content)
    return filePath.split(/[/\\]/).pop() || defaultFilename
  } catch (err) {
    console.error('Tauri HTML save error:', err)
    return null
  }
}

export async function saveFileDirectWithTauri(
  content: string,
  documentId: string,
  defaultFilename: string,
  forceNewDialog: boolean = false
): Promise<string | null> {
  if (!isTauri()) return null

  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const { save } = await import('@tauri-apps/plugin-dialog')

    let filePath: string | undefined = forceNewDialog ? undefined : filePaths.get(documentId)

    if (!filePath) {
      // No existing path, prompt for save location
      const savedPath = await save({
        defaultPath: defaultFilename,
        filters: [{
          name: 'Markdown',
          extensions: ['md']
        }]
      })

      if (!savedPath) return null
      filePath = savedPath
      filePaths.set(documentId, filePath)
    }

    await writeTextFile(filePath, content)
    return filePath.split(/[/\\]/).pop() || 'document.md'
  } catch (err) {
    console.error('Tauri file save error:', err)
    // Clear the path on error so next save prompts again
    filePaths.delete(documentId)
    return null
  }
}

export async function watchFilePath(
  path: string,
  onChange: (event: { kind: 'changed' | 'removed' }) => void
): Promise<(() => void) | null> {
  if (!isTauri()) return null
  try {
    const { watch } = await import('@tauri-apps/plugin-fs')
    const unwatch = await watch(path, (event) => {
      const type = event.type
      if (typeof type === 'object' && type !== null && 'remove' in type) {
        onChange({ kind: 'removed' })
      } else {
        onChange({ kind: 'changed' })
      }
    })
    return unwatch
  } catch (err) {
    console.error('watchFilePath error:', err)
    return null
  }
}

export async function fileExists(path: string): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch {
    return false
  }
}

export function pollFileRecreation(
  path: string,
  onRecreated: () => void,
  intervalMs = 2000
): () => void {
  const id = setInterval(async () => {
    if (await fileExists(path)) {
      clearInterval(id)
      onRecreated()
    }
  }, intervalMs)
  return () => clearInterval(id)
}
