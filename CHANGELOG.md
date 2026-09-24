# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0]

### Added

- **A link dialog** replaces the two browser prompts the 🔗 button used to show. It has fields for the display text and the URL, and a list of the document's headings: picking one fills in its `#slug` (and the display text, if empty), so table-of-contents links no longer need slugs typed by hand. `Enter` saves and `Esc` cancels. A `javascript:` or similar URL is rejected in the dialog rather than silently dropped.
- **The 🔗 button edits the link under the cursor.** With the caret or selection inside a link, the dialog opens as Edit Link with its text and URL filled in, and has a Remove Link button. Changing only the URL keeps any formatting inside the link. When the selection spans several paragraphs or contains an image or comment, only the URL can be set, because replacing the text would delete them.
- **The link hover tooltip says how to follow the link.** The existing tooltip, which showed only the URL, now adds "Ctrl+Click to open link" or "Ctrl+Click to go to heading" (Cmd on macOS) on a second line. Links that Ctrl+Click can't open, such as relative file paths, still show just the URL.

### Changed

- The toolbar button's tooltip reads "Insert link" or "Edit link" to match what it will do.
- Links are now inserted as ProseMirror content instead of an HTML string built from the typed URL and text, so characters such as `<` or `"` in either one are inserted literally.

### Implementation notes

- The tooltip text comes from an inline decoration held in `LinkNavigation`'s plugin state, which sets a `data-link-tip` attribute that the tooltip's CSS rule displays. Decorations exist only in the editor view, so the text never reaches `getHTML()` or the saved file.
- Edit mode uses `isMarkActive`, the same test that highlights the button, so the button edits exactly when it looks active. Link isn't inclusive, so a caret just past a link's end inserts a new link rather than editing that one.

### Verification

`npm test` passes 271 tests, including a new `linkEditing` suite run against a real TipTap editor. It covers edit and insert detection, inserting, wrapping and replacing text, keeping formatting, multi-paragraph selections, removal, heading slugs, rejected URLs and the tooltip text, and checks the tooltip never appears in `getHTML()`. `npm run build` passes and `npm run lint` shows no new warnings. Checked by driving the app in Chromium, in light and dark themes:

- editing an existing link's URL from inside the link
- inserting a heading link on selected text with the heading picker
- a `javascript:` URL disabling the Insert button with an error
- `Esc` closing the dialog and returning focus to the editor
- Remove Link
- the hover tooltip text
- no browser prompt appearing at any point

## [1.9.1]

### Fixed

- **In-document links jump to their heading** (#52, #53). A table of contents like `[Heading 1](#1-heading-1)` used to open a browser tab at `http://tauri.localhost/#1-heading-1` in the desktop app. Now it moves the caret to the heading and scrolls it into view. Fragments are matched against GitHub-style heading slugs (lowercase, punctuation dropped, spaces turned into hyphens), so `# 1. Heading 1` is `#1-heading-1`. Repeated headings take `-1`, `-2` suffixes as on GitHub, and a case-insensitive match that ignores repeated hyphens accepts anchors made by other tools. The matching lives in `src/lib/headingAnchors.ts`.

### Changed

- **Links are followed with Ctrl+Click** (Cmd+Click on macOS). A plain click now only places the caret, so link text can be edited like any other text. Before this, the desktop app opened web links in the browser on a plain click. Ctrl+Click jumps to the heading for a `#` link and opens web, `mailto:` and `tel:` links in the system browser. Any other link, such as `other.md` or `javascript:`, is ignored. Listed in the Keyboard Shortcuts dialog as "Follow link".
- The user guide no longer mentions a floating toolbar for links, which never existed.

### Implementation notes

- The cause of both issues was TipTap's Link giving every anchor `target="_blank"`, combined with `tauri-plugin-shell`'s injected `<body>` click listener, which sends any `_blank` http(s) link to the system browser. A bare `#fragment` resolves to an `http://tauri.localhost/…` URL, so it qualified. The new `LinkNavigation` extension in `Editor.tsx` handles every link click on the editor's own DOM and calls `stopPropagation()`, so the listener never sees one. `preventDefault()` alone does not stop that listener. External links go through a new `openExternalUrl()` in `src/lib/tauri.ts`, which uses the shell plugin's `open` (covered by the existing `shell:allow-open` permission) in the desktop app and `window.open` on the web.
- The web build has no such listener, so the bug does not reproduce in a plain browser. The browser check below injected a copy of the plugin's listener.

### Verification

`npm test` passes 251 tests, including new `headingAnchors` and `tauri` suites. They cover slugs, duplicate headings, fragment decoding, fallback matching, `#` links surviving open and save, jumping to a heading in a real TipTap editor, and which URL schemes are opened. `npm run build` passes and `npm run lint` shows no new warnings. Checked by driving the app in Chromium with a copy of the shell plugin's listener injected:

- before the fix, clicking a `#` link handed `http://localhost:5173/#…` to that listener
- after it, a plain click on any link opens nothing and typing edits the link text
- Ctrl+Click and Cmd+Click jump to the right heading, and Ctrl+Click on an https link opens it

## [1.9.0]

### Added

- **Review comments, stored as [CriticMarkup](https://github.com/CriticMarkup/CriticMarkup-toolkit)** (#48, #50). A comment on selected text is saved as `{==text==}{>>comment<<}`, and a comment added with nothing selected as a lone `{>>comment<<}` shown as a 💬 marker. A lone `{==highlight==}` from another CriticMarkup tool is displayed and saved back unchanged, but the UI never creates one — highlighting without a comment was out of scope for the issue, as were additions, deletions, substitutions and a comments side panel. Comments stay readable in any text editor and in the markdown preview. In the editor they are a `criticHighlight` mark and a `criticComment` inline atom node (`src/extensions/critic-markup/`).
- **A comment bubble for reading, adding and editing comments.** It appears on hover, or when the caret is inside a comment, so comments can be read without a mouse. It has ✎ edit and 🗑 delete buttons, and new comments are typed straight into it, in a wrapping, auto-growing text area. Enter saves, Esc cancels, and line breaks aren't accepted because CriticMarkup advises against newlines inside its tags; a hint under the box says so. Also available through `Ctrl+Shift+M` and toolbar buttons. The Add button's tooltip explains why it is disabled when it is — the selection spans blocks, is in code, overlaps an existing comment, and so on — computed by the same function that disables it, so the two can't drift apart.
- **Optional author and timestamp prefix** — `[Joe Bloggs 2026-09-21 14:00]: comment`. It is written only when a comment is created, and editing keeps it exactly as written. Any other metadata format in a file is shown as plain comment text. The author defaults to the OS display name in the desktop app, through a new `get_user_real_name` Tauri command using the `whoami` crate; the web build has no OS name, so it uses the override or no author.
- **An Options › Preferences dialog** (`Ctrl+,`), holding the comment settings: include author, include timestamp, and an author-name override. Moving the existing Options-menu toggles into it is left for later.

### Changed

- `Ctrl+M` (toggle preview) now ignores Shift, so `Ctrl+Shift+M` reaches the editor. `Ctrl+Alt+M`, the Word/Google Docs convention, was avoided because it is AltGr+M on German and other layouts, which types characters such as µ.
- CriticMarkup typed as literal text is saved backslash-escaped, `{` before `==`/`>>` and `=` before `=}`, so it can't turn into a comment on reload. Backticks and backslashes inside a comment written by another tool are escaped the first time the file is saved, and are stable after that.
- Added `@floating-ui/dom` as a direct dependency. It was already installed as a TipTap dependency.

### Implementation notes

These are recorded because each one broke silently during development, with build, tests and lint green. They are documented in more detail in `CLAUDE.md`.

- The comment mark has `priority: 1100`, above Link's 1000, so it is always the outermost mark. Otherwise a comment spanning bold or link text serializes as several `<mark>` elements and exports as several comments.
- The 💬 node renders a literal text child. Turndown's blank rule drops elements with no text *before* any custom rule is consulted, which would silently lose the comment on save.
- Comment bodies are plain text in an HTML attribute, so `turndownEscape` never sees them. `escapeCriticComment()` escapes `\`, `` ` `` and `<<}` itself. Escaping the backtick matters: a code span forming inside a body made its backslashes double on every round-trip.
- The bubble is positioned against the comment's DOM element, never a rect snapshot. An early version positioned hover and caret popups from different rects, which made the bubble jump between them and detach when the text scrolled. The bubble is also `visibility: hidden` until its first position is computed, and a hidden input silently refuses focus, so `autoFocus` did nothing; the text area is focused once the bubble is placed.

### Dependencies

- Merged 1 Dependabot update since v1.8.5:
  - Bump the development-minor-patch group with 3 updates (#49): `eslint-plugin-react-refresh` 0.5.6 → 0.5.7, `jsdom` 30.0.1 → 30.1.0, `vitest` 5.0.0 → 5.0.1

### Verification

`npm test` passes 240 tests, including a new `CriticMarkup` suite. It covers import, byte-stable round-trips, escaping, comments in tables, headings, lists and blockquotes, and metadata parsing. `npm run lint`, `npm run build` and `cargo check` are clean. Checked by hand in a browser and in the Tauri desktop app on Windows, since none of the UI is observable to CI:

- adding, editing and deleting comments, including cancelling by clicking away
- hover and caret bubbles anchoring identically
- flipping near the bottom of the pane and hiding once the text scrolls out of view
- a very long comment scrolling inside the bubble
- the Preferences prefix and detection of the OS name
- light and dark themes
- the disabled-button tooltips

## [1.8.5]

### Changed

- Merged 5 Dependabot dependency updates since v1.8.4:
  - Bump lodash-es from 4.17.23 to 4.18.1 with override. (#47)
  - Bump vite from 8.2.2 to 8.3.0 in the vite group across 1 directory (#43)
  - Bump the react group across 1 directory with 4 updates (#42)
  - Bump typescript-eslint in the development-minor-patch group (#44)
  - Bump mermaid from 11.17.2 to 12.0.0 (#45)

### Other changes

- Update package.json (#46)

## [1.8.4]

### Changed

- Merged 5 Dependabot dependency updates since v1.8.3:
  - Bump the tauri group across 1 directory with 4 updates (#38)
  - Bump @types/react-dom in the react group across 1 directory (#39)
  - Bump the tiptap group with 13 updates (#37)
  - Bump the development-minor-patch group with 4 updates (#40)
  - Bump vitest from 4.1.11 to 5.0.0 (#41)

## [1.8.3]

### Changed

- Merged 5 Dependabot dependency updates since v1.8.2:
  - Bump @types/react-dom from 19.2.4 to 19.2.5 in the react group (#32)
  - Bump @vitejs/plugin-react from 6.1.0 to 6.1.1 in the vite group (#33)
  - Bump eslint-plugin-react-refresh in the development-minor-patch group (#35)
  - Bump mermaid from 11.17.0 to 11.17.2 in the production-minor-patch group (#34)
  - Bump the tiptap group with 13 updates (#31)

## [1.8.2]

### Changed

- Merged 4 Dependabot dependency updates since v1.8.1:
  - Bump the development-minor-patch group across 1 directory with 2 updates (#29)
  - Bump mermaid from 11.16.1 to 11.17.0 in the production-minor-patch group (#27)
  - Bump the vite group with 2 updates (#26)
  - Bump the tiptap group with 13 updates (#25)

### Other changes

- Add a one-click version-bump-and-release workflow (#30)
- Fix release asset labels, prefer the draft release, and document the manual-release trap (#24)
- Record that WebView2 print is confirmed working (#23)

## [1.8.1]

### Fixed

- **File > Print and Ctrl+P printed a single clipped page of the app window instead of the document.** Both were a bare `window.print()`, so the browser printed the live app DOM — and that DOM cannot reflow for print: the shell is a fixed-height flex tree with `overflow-hidden` at three levels wrapping the editor's `overflow-y-auto` scroll viewport, so only the first viewport-height slice ever reached the printer. Printing now builds a standalone document from `editor.getHTML()` and prints it in a hidden iframe (`src/lib/print.ts`), leaving the app DOM untouched, and a single `handlePrint` in `App.tsx` serves both entry points. Overriding the layout in `@media print` instead was considered and rejected as too fragile — there is no visual-regression tooling here, so a broken override would be invisible to CI.
- **The print iframe stole keyboard focus and never gave it back.** `frameWindow.focus()` is needed so the print targets the iframe rather than the parent, but without restoring focus afterwards the editor went deaf after a single print: typing and every shortcut, Ctrl+P included, landed in the hidden frame. `printHtmlDocument()` now captures `document.activeElement` up front and restores it both after `print()` returns and on iframe removal. Build, tests and lint stayed green the whole time this was broken; only driving two consecutive prints in a real browser surfaced it.
- **Mermaid diagrams printed as source rather than as diagrams.** `Mermaid.ts`'s `renderHTML` emits `<pre><code class="language-mermaid">`, so `getHTML()` yields the fence content rather than the rendered figure. `inlineMermaidDiagrams()` re-renders each block and substitutes the SVG, forcing `theme: 'default'` because `MermaidNodeView` renders at the *app* theme and a diagram authored in dark mode would otherwise print dark-on-white. A failed render leaves the original `<pre>` in place so the source still prints. Note that "Export as HTML" deliberately does not do this substitution — exported files still contain the source fence.

### Changed

- The print stylesheet is now the one already inside `wrapHtmlDocument()` (`src/lib/markdown.ts`), so print output and "Export as HTML" cannot drift apart. That is also why the new `@page`, `break-inside` and `table-header-group` rules live there rather than in `index.css`, which is not loaded inside the iframe.
- The `@media print` block in `src/index.css` was largely dead code — three of its five hide-selectors matched nothing in the current DOM — and is replaced by a small fallback for the window being printed by some route other than File > Print. It hides the app shell and shows a "use File > Print" line rather than emitting a clipped screenshot.

Verified in a real browser across 28 checks: all 45 headings of a long document present across four A4 pages where only 21.3% of it was visible on screen, no app chrome leaking into the output, diagrams inlined as light SVG with the app in dark mode, both entry points reaching the same handler, typing still working after printing, and the page-break rules confirmed under print media emulation. Printing inside the Tauri WebView2 build cannot be automated — a native print dialog is not scriptable — and was confirmed by hand shortly after this release.

## [1.8.0]

### Changed

- Migrated to Tailwind CSS v4 (4.3.3, up from 3.4.19) — the work deferred in 1.7.0 and tracked as issue #20. v4 replaces the JS-config + `@tailwind`-directive model with a CSS-first one, so `tailwind.config.js` is gone and its entire contents now live in the first ~35 lines of `src/index.css`: `@import "tailwindcss"` in place of the three `@tailwind` directives, and `@custom-variant dark` in place of `darkMode: 'class'`. Started from `npx @tailwindcss/upgrade` and reviewed every hunk rather than trusting it — see the two blind spots under Fixed.
- Tailwind is now wired as a Vite plugin (`@tailwindcss/vite`) rather than through PostCSS. `postcss.config.js` is deleted, and `postcss` and `autoprefixer` are no longer dependencies at all — v4 does its own vendor prefixing via Lightning CSS. Net effect on the toolchain is three devDependencies and one config file removed, and a production build that drops from ~5.3s to ~0.9s.
- **Dark mode needed re-declaring, and would have failed silently if missed.** v3's `darkMode: 'class'` has no v4 config equivalent; `src/index.css` now carries `@custom-variant dark (&:is(.dark *))` to match the `dark`/`light` class that `useTheme.ts` puts on `<html>`. Without it all ~318 `dark:` utilities fall back to `prefers-color-scheme` and the theme menu stops doing anything — with the build, lint, tsc and all 200 tests still green. `:is()` rather than `:where()` is deliberate: it contributes `.dark`'s specificity, reproducing what v3's generated `.dark .dark\:foo` selector did, so dark still outranks light.
- Renamed the utilities v4 moved down a step on the scale: `rounded` → `rounded-sm` (65 sites), `rounded-sm` → `rounded-xs` (2), `shadow-sm` → `shadow-xs` (3), `backdrop-blur-sm` → `backdrop-blur-xs` (1), `outline-none` → `outline-hidden` (5), plus `flex-shrink-0` → `shrink-0` (18). Verified against the emitted CSS that each rename preserves its v3 value rather than assuming the mapping — e.g. `.search-match` still resolves to a 2px radius via `--radius-xs`, matching v3's `rounded-sm`. The `flex-shrink-0` and bare `rounded` renames turned out to be cosmetic: v4 still ships both as legacy aliases with byte-identical output, which is why the official codemod leaves them alone. They were renamed anyway so the codebase follows one convention.
- Restored two v4 Preflight defaults rather than adopting them, in a small `@layer base` block. The load-bearing one is `cursor: pointer` on buttons: v4 changed the default to `cursor: default`, and this app has 58 `<button>` elements against only 8 explicit `cursor-pointer` classes, so adopting the new default would have quietly dropped the pointer cursor from the entire toolbar, every menu and every dialog. The placeholder colour is pinned back to `gray-400` for the same reason. v4's *third* Preflight change — default border colour moving from `gray-200` to `currentColor` — was deliberately **not** shimmed: an exhaustive check found every border-width utility already paired with an explicit `border-<colour>`, so the global shim the upgrade tool generates was removed instead of kept.
- Dropped `prose prose-sm sm:prose lg:prose-lg` from the editor's `editorProps`. `@tailwindcss/typography` was never a dependency, so these four classes generated nothing in v3 either — editor typography is hand-rolled in the `.ProseMirror` rules in `index.css`. Removing dead classes, not a behaviour change.
- Two consequences of v4 worth recording because neither is fixable from this repo. v4 ships its colour palette in OKLCH instead of hex, so every colour in the UI shifts imperceptibly, and slightly more visibly on wide-gamut displays — this is inherent to v4, not a regression. And v4 raises the browser floor to Safari 16.4+ / Chrome 111+ / Firefox 128+: harmless for the Windows desktop build (WebView2 is evergreen Chromium) but it effectively raises the macOS floor to 13.3+, since WKWebView tracks the OS, and needs WebKitGTK 2.40+ on Linux.

### Fixed

- **The expanded Mermaid diagram viewer rendered the diagram at the wrong size — small and blurry for any diagram bigger than the dialog.** Reported during this release and initially assumed to be migration fallout; it is not. Confirmed pre-existing by running the same instrumented repro against the pre-migration commit, which produced a byte-identical DOM mutation log and the same wrong geometry, so it has been broken since the viewer was written and is unrelated to Tailwind. Root cause: Mermaid emits `width="100%"` plus an inline `max-width` and no height, so the viewer gave the injected `<svg>` its intrinsic pixel size in a `useLayoutEffect`. That worked once and was then thrown away — the dialog re-renders, React re-injects the markup through `dangerouslySetInnerHTML`, and the replacement `<svg>` arrives without the attributes the effect had written, while the effect's dependencies (`[svg, contentSize, fitToView]`) were unchanged so it never re-ran. The un-sized element fell back to the browser's 300px default width for a replaced element, which the zoom transform then scaled — magnifying and cropping a small diagram, shrinking a large one into a blurry thumbnail. The intrinsic size now travels as `--diagram-w`/`--diagram-h` custom properties on the stage's React `style` prop, applied to the svg by a rule in `index.css`; React re-applies `style` on every render, so a re-injection cannot discard it. No attribute removal is needed either, since a stylesheet rule already outranks the `width="100%"` presentation attribute. Verified in a browser: the rendered diagram is now exactly its intrinsic size times the zoom scale, and holds that size across the re-injections that previously broke it.
- **`npx @tailwindcss/upgrade` silently skips class names that aren't in a `className` attribute.** It migrated 10 of the 17 affected files and left four bare `rounded` sites untouched in `MenuBar.tsx`, `FloatingImageToolbar.tsx`, `FloatingTableToolbar.tsx` and `TableCreationDialog.tsx` — all of them inside template literals or multi-line class strings. Because v4 keeps bare `rounded` as a legacy alias resolving to the same `.25rem`, these compiled cleanly and rendered correctly, so nothing would have surfaced them; the codebase would just have been left half-converted. Found by grepping for the old names after the codemod rather than reading its file list.
- `.github/dependabot.yml`: added a `tailwind` group (`tailwindcss` + `@tailwindcss/*`), since the two are published from the same repo at the same version and are checked against each other at build time — the same lockstep hazard as the existing `tiptap`, `tauri`, `react` and `vite` groups. Tailwind is a devDependency, so it also had to be excluded from `development-minor-patch` or that group would have swallowed it first and the new group would never have applied. The major-version ignore is kept rather than removed, now pointing forward instead of deferring this migration, and extended to `@tailwindcss/*`.
- `eslint.config.js` had an override block listing `postcss.config.js` and `tailwind.config.js`, both of which no longer exist (and were already redundant against the `*.config.js` glob beside them). Trimmed.
- Corrected the tech-stack tables in `README.md` and `CLAUDE.md`, which still said React 18 — stale since the React 19 bump in 1.7.0.

Verified in a real browser across both themes, since none of the above is observable to CI: `npm run lint`, `npm test` (200 tests) and `npm run build` all stayed green from the first commit of this migration to the last, and would have stayed green with dark mode completely broken. 56 assertions were driven against the running app reading computed styles — button cursors, every renamed radius and shadow against its v3 value, the `dark:` variant actually applying and still outranking light, border colours resolving to real colours rather than the inherited text colour, `space-y-*` under v4's new `:not(:last-child)` selector, and the `@media print` block — over the toolbar, app menus and submenus, tab bar, search bar and its match highlighting, document map, all four dialogs, the floating table toolbar (confirming no return of the 1.6.0 infinite-render crash), and Mermaid rendering. Zero console errors or warnings on every surface.

## [1.7.0]

### Changed

- Updated to React 19 (`react`, `react-dom`, `@types/react`, `@types/react-dom`, all bumped together) and Vite 8 (`vite`, `@vitejs/plugin-react`, bumped together — `@vitejs/plugin-react@6` requires `vite@^8`). Both pairs failed to install individually via Dependabot due to peer-dependency conflicts against their unbumped counterpart. Verified in a real browser after the combined bump: editing, undo/redo, search, and Mermaid rendering all work with zero console errors or warnings.
- Merged a routine `typescript` 5.6→5.9 minor bump.
- Vite 8 now uses Rolldown (a Rust-based bundler) instead of Rollup by default. Transparent here — `vite.config.ts` has no `rollupOptions` to migrate — but worth knowing if build-time config is ever added.

### Fixed

- `.github/dependabot.yml`: added an explicit `react` group covering `react`/`react-dom`/`@types/react`/`@types/react-dom`. Dependabot's own automatic grouping had proposed `react-dom` and `@types/react-dom` together in one PR while leaving `react`/`@types/react` out of that same group — a real gap in its family-detection, not a version-arithmetic mistake — which broke `npm ci` outright. Also added a `vite` group for the same peer-coordination reason as the ESLint toolchain in 1.6.1.

### Deferred

- Closed a Dependabot PR bumping `tailwindcss` 3→4 and added a dependabot.yml ignore rule for it. Unlike the other bumps this session, it is not a peer-dependency conflict — `npm ci` succeeds, but the build fails inside Tailwind's PostCSS processing. Tailwind v4 replaced the JS-config + `@tailwind`-directive architecture with a CSS-first one (`@import "tailwindcss"` + `@theme`), which needs a real migration (new `@tailwindcss/postcss` package, `tailwind.config.js` rewritten as CSS, every utility class in the app re-checked) — scoped as dedicated future work, the same shape as the TipTap v3 migration in 1.6.0.

## [1.6.1]

### Fixed

- **Undo/redo toolbar buttons could show stale enabled/disabled state.** `canUndo`/`canRedo` were read directly from a ref during render, which doesn't trigger a re-render when the underlying value changes (e.g. via a keyboard-shortcut-triggered undo, which bypasses the toolbar's own click handler). Now tracked as real state, updated via a transaction listener. Verified in a real browser across both the toolbar-click and keyboard-shortcut paths.
- **A table cell containing a literal `|` no longer corrupts the table's column count on import.** The row splitter did a plain `.split('|')` with no awareness of escaped pipes, so `\|` (produced correctly by the exporter) was never honored on the way back in — it silently split one cell into two. Found while investigating a CodeQL alert on the exporter's escaping, which turned out to point at a symptom rather than the actual bug; the exporter itself needed no change (Turndown already escapes literal backslashes, which is what made a full round trip work once the importer was fixed). Two regression tests added.
- Removed a small amount of dead code in `Editor.tsx` (an unused `setContent` method attached to the TipTap editor instance, superseded by direct `editor.commands.setContent()` calls elsewhere) that a stricter new lint rule correctly flagged as mutating a hook's return value.

### Changed

- Updated the ESLint/TypeScript-adjacent toolchain: `eslint` 9→10, `@eslint/js` 9→10, `eslint-plugin-react-hooks` 5→7.1 (bumped together — each alone fails to install due to peer-dependency conflicts against the others). `typescript` and `typescript-eslint` are intentionally **not** bumped: `typescript-eslint` has no published version (including its canary channel) supporting TypeScript 7 yet.
- `eslint-plugin-react-hooks` v7 bundles React Compiler-powered lint rules new to this project. Of the 21 findings this surfaced: one was a genuine declaration-order fix (mechanical, in `App.tsx`), one was the undo/redo staleness above (a real fix), and the remainder were the standard "sync/reset state from a changed dependency" effect pattern — safe and idiomatic, and only flagged because this project has no React Compiler enabled to actually benefit from the stricter analysis. Those are suppressed with an inline reason at each site rather than restructured.
- Hardened `.github/dependabot.yml` again: the ESLint/TypeScript toolchain turned out to have the identical cross-package coordination hazard as `@tiptap/*`/`@tauri-apps/*` (see 1.6.0) — a major in any one package broke `npm ci` against the others. Added the same `ignore` treatment for major-version bumps to this group.
- Added `permissions: contents: read` to `ci.yml` and `desktop.yml` (flagged by CodeQL; `release.yml` already had an explicit block).

### Security

- Dismissed two CodeQL `js/xss-through-dom` alerts on `ImageDialog.tsx` as false positives: both are React `<img src>` bindings, which are a URL-fetch sink, not an HTML-interpretation sink — the rule's actual concern (DOM text reinterpreted as HTML) doesn't apply to that binding.

## [1.6.0]

### Changed

- Migrated to TipTap v3 (`@tiptap/*` 3.30.1, up from 2.x). Deliberately behavior-preserving: StarterKit's newly-bundled `link`, `underline`, and `trailingNode` extensions are disabled to keep saved markdown output unchanged, and `shouldRerenderOnTransaction: true` is set to keep toolbar highlighting and the search match counter updating live (v3 changed that default).
- Reconciled the Tauri Rust crate family with the JS package family after they drifted apart across two independent Dependabot PRs (`tauri` 2.11.5, `@tauri-apps/api` 2.11.1 and matching plugins) — Tauri hard-fails the build if these disagree on major.minor.

### Fixed

- **Search & Replace was silently broken by the TipTap v3 migration in a way no automated check caught.** A typed search term never reached the matching logic, so the match count stayed at zero regardless of what was searched. Root cause: `this` is not a consistent object identity across this TipTap version's extension lifecycle methods (`addCommands()` vs. `addProseMirrorPlugins()`), so mutating `extension.options.searchTerm` in one and reading it in the other silently read two different objects — confirmed by direct identity comparison in a debug session, not by inference. The extension's state now lives entirely in the plugin's own ProseMirror state, driven by `tr.setMeta()`, which has no such identity hazard.
- **A real "Maximum update depth exceeded" crash** that made the app fail to render entirely, caused by the interaction between `shouldRerenderOnTransaction: true` and the floating image/table toolbars: their `shouldShow`/`options` props were inline JSX literals, given a fresh reference every render, which fed into a TipTap-internal effect that dispatches a transaction whenever those references change — an infinite loop. Fixed by memoizing both props.

Neither of the two fixes above was caught by `npm run build`, `npm run lint`, or `npm test` — all stayed green throughout. Both were found only by actually driving the app in a real browser. See `CLAUDE.md`'s "Editor Configuration" section for the full mechanism of each, kept there for the next person extending this codebase.

### Security

- Same `tauri`/`serde_with` versions above also clear two open Dependabot security alerts (`tauri`'s origin-confusion IPC issue, first patched at 2.11.1; `serde_with`'s panic-on-empty-map issue, fixed at 3.21.0). A `rand` advisory also cleared as a side effect — the vulnerable version dropped out of the dependency graph entirely during a full `cargo update`. A fourth alert (`glib`, needs 0.20.0) remains open — it is pulled in transitively through the whole gtk-rs stack, which is pinned to its 0.18 generation until an upstream `wry`/`tauri` release upgrades it; not fixable from this repo.

## [1.5.2]

First public release.

### Security

- Updated dependencies to clear all known advisories in the shipped dependency tree (`mermaid` 11.16.1, `dompurify` 3.4.13, and transitive `linkify-it` / `markdown-it` fixes). `npm audit` now reports no vulnerabilities.
- Removed the unused `sharp` development dependency, which carried inherited `libvips` advisories and was not referenced anywhere in the codebase.

### Added

- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, and this changelog.
- ESLint flat config (`eslint.config.js`). `npm run lint` was previously advertised but had no configuration file and could not run.
- GitHub Actions CI running lint, tests, and build on Node 22 and 24.
- **Desktop Build** workflow compiling and bundling the Tauri app on Windows, macOS and Linux, with installers attached to each run as artifacts.
- **Release** workflow that builds all three platforms on a `v*` tag and attaches the installers to a draft GitHub Release for manual review before publishing.
- Screenshot in the README, and a "Known Limitations" section documenting that relative/local image paths do not render in-editor and that setext headings are unsupported.
- "Platform Support" section in the README stating that the desktop build has only been built and tested on Windows, with the platform caveats identified from the code — most notably that opening a file from Finder will not work on macOS, since the startup path is read from `std::env::args()` rather than from `RunEvent::Opened`.
- `license = "MIT"` in `src-tauri/Cargo.toml`, and a real value for `authors`, which was still the `tauri init` placeholder `["you"]`.

### Fixed

- Corrected the parser documentation in `CLAUDE.md`, which stated that nested blockquotes were unsupported. They have in fact worked since blockquote content became recursively parsed; `> outer` / `>> inner` nests correctly.

### Changed

- Documented the intent of the empty `localStorage` catch blocks and of the deliberate `no-control-regex` / `no-this-alias` cases, rather than relaxing the lint rules.

## [1.5.1]

### Fixed

- Escape key not exiting Mermaid source mode.

## [1.5.0]

### Added

- Expanded Mermaid diagram viewer (**⤢ Expand** / `Alt+Enter`) with mouse-wheel zoom and click-drag pan.

## [1.4.3]

### Fixed

- Unneeded escaping of numbered headings on save.

## [1.4.2]

### Fixed

- Inline code and code blocks not resizing on zoom.

## [1.4.1]

### Fixed

- Escape handling on import, and Markdown/HTML round-trips.

## [1.4.0]

### Added

- Mermaid diagram support — ` ```mermaid ` blocks render as diagrams with a per-block source toggle.

## [1.3.0]

Initial development release.
