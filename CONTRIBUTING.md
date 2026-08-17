# Contributing

Contributions are welcome. This is a personal open-source project maintained on a best-effort basis, so please open an issue to discuss anything substantial before writing code.

## Getting Set Up

Requires Node.js 22 or later. Node 20 reached end of life in April 2026 and is no longer tested.

```bash
npm install
npm run dev          # http://localhost:5173
```

For the desktop app you also need the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust toolchain):

```bash
npm run tauri:dev
```

## Before Opening a Pull Request

CI runs these three commands on Node 22 and 24. Run them locally first:

```bash
npm run lint
npm test
npm run build
```

If your change touches anything under `src-tauri/`, the **Desktop Build** workflow will compile and bundle it on Windows, macOS and Linux automatically. Please still run `npm run tauri:build` locally where you can, and say which OS you verified it on — CI proves it compiles, not that it works.

## Platform Support

The desktop app compiles and bundles on all three platforms in CI, but has so far only been **run** on Windows. The web build is platform-independent and is exercised by CI on Linux.

If you are on macOS or Linux, a build report is genuinely useful — please open an issue whether it works or not. The README lists the specific caveats identified from the code, the most concrete being that opening a file from Finder will not currently work on macOS, because the startup path is read from `std::env::args()` rather than from the `RunEvent::Opened` event that macOS uses.

## Architecture Notes

`CLAUDE.md` in the repository root documents the architecture in detail — data flow, the state model, parser behavior, and the editor extension setup. It is worth reading before changing anything in `src/lib/` or `src/extensions/`.

The short version:

- **Import**: `src/lib/markdownParser.ts` — a custom line-by-line parser converts Markdown to HTML.
- **Export**: `src/lib/markdown.ts` — Turndown converts HTML back to Markdown with custom GFM rules.
- **State**: all application state lives in `src/App.tsx`. There is no backend.

## Round-Trip Fidelity

The most important property of this editor is that `Markdown → editor → Markdown` does not corrupt the document. Any change to the parser or the Turndown rules must keep the `src/lib/markdownRoundtrip.test.ts` suite green, and new syntax handling should come with a round-trip test.

Escape handling in particular is subtle — the escape set, the regex guards, and the export behavior are deliberately kept aligned, and the `escape handling` suite pins that alignment. Read the "Markdown Parser Specifics" section of `CLAUDE.md` before touching it.

## Style

There is no separate formatter configured. Match the conventions of the surrounding code: the existing files carry fairly dense explanatory comments where behavior is non-obvious, and that is worth continuing.

## Accessibility

The editor must remain usable without a mouse and must not trap keyboard focus (WCAG 2.1.2). If you add an extension that intercepts Tab or Escape, make sure keyboard-only users can still move focus out of the editor. `CLAUDE.md` has a table of the current Tab behavior per context.
