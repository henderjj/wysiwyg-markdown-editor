# WYSIWYG Markdown Editor - Project Proposal

> **Historical document.** This is the original design proposal, kept for context on why the project is built the way it is. It is not a roadmap and is not maintained.
>
> Phases 1 and 2 are implemented. **Phase 3 is not** — there is no cloud sync, authentication, collaboration, or GitHub integration, and none is currently planned. The application has no backend of any kind; documents live in browser `localStorage` or on the local filesystem.
>
> Some technical choices also changed during implementation. Most notably, Markdown import is handled by a custom parser rather than `remark-parse`, and export uses Turndown rather than `prosemirror-markdown`. See `README.md` for what the project actually does today, and `CLAUDE.md` for how it is built.

## Overview

A modern web application that provides a What-You-See-Is-What-You-Get (WYSIWYG) editing experience while producing clean, portable Markdown output. Users edit content visually—applying formatting, inserting images, creating tables—while the underlying document remains pure Markdown.

## Problem Statement

Markdown is excellent for version control, portability, and developer documentation. However, its syntax creates friction for:
- Non-technical users unfamiliar with Markdown syntax
- Quick note-taking where syntax interrupts flow
- Complex formatting (tables, nested lists) that's error-prone to write manually

Existing solutions either produce HTML (not Markdown) or show a split-pane editor that still requires syntax knowledge.

## Core Value Proposition

**Edit visually. Export Markdown.**

Users interact with a familiar rich-text interface while the application maintains a Markdown document behind the scenes.

## Markdown Flavor

**GitHub Flavored Markdown (GFM)** - The editor will support the full GFM specification, which extends CommonMark with:

- **Tables** - Pipe-based table syntax with column alignment
- **Task lists** - Checkbox items (`- [ ]` and `- [x]`)
- **Strikethrough** - Text wrapped in `~~tildes~~`
- **Autolinks** - Automatic URL and email linking
- **Fenced code blocks** - With language identifiers for syntax highlighting

This choice ensures compatibility with GitHub, GitLab, and most modern Markdown renderers while providing the rich formatting options users expect.

## Key Features

### MVP (Phase 1)

| Feature | Description |
|---------|-------------|
| Rich text editing | Bold, italic, strikethrough, inline code |
| Headings | H1-H6 with visual hierarchy |
| Lists | Ordered, unordered, and task lists with nesting |
| Links | Visual link insertion and editing |
| Code blocks | Syntax-highlighted fenced code blocks with language selection |
| Images | Drag-and-drop image insertion with alt text |
| Blockquotes | Visual quote formatting |
| Live Markdown preview | Optional side panel showing raw Markdown |
| Export | Copy as Markdown, download as .md file |
| Import | Open existing Markdown files for editing |

### Phase 2

| Feature | Description |
|---------|-------------|
| Tables | Visual table editor with add/remove rows/columns |
| Keyboard shortcuts | Standard formatting shortcuts (Ctrl+B, etc.) |
| Markdown shortcuts | Type `**` to trigger bold, `#` for headings |
| Dark mode | System-aware theme switching |
| Local storage | Auto-save documents in browser |
| Multiple documents | Tab-based document management |

### Phase 3

| Feature | Description |
|---------|-------------|
| Azure cloud sync | Document storage via Azure Blob Storage |
| Azure AD B2C auth | User authentication for cloud features |
| Collaboration | Real-time collaborative editing |
| Custom CSS | Theming for preview/export |
| GitHub integration | Direct commit to repositories |
| Frontmatter editor | YAML metadata editing for static sites |

## Technical Architecture

### Frontend Stack

- **Framework**: React 18+ with TypeScript
- **Editor Engine**: ProseMirror or TipTap (ProseMirror-based)
  - Mature, extensible, document-model based
  - Strong Markdown serialization support
- **State Management**: Zustand (lightweight) or built-in React state
- **Styling**: Tailwind CSS for rapid UI development
- **Build Tool**: Vite

### Why ProseMirror/TipTap?

1. **Schema-based**: Define exactly which Markdown elements are supported
2. **Bidirectional**: Convert Markdown → Editor State → Markdown losslessly
3. **Extensible**: Add custom nodes for specific Markdown flavors
4. **Battle-tested**: Powers Notion, GitLab, and many production editors

### Data Flow

```
User Input → ProseMirror Document Model → Markdown Serializer → Output
     ↑                                              ↓
     └──────── Markdown Parser ←────────────────────┘
```

### Key Libraries

| Purpose | Library |
|---------|---------|
| Editor core | `@tiptap/core`, `@tiptap/starter-kit` |
| Markdown parsing | `remark-parse`, `mdast-util-from-markdown` |
| Markdown serialization | `prosemirror-markdown` or custom serializer |
| Syntax highlighting | `highlight.js` or `shiki` |
| File handling | Native File System Access API with fallbacks |

## Project Structure

```
src/
├── components/
│   ├── Editor/
│   │   ├── Editor.tsx          # Main editor component
│   │   ├── MenuBar.tsx         # Formatting toolbar
│   │   ├── BubbleMenu.tsx      # Selection-based menu
│   │   └── extensions/         # Custom TipTap extensions
│   ├── Preview/
│   │   └── MarkdownPreview.tsx # Raw markdown display
│   └── Layout/
│       ├── Header.tsx
│       └── Sidebar.tsx
├── lib/
│   ├── markdown/
│   │   ├── parser.ts           # MD → Editor
│   │   └── serializer.ts       # Editor → MD
│   └── storage.ts              # Local persistence
├── hooks/
│   ├── useDocument.ts
│   └── useExport.ts
├── styles/
│   └── editor.css
└── App.tsx
```

## User Interface Concept

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  File ▾   Edit ▾   View ▾              [👤] [⚙️]    │
├─────────────────────────────────────────────────────────────┤
│  B  I  S  Code │ H1 H2 H3 │ • ─ ☐ │ "" </> 🔗 🖼️ │ ⋮      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  # My Document                                              │
│                                                             │
│  This is a **bold** statement with some `inline code`.      │
│                                                             │
│  ## Section One                                             │
│                                                             │
│  - First item                                               │
│  - Second item                                              │
│    - Nested item                                            │
│                                                             │
│  > This is a blockquote that spans                          │
│  > multiple lines.                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Technical Challenges & Solutions

### 1. Lossless Round-Tripping

**Challenge**: Converting Markdown → Editor → Markdown must preserve original formatting choices (e.g., `*italic*` vs `_italic_`).

**Solution**: Store original syntax preferences in node attributes; use custom serializer that respects these preferences.

### 2. Table Editing

**Challenge**: Markdown tables are notoriously fiddly; maintaining alignment while editing is complex.

**Solution**: Use TipTap's table extension with custom serializer that outputs GFM-compliant tables with proper alignment.

### 3. Image Handling

**Challenge**: Markdown references images by URL; users expect drag-and-drop.

**Solution**:
- MVP: Convert to base64 data URLs (simple, portable)
- Later: Integrate with image hosting APIs or local file references

### 4. Performance with Large Documents

**Challenge**: Rich editors can lag with large documents.

**Solution**: ProseMirror's efficient update model; consider virtualization for very long documents.

## Success Metrics

| Metric | Target |
|--------|--------|
| Initial load time | < 2 seconds |
| Input latency | < 50ms |
| Markdown output accuracy | 100% (no data loss) |
| Supported Markdown elements | Full GFM specification |

## Competitive Analysis

| Product | Approach | Limitation |
|---------|----------|------------|
| Typora | Desktop WYSIWYG | Not web-based, paid |
| StackEdit | Split-pane | Still requires MD knowledge |
| Notion | Block-based | Exports to MD, but not MD-native |
| HackMD | Collaborative | Split-pane focused |

**Our differentiation**: True WYSIWYG that's web-based, fully open-source (MIT), and Markdown-native.

## Implementation Phases

### Phase 1: Foundation
- Project setup with Vite + React + TypeScript
- TipTap editor integration with basic extensions
- Markdown import/export functionality
- Basic toolbar UI
- Local file open/save

### Phase 2: Polish
- Complete formatting options
- Keyboard shortcuts
- Dark mode
- Auto-save to localStorage
- Mobile-responsive design

### Phase 3: Advanced
- Table editor
- GitHub integration
- Azure cloud storage (Blob Storage)
- Azure AD B2C authentication
- PWA support for offline use

## Deployment Model

The application supports two deployment options:

**Self-Hosted**
- Docker image for easy container deployment
- Static build output for traditional web servers (nginx, Apache, IIS)
- No external dependencies required for core functionality

**Azure Cloud Hosting**
- Azure Static Web Apps for the frontend
- Azure Blob Storage for document persistence (Phase 3)
- Azure AD B2C for authentication (Phase 3)
- Azure CDN for global distribution

Both options use the same codebase; cloud features gracefully degrade when self-hosted without Azure services.

## License

**Fully Open-Source** under the MIT License.

- All source code publicly available
- No premium/paid features—all functionality is free
- Community contributions welcome
- Self-hosting and modification permitted without restrictions
- Azure integration code included (users provide their own Azure subscription)

## Conclusion

This project addresses a genuine gap in the Markdown tooling ecosystem. By combining mature editor technology (ProseMirror/TipTap) with thoughtful UX design, we can create a tool that makes Markdown accessible to everyone while preserving its technical benefits for developers.

The phased approach allows for early user feedback while building toward a comprehensive solution.
