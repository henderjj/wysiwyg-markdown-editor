# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**When adding or changing user-facing features, update `USER_GUIDE.md` and `README.md`** with relevant documentation. `USER_GUIDE.md` is written for end users (how to use features). `README.md` is the project overview (feature list, supported elements, tech stack).

**When work is complete and ready to commit, check whether the app version needs incrementing** (new feature → minor, bug fix → patch). The version is recorded in five places that must stay in sync: `package.json`, `package-lock.json` (sync via `npm install --package-lock-only`), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `wysiwyg-markdown` entry in `src-tauri/Cargo.lock` (do not touch other crates' version lines). Include the new version in the commit message title, e.g. `(v1.4.1)`. Skip the bump only for changes with no shipped-behavior impact (docs-only, test-only, tooling).

## Build & Dev Commands

```bash
npm run dev          # Vite dev server with HMR (http://localhost:5173)
npm run build        # TypeScript check + Vite production build → dist/
npm run lint         # ESLint
npm run tauri:dev    # Tauri desktop dev (requires Rust toolchain)
npm run tauri:build  # Tauri desktop production build
```

Tests run with vitest (`npm test` → `vitest run`, jsdom environment). The main suite is `src/lib/markdownRoundtrip.test.ts`.

## Architecture

WYSIWYG markdown editor built with React 18 + TipTap (ProseMirror) + Tailwind CSS. Runs as a web app or Tauri desktop app.

### Data Flow

```
File (.md) → markdownToHtml() → HTML string → editor.commands.setContent(html) → TipTap/ProseMirror
                                                                                        ↓
File (.md) ← applyLineEnding() ← htmlToMarkdown() ← editor.getHTML() ←──────── User edits
```

- **Import path**: `src/lib/markdownParser.ts` — custom line-by-line stateful parser converts Markdown → HTML
- **Export path**: `src/lib/markdown.ts` — Turndown library converts HTML → Markdown with custom GFM rules
- Internally everything uses `\n`; original file line endings (CRLF/LF) are detected on open and re-applied on save

### State Model

All state lives in `App.tsx`. Documents are persisted to localStorage as markdown strings. There is no external backend.

- `documents[]` — array of `{ id, filename, content (markdown), lastModified }`
- `editorRef` — single TipTap editor instance shared across tabs
- `isLoadingContentRef` — prevents auto-save from firing during programmatic content updates
- Per-document file handles and line endings stored in Maps in `markdown.ts`

### Tab Switching

One editor instance serves all tabs. On switch: current content is exported to markdown → new tab's markdown is parsed to HTML → `setContent(html)`. Auto-save uses a 1000ms debounce. Scroll position is saved per-document and restored on tab switch. Opening a file scrolls to top.

### Tauri Integration

`src/lib/tauri.ts` wraps Tauri dialog/fs plugins. All file I/O in `markdown.ts` checks `isTauri()` first and falls back to the File System Access API, then to `<input type="file">`.

**File change detection:** All open documents with file paths (Tauri) or file handles (web) are watched for external changes. Tauri uses `@tauri-apps/plugin-fs` `watch` (requires `features = ["watch"]` in `Cargo.toml` and `fs:allow-watch` permission). Web uses `FileSystemFileHandle.getFile().lastModified` polling (2s interval). A blue dot appears on tabs with external changes, and an inline info bar with Reload/Dismiss appears when that tab is active. A `recentlySavedRef` guard (3s) suppresses false positives from the app's own saves.

**File deletion detection:** Both watchers (`watchFilePath` in `tauri.ts`, `watchFileHandle` in `markdown.ts`) distinguish `{ kind: 'removed' }` from `{ kind: 'changed' }` events. Tauri inspects `WatchEvent.type` for a `remove` key and confirms with `fileExists()` after a 500ms delay (to avoid false positives from atomic saves). Web detects deletion when `handle.getFile()` throws. Deleted files are tracked in a separate `fileDeletedDocs` state set. An amber dot appears on tabs and an amber warning bar with Save As/Dismiss appears when active. If a deleted file is recreated, the watcher transitions it from `fileDeletedDocs` to `fileChangedDocs`. Tauri uses `pollFileRecreation()` (2s interval) to detect recreation since the native watcher may stop delivering events after deletion.

**Tauri 2 permissions:** Every Tauri API call (window, fs, dialog, etc.) requires an explicit permission in `src-tauri/capabilities/default.json`. If a new Tauri API is used in frontend code, add the corresponding permission (e.g., `core:window:allow-set-title` for `getCurrentWindow().setTitle()`). Calls will fail silently without the correct permission.

### Editor Configuration

`src/components/Editor/Editor.tsx` configures TipTap extensions. The `markdownShortcuts` toggle controls whether typing `# ` auto-creates headings etc. — when off, extensions are `.extend()`ed to return empty `addInputRules` (including StarterKit's sub-extensions via `addExtensions` override). Changing this remounts the editor via React `key` prop. Content is saved to document state before the remount to prevent data loss.

### Markdown Parser Specifics

The custom parser in `markdownParser.ts` normalizes `\r\n` → `\n`, strips BOM, and replaces NUL bytes with U+FFFD before processing. It handles: ATX headings, fenced code blocks, bullet/ordered/task lists, blockquotes (including nested `>>`, since blockquote content is parsed recursively), GFM tables, horizontal rules, inline formatting (bold, italic, strikethrough, code, links, images), and backslash escape sequences. It does **not** handle setext headings — `Title` + `===` yields two paragraphs, and `Title` + `---` yields a paragraph plus an `<hr>` because the thematic-break rule matches first.

Relative and local image paths are **not resolved** against the open document's directory — the `src` is passed through verbatim (`markdownParser.ts:425`), so the webview resolves it against the app origin and the image appears broken. Only `http(s)://` images render in-editor. Fixing this needs both document-directory resolution and Tauri's `assetProtocol` (currently absent from `tauri.conf.json`, which sets only `csp: null`).

**Backslash escapes:** The parser accepts `\X` for the full CommonMark ASCII punctuation set — the shared constant `ESCAPABLE_PUNCTUATION` exported from `markdownParser.ts`; a backslash before any other character stays literal. Inline escapes are stashed as placeholders in `parseInline()` *before* HTML entity escaping (so `\&`, `\<`, `\"` work) and restored entity-escaped at the end; placeholders that land inside inline code spans are restored as backslash + character, since backslashes are literal inside code. Block-level lines starting with `\#`, `\-`, `\*`, etc. are treated as paragraphs with the backslash stripped. The `_`/`__` emphasis regexes have Unicode intraword guards (`(?<![\p{L}\p{N}_]) … (?![\p{L}\p{N}_])`) so `snake_case` never italicizes; intraword `*` emphasis still works per GFM. Turndown's `escape` function is always enabled and escapes inline chars (`` ` `` `*` `~`) everywhere, `_` only when NOT intraword (word chars on both sides — the same predicate as the parser guards, so `my_variable_name` stays clean in saved files), and block chars (`#` `>` `-` `+` digit+`.`) at line start. Inside headings the block-char escapes are stripped again by a custom Turndown heading rule (`### 1. Intro` needs no escape — the `#` prefix already prevents list/blockquote reparsing); only single-backslash escapes are stripped, so a literal `\` typed in the editor (exported as `\\`) survives. Every `\` is escaped to `\\`. Import deliberately accepts more escapes than export emits (e.g. `\&` from an externally-authored file is normalized to a bare `&` on first save). This ensures literal markdown characters survive round-trips regardless of MD shortcuts mode. The escape set, regex/constant alignment, and roundtrip behaviors are pinned by the `escape handling` suite in `markdownRoundtrip.test.ts`.

**MarkdownEscape extension** (MD shortcuts ON only): A `handleKeyDown` ProseMirror plugin (priority 1000) that consumes `\X` sequences as the user types — deleting the backslash and inserting the literal character — for any X in `ESCAPABLE_PUNCTUATION` (imported from `markdownParser.ts`, so typing matches what the parser accepts). Uses `event.preventDefault()` + `return true` to bypass all input rules. A `suppressNextChar` flag prevents the next keystroke (typically space) from triggering block-level input rules after consuming `\*`, `\#`, `\-`, `\+`, or `\>`. Backslash itself (`\`) is excluded from consumption — `\\` stays visible in the editor and is handled by the export function.

### Clipboard & Export

The `ClipboardMarkdown` extension in `Editor.tsx` intercepts native `copy` and `cut` events. It serializes the ProseMirror selection to HTML via `DOMSerializer`, converts it to markdown via `htmlToMarkdown()`, and places both on the clipboard (`text/html` for rich targets, `text/plain` as markdown for plain text editors).

Helper utilities in `markdown.ts`:
- `getSelectedHtml(editor)` — returns the HTML of the current selection (or `null` if empty)
- `wrapHtmlDocument(html, title)` — wraps editor HTML in a standalone styled HTML document
- `exportHtmlFile(html, filename)` — saves HTML via Tauri dialog / File System Access API / browser download

The Edit menu has "Copy as Markdown" (selection-aware, falls back to full doc), "Copy as HTML", and "Copy as Plain Text" (Ctrl+Shift+C, strips all formatting). The File menu has "Export as HTML..." which produces a styled `.html` file. All copy options also appear in the right-click context menu when text is selected.

### Keyboard Accessibility

The editor must remain usable without a mouse and must not trap keyboard focus (WCAG 2.1.2). Tab key behavior is context-dependent and handled by two custom extensions in `Editor.tsx`:

| Context | Tab | Shift+Tab |
|---------|-----|-----------|
| Normal text | Browser default (no trap) | Browser default |
| Table cell | Next cell (TipTap built-in) | Previous cell |
| List item | Indent (TipTap built-in) | Outdent |
| Code block | Insert 2 spaces (`CodeBlockTabIndent`) | Remove up to 2 leading spaces |
| After Escape | Browser focus navigation (`EscapeTabExit`) | Browser focus navigation |
| UI elements (menus, dialogs, search bar) | Browser default | Browser default |

**Extension ordering matters.** `CodeBlockTabIndent` and `EscapeTabExit` are placed after list/table extensions in the `createExtensions()` array so that built-in list indent and table cell navigation take priority. Each handler checks its context (e.g., `editor.isActive('codeBlock')`) and returns `false` to defer to other handlers when not applicable.

**Escape-then-Tab exit mechanism.** `EscapeTabExit` blurs the editor on Escape and tracks an `escapedRecently` flag (1.5s timeout, reset on any non-Tab keypress). This is the safety net; the blur itself is the primary mechanism that lets Tab reach the browser.

**MarkdownEscape uses `handleKeyDown`** (not `handleTextInput` or `InputRule`) at priority 1000 to ensure it fires before TipTap's built-in input rules. This is critical — `handleTextInput`-based approaches failed because TipTap's input rules could fire first regardless of extension priority.

When adding new editor extensions that intercept Tab or Escape, ensure they do not create keyboard traps — always provide a way for keyboard-only users to move focus out of the editor.
