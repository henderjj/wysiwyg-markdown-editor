# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.2]

First public release.

### Security

- Updated dependencies to clear all known advisories in the shipped dependency tree (`mermaid` 11.16.1, `dompurify` 3.4.13, and transitive `linkify-it` / `markdown-it` fixes). `npm audit` now reports no vulnerabilities.
- Removed the unused `sharp` development dependency, which carried inherited `libvips` advisories and was not referenced anywhere in the codebase.

### Added

- `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, and this changelog.
- ESLint flat config (`eslint.config.js`). `npm run lint` was previously advertised but had no configuration file and could not run.
- GitHub Actions CI running lint, tests, and build on Node 20 and 22.
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
