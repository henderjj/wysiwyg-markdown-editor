# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
