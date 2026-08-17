const STORAGE_KEY = 'wysiwyg-md-recent-files'
const MAX_RECENT = 10

export function loadRecentFiles(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // localStorage unavailable or holds malformed JSON — start with an empty list
  }
  return []
}

export function addRecentFile(path: string): string[] {
  const recent = loadRecentFiles().filter((p) => p !== path)
  recent.unshift(path)
  const trimmed = recent.slice(0, MAX_RECENT)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  return trimmed
}

export function clearRecentFiles(): string[] {
  localStorage.removeItem(STORAGE_KEY)
  return []
}
