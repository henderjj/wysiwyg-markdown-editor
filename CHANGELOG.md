# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
