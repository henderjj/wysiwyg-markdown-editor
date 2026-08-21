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

WYSIWYG markdown editor built with React 19 + TipTap (ProseMirror) + Tailwind CSS v4. Runs as a web app or Tauri desktop app.

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

### Styling (Tailwind v4)

Tailwind is configured **CSS-first**. There is no `tailwind.config.js` and no `postcss.config.js` — both were deleted in the v4 migration. Tailwind is wired as a Vite plugin (`@tailwindcss/vite` in `vite.config.ts`), and v4's Lightning CSS handles vendor prefixing, so `postcss` and `autoprefixer` are not dependencies either. All configuration lives in the first ~35 lines of `src/index.css`. Source files are found by v4's automatic detection; no `@source` directive is needed (verified by grepping the emitted CSS for classes used only deep in `src/`).

**Dark mode is a two-part contract that fails silently if half of it is broken.** `useTheme.ts` puts an explicit `dark` or `light` class on `<html>`; `src/index.css` declares `@custom-variant dark (&:is(.dark *))`. v3's `darkMode: 'class'` has no v4 equivalent, so if that line is ever dropped, all ~318 `dark:` utilities silently fall back to `prefers-color-scheme` and the theme menu stops doing anything — while the build, lint, tsc and the whole test suite stay green. Use `:is()`, not `:where()`: `:is()` contributes `.dark`'s specificity, which is what v3's generated `.dark .dark\:foo` selector did, so dark keeps outranking light. `:where()` is specificity-zero and would change that.

**The `@apply` rules must stay unlayered.** `src/index.css` has ~91 `@apply` rules at the top level of the file. In v3 they sat after `@tailwind utilities` and won at equal specificity by source order; in v4, unlayered CSS beats every `@layer`, which preserves the same relationship. Wrapping them in `@layer components` would flip it and let utility classes in markup start overriding the `.ProseMirror` rules — a large, silent visual change. Only the small Preflight-compat block at the top is deliberately inside `@layer base`.

**Preflight compat:** v4 makes buttons `cursor: default` and derives placeholder colour from text colour. Both v3 behaviours are restored in that `@layer base` block, because there are 58 `<button>` elements and only 8 explicit `cursor-pointer` classes. v4's *other* Preflight change — default border colour moving from `gray-200` to `currentColor` — is deliberately **not** shimmed: every border-width utility in this codebase is paired with an explicit `border-<colour>`, including the two that look bare (`SearchBar`'s `toggleClass` and `TableCreationDialog`'s grid cell), which take their colour from the ternary they are concatenated with. Don't reintroduce the upgrade tool's global `border-color` shim.

**Renamed utilities to know about:** v4 shifted the scale names, so `rounded` → `rounded-sm`, `rounded-sm` → `rounded-xs`, `shadow-sm` → `shadow-xs`, `backdrop-blur-sm` → `backdrop-blur-xs`, `outline-none` → `outline-hidden`. The old bare names (`rounded`, `rounded-t`, `flex-shrink-0`) still resolve as legacy aliases with identical values, so mixing them produces no visual difference but does hide which convention a file follows — prefer the v4 names. **`npx @tailwindcss/upgrade` does not catch class names inside template literals or JS string variables**, only `className` attributes; in this codebase that left four sites in `MenuBar.tsx`, `FloatingImageToolbar.tsx`, `FloatingTableToolbar.tsx` and `TableCreationDialog.tsx`. Grep for the old names after ever running it again.

**A green build proves nothing about appearance here.** There is no visual-regression tooling and no test renders a component, so `npm run build && npm test && npm run lint` cannot detect a class that compiles fine and styles nothing. Verify styling changes by driving the app in a real browser and reading computed styles.

### Editor Configuration

`src/components/Editor/Editor.tsx` configures TipTap (v3) extensions. The `markdownShortcuts` toggle controls whether typing `# ` auto-creates headings etc. — when off, extensions are `.extend()`ed to return empty `addInputRules` (including StarterKit's sub-extensions via `addExtensions` override). Changing this remounts the editor via React `key` prop. Content is saved to document state before the remount to prevent data loss.

`useEditor` is configured with `shouldRerenderOnTransaction: true` (v3 defaults this to `false`) because `MenuBar.tsx` reads `editor.isActive(...)` directly during render at ~24 call sites and `SearchBar.tsx` reads `editor.storage` for its match counter — both would freeze without it. The v3-native fix is a `useEditorState` refactor of both components; not done yet, tracked as follow-up work.

**BubbleMenu + `shouldRerenderOnTransaction` trap:** `FloatingImageToolbar.tsx` and `FloatingTableToolbar.tsx` use `@tiptap/react/menus`' `BubbleMenu`. Its React wrapper has an internal `useEffect` keyed on `[shouldShow, options, ...]` whose body dispatches a ProseMirror transaction to sync them into the plugin. Passing `shouldShow`/`options` as inline JSX literals — the obvious way to write it — gives them a fresh reference every render. Combined with `shouldRerenderOnTransaction: true` above, that's an infinite loop: transaction → Editor re-renders → new references → effect fires → dispatches a transaction → repeat. React throws "Maximum update depth exceeded" and the app fails to render at all. Caught only by manually driving the app in a browser — `npm run build`, `npm test`, and `tsc` all stayed green throughout. Both toolbars memoize `shouldShow` (`useCallback`) and `options` (`useMemo`) to break the cycle; keep them memoized if these files are touched again.

**`dangerouslySetInnerHTML` + imperative DOM writes trap:** `MermaidViewerDialog.tsx` injects Mermaid's SVG markup with `dangerouslySetInnerHTML`. Anything written onto that subtree imperatively — attributes, inline styles — is **transient**: the dialog re-renders (zoom, pan, theme tick), React re-injects the markup, and the replacement `<svg>` arrives without those writes. The v1.8.0 bug was exactly this: a `useLayoutEffect` set the svg's intrinsic `width`/`height`, it worked once, a later re-injection discarded it, and the effect never re-ran because its deps (`[svg, contentSize, fitToView]`) hadn't changed. The un-sized svg then fell back to the browser's 300px default for a replaced element and the zoom transform scaled that, so diagrams rendered small and blurry. Anything that must stick has to travel through a **React-owned prop** — the size now rides on the stage's `style` as `--diagram-w`/`--diagram-h` custom properties, consumed by the `.mermaid-viewer-stage svg` rule in `index.css`, because React re-applies `style` on every render. Don't move it back into an effect. Note also that a stylesheet rule outranks the `width="100%"` presentation attribute Mermaid emits, so no attribute removal is needed; the `!important` on `max-width` is needed only to beat Mermaid's *inline* max-width.

**Extension `this`-identity trap:** inside `src/extensions/search-replace.ts`, `this` is not a consistent object across an extension's lifecycle methods in this TipTap version — `addCommands()`'s `this` and `addProseMirrorPlugins()`'s `this` are different objects, and `editor.extensionManager.extensions.find(e => e.name === '...')` returns a third, also-different one. Mutating `extension.options` in a command and reading it back inside the plugin's `apply()` silently reads two different objects, confirmed by direct identity comparison in a debug session. The extension now carries its full state (`searchTerm`, `results`, `currentIndex`, etc.) in the plugin's own ProseMirror state, driven entirely by `tr.setMeta()`/`tr.docChanged` in `apply()` — that path only touches `EditorState`, which has no such identity hazard. `editor.storage.searchReplace` (the extension's public surface, read by `SearchBar.tsx`) is kept in sync via `syncStorageFromPlugin()`, called with each command's own `editor` parameter, which — unlike `this` — is always the right one. Checked: `Mermaid.ts`'s one `this.options.onExpand` read is a static value from `.configure()` at creation time, read within the same method it's declared in — not the cross-method runtime-mutation pattern that broke search-replace, so it isn't exposed to this. If a *new* extension mutates `this.options`/`this.storage` at runtime in one method and reads it back in another, verify by actually typing into it — a green build and test suite will not catch this.

### Markdown Parser Specifics

The custom parser in `markdownParser.ts` normalizes `\r\n` → `\n`, strips BOM, and replaces NUL bytes with U+FFFD before processing. It handles: ATX headings, fenced code blocks, bullet/ordered/task lists, blockquotes (including nested `>>`, since blockquote content is parsed recursively), GFM tables, horizontal rules, inline formatting (bold, italic, strikethrough, code, links, images), and backslash escape sequences. It does **not** handle setext headings — `Title` + `===` yields two paragraphs, and `Title` + `---` yields a paragraph plus an `<hr>` because the thematic-break rule matches first.

**GFM table cells must be split with `splitTableRow()`, never a plain `.split('|')`.** A cell containing an escaped pipe (`\|`, produced correctly by `markdown.ts`'s table exporter for a literal `|` typed by the user) used to silently corrupt the table on import — `.split('|')` has no concept of escaping and split on that pipe anyway, turning one cell into two and shifting every column after it. `splitTableRow()` tracks a running count of consecutive backslashes and only splits on a `|` preceded by an even number of them (an odd count means the pipe itself is escaped). This was found via a CodeQL alert that pointed at the *exporter's* escaping as the suspect (`js/incomplete-sanitization` on `markdown.ts`), which turned out to be a red herring — the exporter was already correct, including for a literal backslash immediately before a pipe (Turndown escapes every literal backslash to `\\` on its own, so `parseInline`'s existing backslash-escape handling — `|` is in `ESCAPABLE_PUNCTUATION` — resolves the combination correctly once the splitter stops breaking the cell apart before `parseInline` ever sees it). Verified round-trip with both a bare `|` and a literal `\|` in a cell; see the "escaped pipe" tests in `markdownRoundtrip.test.ts`.

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

### Printing

**Printing never renders the live app DOM.** `src/lib/print.ts` builds a standalone document from `editor.getHTML()` and prints it in a hidden iframe; `handlePrint` in `App.tsx` is shared by `file.print` and Ctrl+P (both were previously a bare `window.print()`, which is what produced the one-page-screenshot bug fixed in v1.8.1). The app shell cannot be printed directly: it is a fixed-height flex tree (`h-screen` + `overflow-hidden` at three levels) wrapping the editor's `overflow-y-auto` scroll viewport, so the printer only ever sees the first viewport-height slice. Overriding that in `@media print` was rejected as too fragile — there is no visual-regression tooling here, so a broken override would be invisible to CI.

The print stylesheet is the one already inside `wrapHtmlDocument()` (`markdown.ts`), so print output and "Export as HTML" cannot drift apart. That is also why the `@page`/`break-inside`/`table-header-group` rules live there rather than in `index.css` — `index.css` is not loaded in the iframe. The `@media print` block that remains in `index.css` is only a fallback for the window being printed by some *other* route (a native browser menu); it hides the shell and shows a "use File > Print" line instead of emitting a clipped screenshot.

**The iframe steals keyboard focus.** `frameWindow.focus()` is needed so the print targets the iframe rather than the parent, but nothing gives focus back — without restoring it the editor goes deaf after a single print, and typing plus every shortcut (Ctrl+P included) lands in the hidden frame. `printHtmlDocument()` captures `document.activeElement` up front and restores it after `print()` returns *and* on iframe removal. Caught only by driving two consecutive prints in a real browser; the build, tests and lint all stayed green. Do not remove either restore call.

**Mermaid prints as rendered SVG, not source.** `Mermaid.ts`'s `renderHTML` emits `<pre><code class="language-mermaid">`, so `getHTML()` yields diagram *source*; `inlineMermaidDiagrams()` re-renders each block and substitutes the SVG. It forces `theme: 'default'` because `MermaidNodeView` renders at the *app* theme, and a diagram authored in dark mode would otherwise print dark-on-white. It must keep using `nextMermaidRenderId()` for the id-collision reason documented in `mermaidLoader.ts`. A failed render leaves the original `<pre>` so the source still prints. Note "Export as HTML" does *not* do this substitution — exported files still contain the source fence.

**No Tauri permission is involved.** This is the webview's own `window.print()`, not Tauri's `core:webview:allow-print` (which is absent from `src-tauri/capabilities/default.json` and not needed). Iframe printing was confirmed working in the Tauri WebView2 build on Windows despite `additionalBrowserArgs: "--disable-features=msWebOOUI,msPdfOOUI,..."` in `tauri.conf.json` — that flag was the main suspected risk when this was built, and it turned out not to interfere, so don't go changing it on print's account. A native print dialog can't be automated, so any future change to `print.ts` needs a manual `npm run tauri:dev` + Ctrl+P as well as a browser check.

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
