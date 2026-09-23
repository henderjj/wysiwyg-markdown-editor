const COMMENT_SETTINGS_KEY = 'wysiwyg-md-comment-settings'

export interface CommentSettings {
  includeAuthor: boolean
  includeTimestamp: boolean
  /** Overrides the OS user's name when non-blank */
  authorOverride: string
}

export const DEFAULT_COMMENT_SETTINGS: CommentSettings = {
  includeAuthor: true,
  includeTimestamp: true,
  authorOverride: '',
}

export function loadCommentSettings(): CommentSettings {
  try {
    const stored = localStorage.getItem(COMMENT_SETTINGS_KEY)
    if (!stored) return DEFAULT_COMMENT_SETTINGS
    const parsed = JSON.parse(stored)
    return {
      includeAuthor: typeof parsed.includeAuthor === 'boolean' ? parsed.includeAuthor : DEFAULT_COMMENT_SETTINGS.includeAuthor,
      includeTimestamp: typeof parsed.includeTimestamp === 'boolean' ? parsed.includeTimestamp : DEFAULT_COMMENT_SETTINGS.includeTimestamp,
      authorOverride: typeof parsed.authorOverride === 'string' ? parsed.authorOverride : '',
    }
  } catch {
    // localStorage unavailable or corrupt — use the defaults
    return DEFAULT_COMMENT_SETTINGS
  }
}

export function saveCommentSettings(settings: CommentSettings): void {
  try {
    localStorage.setItem(COMMENT_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // localStorage unavailable — the setting just won't persist
  }
}
