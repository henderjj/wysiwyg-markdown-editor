import { useEditor, EditorContent, Extension, type Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import BulletList from '@tiptap/extension-bullet-list'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Typography from '@tiptap/extension-typography'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DOMSerializer } from '@tiptap/pm/model'
import { canJoin } from '@tiptap/pm/transform'
import { htmlToMarkdown } from '../../lib/markdown'
import { ESCAPABLE_PUNCTUATION } from '../../lib/markdownParser'
import { internalLinkFragment, navigateToHeading } from '../../lib/headingAnchors'
import { common, createLowlight } from 'lowlight'
import { MenuBar } from './MenuBar'
import { FloatingTableToolbar } from './FloatingTableToolbar'
import { FloatingImageToolbar } from './FloatingImageToolbar'
import { ImageDialog } from './ImageDialog'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { SearchReplace } from '../../extensions/search-replace'
import { posToDOMRect } from '@tiptap/core'
import {
  CriticHighlight, CriticComment, CriticMarkupUI,
  getActiveComment, canAddComment, addComment, updateComment, deleteComment,
  setPendingComment, commentFromDOM, commentDOM,
} from '../../extensions/critic-markup/CriticMarkup'
import type { ActiveComment } from '../../extensions/critic-markup/CriticMarkup'
import { buildComment, replaceCommentBody } from '../../extensions/critic-markup/commentMeta'
import type { CommentPrefixOptions } from '../../extensions/critic-markup/commentMeta'
import { CommentBubble } from './CommentBubble'
import { Mermaid } from '../../extensions/mermaid/Mermaid'
import { MermaidViewerDialog } from '../../extensions/mermaid/MermaidViewerDialog'
import { SearchBar } from './SearchBar'

const lowlight = createLowlight(common)

interface EditorProps {
  content?: string
  onUpdate?: (html: string) => void
  onEditorReady?: (editor: ReturnType<typeof useEditor>) => void
  markdownShortcuts?: boolean
  showSearchBar?: boolean
  onToggleFind?: () => void
  onCloseSearchBar?: () => void
  zoom?: number
  initialShowReplace?: boolean
  /** Author/timestamp prefix settings for new review comments */
  commentSettings?: CommentPrefixOptions
}

const DEFAULT_COMMENT_SETTINGS: CommentPrefixOptions = { includeAuthor: true, includeTimestamp: true, author: '' }

// A comment being typed into the bubble. `key` remounts the bubble per session.
type CommentComposer =
  | { mode: 'add'; from: number; to: number; key: number }
  | { mode: 'edit'; active: ActiveComment; key: number }

// Auto-join adjacent blockquote nodes after editing operations (lift/nest/delete)
const JoinAdjacentBlockquotes = Extension.create({
  name: 'joinAdjacentBlockquotes',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('joinAdjacentBlockquotes'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null

          // Collect positions where adjacent blockquotes can be joined
          const joinPositions: number[] = []
          newState.doc.descendants((node, pos, parent, index) => {
            if (node.type.name !== 'blockquote' || index === 0) return
            const prevNode = parent!.child(index - 1)
            if (prevNode.type.name === 'blockquote') {
              joinPositions.push(pos)
            }
          })

          if (joinPositions.length === 0) return null

          const tr = newState.tr
          let joined = false

          // Join from end to start so earlier positions stay valid
          for (let i = joinPositions.length - 1; i >= 0; i--) {
            const mappedPos = tr.mapping.map(joinPositions[i])
            if (canJoin(tr.doc, mappedPos)) {
              tr.join(mappedPos)
              joined = true
            }
          }

          return joined ? tr : null
        },
      }),
    ]
  },
})

// Tab indentation in code blocks (2 spaces)
const CodeBlockTabIndent = Extension.create({
  name: 'codeBlockTabIndent',
  addKeyboardShortcuts() {
    return {
      'Tab': ({ editor }) => {
        if (!editor.isActive('codeBlock') && !editor.isActive('mermaid')) return false
        const { state } = editor.view
        const { from, to } = state.selection
        const tr = state.tr.insertText('  ', from, to)
        editor.view.dispatch(tr)
        return true
      },
      'Shift-Tab': ({ editor }) => {
        if (!editor.isActive('codeBlock') && !editor.isActive('mermaid')) return false
        const { state } = editor.view
        const { $from } = state.selection
        const text = $from.parent.textContent
        const cursorOffset = $from.parentOffset
        const textBefore = text.slice(0, cursorOffset)
        const lineStart = textBefore.lastIndexOf('\n') + 1
        let spacesToRemove = 0
        for (let i = lineStart; i < lineStart + 2 && i < text.length; i++) {
          if (text[i] === ' ') spacesToRemove++
          else break
        }
        if (spacesToRemove === 0) return true
        const blockContentStart = $from.start()
        const deleteFrom = blockContentStart + lineStart
        const deleteTo = deleteFrom + spacesToRemove
        const tr = state.tr.delete(deleteFrom, deleteTo)
        editor.view.dispatch(tr)
        return true
      },
    }
  },
})

// Escape then Tab exits the editor (WCAG 2.1.2 — No Keyboard Trap)
const EscapeTabExit = Extension.create({
  name: 'escapeTabExit',
  addStorage() {
    return {
      escapedRecently: false,
      resetTimer: null as ReturnType<typeof setTimeout> | null,
    }
  },
  addKeyboardShortcuts() {
    return {
      'Escape': ({ editor }) => {
        this.storage.escapedRecently = true
        if (this.storage.resetTimer) clearTimeout(this.storage.resetTimer)
        this.storage.resetTimer = setTimeout(() => {
          this.storage.escapedRecently = false
        }, 1500)
        editor.commands.blur()
        return true
      },
      'Tab': () => {
        if (this.storage.escapedRecently) {
          this.storage.escapedRecently = false
          if (this.storage.resetTimer) clearTimeout(this.storage.resetTimer)
          return false
        }
        return false
      },
    }
  },
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        key: new PluginKey('escapeTabExit'),
        props: {
          handleKeyDown(_view, event) {
            if (event.key !== 'Tab' && event.key !== 'Escape' && storage.escapedRecently) {
              storage.escapedRecently = false
              if (storage.resetTimer) clearTimeout(storage.resetTimer)
            }
            return false
          },
        },
      }),
    ]
  },
})

// When markdown shortcuts are on, typing \ followed by a markdown-significant
// character consumes the backslash and inserts just the literal char.
// The editor shows the character without the \; on export, the escape function re-adds it.
// After consuming escapes for chars that could trigger block-level input rules
// (* # - + >), the next keystroke is inserted manually to bypass input rules
// (prevents e.g. \* + space from creating a bullet list).
const MarkdownEscape = Extension.create({
  name: 'markdownEscape',
  priority: 1000,
  addProseMirrorPlugins() {
    // After consuming an escape for a block-triggering char (* # - + >),
    // the next printable keystroke is inserted manually to bypass input rules.
    let suppressNextChar = false

    return [
      new Plugin({
        key: new PluginKey('markdownEscape'),
        props: {
          // handleKeyDown fires BEFORE handleTextInput and input rules.
          // Returning true + preventDefault() completely prevents all subsequent
          // text input handling, including TipTap's input rules (bullet list,
          // heading, italic, etc.). This is the only reliable way to prevent
          // \* + space from creating a bullet list.
          handleKeyDown(view, event) {
            const key = event.key

            // Non-printable keys reset flag
            if (key.length !== 1) {
              suppressNextChar = false
              return false
            }
            // Don't interfere with keyboard shortcuts
            if (event.ctrlKey || event.metaKey || event.altKey) {
              suppressNextChar = false
              return false
            }

            // After consuming a block-triggering escape, manually insert the
            // next typed character (typically space) to bypass input rules
            if (suppressNextChar) {
              suppressNextChar = false
              const { from, to } = view.state.selection
              view.dispatch(view.state.tr.insertText(key, from, to))
              event.preventDefault()
              return true
            }

            // Check if this key is an escapable character — the same CommonMark
            // punctuation set the import parser recognizes after a backslash
            // (\ excluded — \\ stays visible in the editor, handled by the export)
            if (key === '\\' || !ESCAPABLE_PUNCTUATION.includes(key)) {
              return false
            }

            // Check if preceded by a backslash
            const { from } = view.state.selection
            const $from = view.state.doc.resolve(from)
            const offset = $from.parentOffset
            if (offset < 1) return false
            const before = $from.parent.textBetween(offset - 1, offset)
            if (before !== '\\') return false

            // Consume \X → X (delete the backslash, insert the character)
            view.dispatch(view.state.tr.delete(from - 1, from).insertText(key, from - 1))
            event.preventDefault()

            // Characters that could trigger block-level input rules on next keystroke
            if (/^[*#\-+>]$/.test(key)) {
              suppressNextChar = true
            }

            return true
          },
        },
      }),
    ]
  },
})

// Put markdown as plain text on the clipboard when copying/cutting
const ClipboardMarkdown = Extension.create({
  name: 'clipboardMarkdown',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('clipboardMarkdown'),
        props: {
          handleDOMEvents: {
            copy(view, event) {
              if (view.state.selection.empty) return false
              const slice = view.state.selection.content()
              const serializer = DOMSerializer.fromSchema(view.state.schema)
              const div = document.createElement('div')
              div.appendChild(serializer.serializeFragment(slice.content))
              const html = div.innerHTML
              const markdown = htmlToMarkdown(html)
              event.preventDefault()
              event.clipboardData!.clearData()
              event.clipboardData!.setData('text/html', html)
              event.clipboardData!.setData('text/plain', markdown)
              return true
            },
            cut(view, event) {
              if (view.state.selection.empty) return false
              const slice = view.state.selection.content()
              const serializer = DOMSerializer.fromSchema(view.state.schema)
              const div = document.createElement('div')
              div.appendChild(serializer.serializeFragment(slice.content))
              const html = div.innerHTML
              const markdown = htmlToMarkdown(html)
              event.preventDefault()
              event.clipboardData!.clearData()
              event.clipboardData!.setData('text/html', html)
              event.clipboardData!.setData('text/plain', markdown)
              view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
              return true
            },
          },
        },
      }),
    ]
  },
})

// Clicking an in-document link (`#section`) jumps to that heading.
// Link renders every anchor with `target="_blank"`, and in the Tauri build the
// shell plugin's click listener on <body> sends any `_blank` http(s) link to
// the system browser — a bare `#frag` resolves to `http://tauri.localhost/#frag`,
// so it opened a browser tab (issue #52). Stopping propagation here, on the
// editor's own DOM, keeps the click from ever reaching that listener.
const InternalLinkNavigation = Extension.create({
  name: 'internalLinkNavigation',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('internalLinkNavigation'),
        props: {
          handleDOMEvents: {
            click(view, event) {
              const anchor = event.target instanceof Element ? event.target.closest('a') : null
              if (!anchor || !view.dom.contains(anchor)) return false
              const fragment = internalLinkFragment(anchor.getAttribute('href'))
              if (fragment === null) return false
              event.preventDefault()
              event.stopPropagation()
              // Leave shift-click (extend selection) and a drag that selected
              // part of the link text alone — only a plain click navigates.
              if (event.shiftKey || !window.getSelection()?.isCollapsed) return true
              navigateToHeading(view, fragment)
              return true
            },
          },
        },
      }),
    ]
  },
})

// Create extensions that disable input rules.
// `onExpandDiagram` and the comment callbacks must be identity-stable:
// `extensions` is a useEditor dependency, so a new function each render would
// recreate the whole editor.
function createExtensions(
  markdownShortcuts: boolean,
  onExpandDiagram?: (source: string) => void,
  onRequestComment?: (editor: TiptapEditor) => void,
  onHoverComment?: (element: HTMLElement | null) => void,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseExtensions: any[] = [
    StarterKit.configure({
      bulletList: false, // We use a custom BulletList with data-marker support
      codeBlock: false, // We use CodeBlockLowlight instead
      code: {
        HTMLAttributes: { spellcheck: 'false' },
      },
      // v3 StarterKit newly bundles these four extensions, none of which
      // existed as StarterKit defaults in v2. Disabled here to keep behavior
      // identical rather than pick up new defaults as a side effect of the
      // version bump.
      //
      // link: we register Link separately below with autolink disabled --
      // a second registration here would risk silently reverting that.
      link: false,
      // underline: Ctrl+U is documented in the shortcuts dialogs but has
      // never done anything; enabling it needs a markdown representation
      // decided first, since GFM has no underline syntax. Separate piece
      // of work.
      underline: false,
      // trailingNode: would append an empty paragraph after tables, code
      // blocks, Mermaid diagrams and horizontal rules, changing saved
      // markdown output. Off to protect round-trip fidelity -- see
      // markdownRoundtrip.test.ts.
      trailingNode: false,
    }),
    BulletList.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          'data-marker': {
            default: '-',
            parseHTML: element => element.getAttribute('data-marker') || '-',
            renderHTML: attributes => {
              if (!attributes['data-marker'] || attributes['data-marker'] === '-') return {}
              return { 'data-marker': attributes['data-marker'] }
            },
          },
        }
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: false, // Disable auto-converting text like "file.md" to links
      HTMLAttributes: {
        class: 'text-blue-600 underline hover:text-blue-800',
      },
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Placeholder.configure({
      placeholder: 'Start writing...',
    }),
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: 'plaintext',
      HTMLAttributes: { spellcheck: 'false' },
    }),
    Mermaid.configure({ onExpand: onExpandDiagram ?? null }),
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        class: 'border-collapse table-auto',
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Image.extend({
      addNodeView() {
        return ({ node }) => {
          const dom = document.createElement('span')
          dom.style.display = 'inline-block'
          dom.style.verticalAlign = 'bottom'

          const img = document.createElement('img')
          img.className = 'max-w-full'
          img.style.display = 'block'
          img.src = node.attrs.src || ''
          img.alt = node.attrs.alt || ''
          if (node.attrs.title) img.title = node.attrs.title

          const placeholder = document.createElement('span')
          placeholder.style.display = 'none'

          const buildPlaceholder = (alt: string) => {
            placeholder.className = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-sm border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm cursor-default'
            placeholder.innerHTML = ''
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            svg.setAttribute('width', '20')
            svg.setAttribute('height', '20')
            svg.setAttribute('viewBox', '0 0 24 24')
            svg.setAttribute('fill', 'none')
            svg.setAttribute('stroke', 'currentColor')
            svg.setAttribute('stroke-width', '1.5')
            svg.setAttribute('stroke-linecap', 'round')
            svg.setAttribute('stroke-linejoin', 'round')
            svg.style.flexShrink = '0'

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
            rect.setAttribute('x', '3')
            rect.setAttribute('y', '3')
            rect.setAttribute('width', '18')
            rect.setAttribute('height', '18')
            rect.setAttribute('rx', '2')
            svg.appendChild(rect)

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            circle.setAttribute('cx', '8.5')
            circle.setAttribute('cy', '8.5')
            circle.setAttribute('r', '1.5')
            svg.appendChild(circle)

            const mountain = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
            mountain.setAttribute('points', '21 15 16 10 5 21')
            svg.appendChild(mountain)

            const slash = document.createElementNS('http://www.w3.org/2000/svg', 'line')
            slash.setAttribute('x1', '2')
            slash.setAttribute('y1', '2')
            slash.setAttribute('x2', '22')
            slash.setAttribute('y2', '22')
            slash.setAttribute('stroke-width', '2')
            slash.setAttribute('stroke-opacity', '0.6')
            svg.appendChild(slash)

            placeholder.appendChild(svg)

            if (alt) {
              const label = document.createElement('span')
              label.textContent = alt
              placeholder.appendChild(label)
            }
          }

          buildPlaceholder(node.attrs.alt || '')

          img.addEventListener('load', () => {
            img.style.display = 'block'
            placeholder.style.display = 'none'
          })

          img.addEventListener('error', () => {
            if (!img.src || img.src === window.location.href) return
            img.style.display = 'none'
            placeholder.style.display = 'inline-flex'
          })

          dom.appendChild(img)
          dom.appendChild(placeholder)

          return {
            dom,
            update(updatedNode) {
              if (updatedNode.type.name !== 'image') return false

              img.src = updatedNode.attrs.src || ''
              img.alt = updatedNode.attrs.alt || ''
              if (updatedNode.attrs.title) img.title = updatedNode.attrs.title

              buildPlaceholder(updatedNode.attrs.alt || '')

              img.style.display = 'block'
              placeholder.style.display = 'none'

              return true
            },
          }
        }
      },
    }).configure({
      inline: true,
    }),
    CriticHighlight,
    CriticComment,
    CriticMarkupUI.configure({
      onRequestComment: onRequestComment ?? null,
      onHoverComment: onHoverComment ?? null,
    }),
    JoinAdjacentBlockquotes,
    ClipboardMarkdown,
    InternalLinkNavigation,
    SearchReplace,
    CodeBlockTabIndent,
    EscapeTabExit,
  ]

  // Only include Typography and escape-consuming extensions when markdown shortcuts are enabled
  if (markdownShortcuts) {
    baseExtensions.push(Typography)
    baseExtensions.push(MarkdownEscape)
  }

  // If markdown shortcuts are disabled, we need to filter out input rules
  if (!markdownShortcuts) {
    return baseExtensions.map(ext => {
      // StarterKit bundles sub-extensions (Heading, Bold, etc.) that each have
      // their own addInputRules. StarterKit itself has no addInputRules on its
      // config, so the generic check below misses them. Handle it explicitly by
      // re-extending addExtensions to strip input rules from every sub-extension.
      if (ext.name === 'starterKit') {
        return ext.extend({
          addExtensions() {
            const subExts = this.parent?.() ?? []
            return subExts.map((subExt: ReturnType<typeof Extension.create>) => {
              if ('addInputRules' in (subExt.config ?? {})) {
                return subExt.extend({ addInputRules() { return [] } })
              }
              return subExt
            })
          },
        })
      }
      // If the extension has input rules, extend it to remove them
      if (ext.config?.addInputRules || ext.parent?.config?.addInputRules) {
        return ext.extend({
          addInputRules() {
            return []
          },
        })
      }
      return ext
    })
  }

  return baseExtensions
}

export function Editor({ content = '', onUpdate, onEditorReady, markdownShortcuts = false, showSearchBar = false, onToggleFind, onCloseSearchBar, zoom = 100, initialShowReplace = false, commentSettings = DEFAULT_COMMENT_SETTINGS }: EditorProps) {
  const [showImageEditDialog, setShowImageEditDialog] = useState(false)
  const [editingImageAttrs, setEditingImageAttrs] = useState({ src: '', alt: '' })
  // Source of the diagram shown in the expanded viewer, or null when closed.
  // Owned here rather than in MermaidNodeView so the overlay lives outside
  // ProseMirror's contentEditable subtree and the `.ProseMirror` CSS scope.
  const [expandedDiagram, setExpandedDiagram] = useState<string | null>(null)
  const requestExpandDiagram = useCallback((source: string) => setExpandedDiagram(source), [])

  // Review comments. The keyboard shortcut and hover plugin live inside the
  // extension, which needs identity-stable callbacks — so the opener takes the
  // editor as an argument instead of closing over it, and hover only sets state.
  const [composer, setComposer] = useState<CommentComposer | null>(null)
  // Hover: the last comment element the pointer entered, whether it is still
  // over that text, and whether it has moved onto the bubble. The bubble hides
  // after a short delay once the pointer is on neither, so it can be reached
  // across the gap to click its buttons.
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null)
  const [pointerOnComment, setPointerOnComment] = useState(false)
  const [pointerOnBubble, setPointerOnBubble] = useState(false)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  const openComposer = useCallback((ed: TiptapEditor) => {
    const active = getActiveComment(ed.state)
    if (active) {
      setComposer({ mode: 'edit', active, key: Date.now() })
    } else if (canAddComment(ed.state)) {
      const { from, to } = ed.state.selection
      setComposer({ mode: 'add', from, to, key: Date.now() })
      setPendingComment(ed, { from, to })
    }
  }, [])

  const handleHoverComment = useCallback((el: HTMLElement | null) => {
    if (el) {
      setHoverEl(el)
      setPointerOnBubble(false)
    }
    setPointerOnComment(el !== null)
  }, [])

  useEffect(() => {
    if (!hoverEl || pointerOnComment || pointerOnBubble) return
    const id = window.setTimeout(() => setHoverEl(null), 300)
    return () => window.clearTimeout(id)
  }, [hoverEl, pointerOnComment, pointerOnBubble])

  // Build extensions based on markdownShortcuts setting
  const extensions = useMemo(
    () => createExtensions(markdownShortcuts, requestExpandDiagram, openComposer, handleHoverComment),
    [markdownShortcuts, requestExpandDiagram, openComposer, handleHoverComment]
  )

  const editor = useEditor({
    extensions,
    content,
    // v3 defaults this to false. MenuBar reads editor.isActive(...) directly
    // during render at ~24 call sites, and SearchBar reads editor.storage
    // during render for the match counter -- both would stop updating live
    // without this. The v3-native fix is a useEditorState-based refactor of
    // those two components; treat that as separate follow-up work.
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        // No `prose*` classes here: @tailwindcss/typography was never installed,
        // so they generated nothing in v3 either. Editor typography is hand-rolled
        // in the `.ProseMirror` rules in index.css.
        class: 'max-w-none focus:outline-hidden',
      },
      // Ensure cursor stays visible when typing near edges
      scrollThreshold: 100,
      scrollMargin: 100,
    },
  }, [extensions]) // Re-create editor when extensions change

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor) {
      onEditorReady?.(editor)
    }
  }, [editor, onEditorReady])

  const handleEditImage = useCallback(() => {
    if (!editor) return
    const attrs = editor.getAttributes('image')
    setEditingImageAttrs({ src: attrs.src || '', alt: attrs.alt || '' })
    setShowImageEditDialog(true)
  }, [editor])

  const handleUpdateImage = useCallback((src: string, alt: string) => {
    if (!editor) return
    editor.chain().focus().setImage({ src, alt }).run()
  }, [editor])

  const requestComment = useCallback(() => {
    if (editor) openComposer(editor)
  }, [editor, openComposer])

  const closeComposer = useCallback(() => {
    setComposer(null)
    if (editor) {
      setPendingComment(editor, null)
      editor.commands.focus()
    }
  }, [editor])

  const handleComposerSubmit = useCallback((body: string) => {
    if (!editor || !composer) return
    setComposer(null)
    if (composer.mode === 'add') {
      setPendingComment(editor, null)
      addComment(editor, buildComment(body, commentSettings), composer)
    } else {
      const { active } = composer
      // A lone {==highlight==} has no comment yet: give it a fresh prefix.
      // An existing comment keeps its original author/time prefix.
      const next = active.comment === null
        ? buildComment(body, commentSettings)
        : replaceCommentBody(active.comment, body)
      updateComment(editor, active, next)
    }
  }, [editor, composer, commentSettings])

  // A doc update while composing means the document was replaced underneath
  // (tab switch, reload): typing goes to the bubble's input, not the editor.
  useEffect(() => {
    if (!editor || !composer) return
    const close = () => setComposer(null)
    editor.on('update', close)
    return () => { editor.off('update', close) }
  }, [editor, composer])

  // The add-mode anchor is the pending range itself. Memoized so the bubble's
  // positioning effect doesn't restart on every render.
  const composerRange = composer?.mode === 'add' ? composer : null
  const addReference = useMemo(() => {
    if (!editor || !composerRange) return null
    return {
      getBoundingClientRect: () => posToDOMRect(editor.view, composerRange.from, composerRange.to),
      contextElement: editor.view.dom,
    }
  }, [editor, composerRange])

  // Which bubble to show, in priority order: composing > mouse hover > caret
  // (so comments are readable and editable without a mouse). Hover and caret
  // anchor to the same comment element, so switching between them doesn't move
  // the bubble. Derived during render: the editor re-renders on every
  // transaction, including focus/blur.
  let bubble: React.ReactNode = null
  if (editor && composer) {
    const reference = composer.mode === 'add' ? addReference : commentDOM(editor.view, composer.active)
    if (reference) {
      bubble = composer.mode === 'add'
        ? <CommentBubble key={composer.key} mode="add" target={composer.from === composer.to ? 'cursor' : 'selection'}
          reference={reference} boundary={scrollEl} onSubmit={handleComposerSubmit} onCancel={closeComposer} />
        : <CommentBubble key={composer.key} mode="edit" comment={composer.active.comment}
          reference={reference} boundary={scrollEl} onSubmit={handleComposerSubmit} onCancel={closeComposer} />
    }
  } else if (editor) {
    let target: { el: HTMLElement; active: ActiveComment } | null = null
    if (hoverEl?.isConnected) {
      const active = commentFromDOM(editor.view, hoverEl)
      if (active) target = { el: hoverEl, active }
    }
    if (!target && editor.isFocused) {
      const active = getActiveComment(editor.state)
      const el = active && commentDOM(editor.view, active)
      if (active && el) target = { el, active }
    }
    if (target && target.active.comment !== null) {
      const { active } = target
      bubble = (
        <CommentBubble
          key="view"
          mode="view"
          comment={target.active.comment}
          reference={target.el}
          boundary={scrollEl}
          onMouseEnter={() => setPointerOnBubble(true)}
          onMouseLeave={() => setPointerOnBubble(false)}
          onEdit={() => {
            setHoverEl(null)
            setComposer({ mode: 'edit', active, key: Date.now() })
          }}
          onDelete={() => {
            setHoverEl(null)
            deleteComment(editor, active)
          }}
        />
      )
    }
  }

  // The user cannot type while the viewer holds focus, so any update while it is
  // open means the document was replaced underneath it (tab switch, reload from
  // disk). Close rather than keep showing a diagram that may no longer exist.
  useEffect(() => {
    if (!editor || expandedDiagram === null) return
    const close = () => setExpandedDiagram(null)
    editor.on('update', close)
    return () => { editor.off('update', close) }
  }, [editor, expandedDiagram])

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-xs flex flex-col min-h-0 h-full overflow-hidden">
      <div className="shrink-0 z-20 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 rounded-t-lg">
        <MenuBar editor={editor} showSearchBar={showSearchBar} onToggleFind={onToggleFind} onRequestComment={requestComment} />
        {showSearchBar && editor && onCloseSearchBar && (
          <SearchBar editor={editor} onClose={onCloseSearchBar} initialShowReplace={initialShowReplace} />
        )}
      </div>
      <div ref={setScrollEl} className="flex-1 min-h-0 overflow-y-auto relative">
        <EditorContent editor={editor} className="min-h-[300px]" style={{ fontSize: `${zoom}%` }} />
        {editor && <FloatingTableToolbar editor={editor} />}
        {editor && <FloatingImageToolbar editor={editor} onEditImage={handleEditImage} />}
      </div>
      <ImageDialog
        isOpen={showImageEditDialog}
        onClose={() => setShowImageEditDialog(false)}
        onSubmit={handleUpdateImage}
        initialSrc={editingImageAttrs.src}
        initialAlt={editingImageAttrs.alt}
        mode="edit"
      />
      <MermaidViewerDialog
        source={expandedDiagram}
        onClose={() => setExpandedDiagram(null)}
        onFallbackFocus={() => editor?.commands.focus()}
      />
      {bubble}
    </div>
  )
}

export type { EditorProps }
