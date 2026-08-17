# Security Policy

## Reporting a Vulnerability

Please report security issues privately using GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository, rather than opening a public issue.

Please include reproduction steps and the affected version. This is a personal open-source project maintained on a best-effort basis, so response times are not guaranteed.

## Threat Model

The editor opens and renders Markdown from arbitrary files. Untrusted Markdown is therefore the primary input to consider.

Existing mitigations:

- **Link schemes** — TipTap's URI allowlist strips `javascript:` and other non-permitted schemes when content is loaded, so a link in an opened file cannot execute script.
- **Mermaid** — initialized with `securityLevel: 'strict'`, which disables HTML labels and script execution inside diagrams.
- **No backend** — all documents live in browser `localStorage` or on the local filesystem. Nothing is transmitted anywhere.

## Known Design Decisions

Two settings are deliberate and are called out here so they are not mistaken for oversights:

### `"csp": null` in `src-tauri/tauri.conf.json`

Content Security Policy is not currently enabled for the desktop build. Markdown documents can reference remote images by URL, and a restrictive CSP would need a considered allowlist to avoid breaking that. Tightening this is a welcome contribution — see the note below.

### `fs:scope` of `"**"` in `src-tauri/capabilities/default.json`

The desktop app is a general-purpose file editor, so it requests read/write access across the filesystem rather than a fixed directory. Access is still gated by the user's own choices: files are only opened and saved through native file dialogs, which the user drives.

Both decisions widen the blast radius if another vulnerability were found. If you are deploying this in a hardened environment, narrow the `fs:scope` entries to the directories you actually need and enable a CSP appropriate to your content sources.

## Dependencies

Runtime dependencies are audited with `npm audit`. Run `npm audit --omit=dev` to check the shipped dependency tree.
