import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchReplaceOptions {
  searchTerm: string
  replaceTerm: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

export interface SearchReplaceStorage {
  results: { from: number; to: number }[]
  currentIndex: number
}

// Everything the plugin needs to recompute matches, carried in ProseMirror's
// own state rather than in the extension's `options`/`storage`. See the long
// comment above addProseMirrorPlugins() for why: `this` inside this
// extension's various lifecycle methods is not a consistent object identity
// in this TipTap version, so cross-method communication through it silently
// breaks. Plugin state plus tr.setMeta() has no such problem -- it is always
// the live, canonical state for this editor.
interface SearchPluginState {
  searchTerm: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  results: { from: number; to: number }[]
  currentIndex: number
  decorations: DecorationSet
}

const searchReplacePluginKey = new PluginKey<SearchPluginState>('searchReplace')

// editor.storage.searchReplace is the extension's public, documented surface
// (read by SearchBar.tsx and consumers outside this file). Mirror the
// authoritative plugin state into it here, using the `editor` a command was
// invoked with -- which is always correct, unlike extension.options/storage
// accessed via `this` in a different lifecycle method.
function syncStorageFromPlugin(editor: {
  state: EditorState
  storage: { searchReplace: SearchReplaceStorage }
}) {
  const pluginState = searchReplacePluginKey.getState(editor.state)
  if (!pluginState) return
  editor.storage.searchReplace.results = pluginState.results
  editor.storage.searchReplace.currentIndex = pluginState.currentIndex
}

function findMatches(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  searchTerm: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): { from: number; to: number }[] {
  if (!searchTerm) return []

  let pattern: RegExp
  try {
    if (useRegex) {
      pattern = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi')
    } else {
      const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wordBoundary = wholeWord ? '\\b' : ''
      pattern = new RegExp(`${wordBoundary}${escaped}${wordBoundary}`, caseSensitive ? 'g' : 'gi')
    }
  } catch {
    return []
  }

  const results: { from: number; to: number }[] = []

  // Search within each textblock independently with proper PM position mapping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.descendants((node: any, pos: number) => {
    if (!node.isTextblock) return

    // Build text and position map for this block
    const textParts: { text: string; from: number }[] = []
    let blockText = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.forEach((child: any, offset: number) => {
      if (child.isText) {
        textParts.push({ text: child.text!, from: pos + 1 + offset })
        blockText += child.text!
      }
    })

    if (!blockText) return false

    // Search within this block's text
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(blockText)) !== null) {
      if (match[0].length === 0) {
        pattern.lastIndex++
        continue
      }

      // Map flat text offsets back to ProseMirror positions
      let from = -1
      let to = -1
      let consumed = 0
      for (const part of textParts) {
        const partEnd = consumed + part.text.length
        if (from === -1 && match.index >= consumed && match.index < partEnd) {
          from = part.from + (match.index - consumed)
        }
        const matchEnd = match.index + match[0].length
        if (to === -1 && matchEnd > consumed && matchEnd <= partEnd) {
          to = part.from + (matchEnd - consumed)
        }
        consumed = partEnd
      }

      if (from >= 0 && to >= 0) {
        results.push({ from, to })
      }
    }

    return false // don't descend into textblock children (we handled them)
  })

  return results
}

export const SearchReplace = Extension.create<SearchReplaceOptions, SearchReplaceStorage>({
  name: 'searchReplace',

  addOptions() {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    }
  },

  addStorage() {
    return {
      results: [],
      currentIndex: 0,
    }
  },

  addCommands() {
    // Genuine v3 regression, confirmed empirically via a manual browser
    // verification pass (not caught by the type checker or the test suite):
    // `this` inside this extension's various lifecycle methods
    // (addCommands/addProseMirrorPlugins) is not a consistent object
    // identity. Writing extension.options.searchTerm here and reading
    // extension.options.searchTerm inside addProseMirrorPlugins()'s apply()
    // silently read two different objects -- confirmed by logging identity
    // and values directly. A typed search term therefore never reached the
    // plugin, and the match count stayed at zero no matter what was typed.
    // editor.extensionManager.extensions.find(e => e.name === 'searchReplace')
    // is similarly unreliable and must not be used either.
    //
    // Fix: the plugin carries its own complete state (searchTerm included),
    // driven entirely by tr.setMeta()/tr.docChanged in apply() below -- see
    // SearchPluginState. That path only touches ProseMirror's state, which is
    // always canonical, so it has no equivalent identity hazard.
    // editor.storage.searchReplace remains the extension's public surface
    // (read by SearchBar.tsx); syncStorageFromPlugin() mirrors the plugin's
    // results/currentIndex into it using the *command's own* `editor`
    // parameter, which is reliable -- unlike `this`, it's never substituted.
    //
    // The one field kept on `this.options` is replaceTerm, which the plugin
    // does not need to know about (it doesn't affect matching) and which is
    // only ever read back from within this same addCommands() closure --
    // self-consistent, since it's the same `extension` reference throughout.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const extension = this
    return {
      setSearchTerm: (searchTerm: string) => ({ editor }) => {
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { searchTerm })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        return true
      },

      setReplaceTerm: (replaceTerm: string) => () => {
        extension.options.replaceTerm = replaceTerm
        return true
      },

      setCaseSensitive: (caseSensitive: boolean) => ({ editor }) => {
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { caseSensitive })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        return true
      },

      setWholeWord: (wholeWord: boolean) => ({ editor }) => {
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { wholeWord })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        return true
      },

      setRegex: (useRegex: boolean) => ({ editor }) => {
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { regex: useRegex })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        return true
      },

      goToNextMatch: () => ({ editor }) => {
        const { results, currentIndex } = editor.storage.searchReplace
        if (results.length === 0) return false
        const nextIndex = (currentIndex + 1) % results.length
        const match = results[nextIndex]
        editor.commands.setTextSelection({ from: match.from, to: match.to })
        // Force decoration update
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { currentIndex: nextIndex })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        // Scroll AFTER decorations are updated in the DOM
        requestAnimationFrame(() => scrollToSelection(editor))
        return true
      },

      goToPrevMatch: () => ({ editor }) => {
        const { results, currentIndex } = editor.storage.searchReplace
        if (results.length === 0) return false
        const prevIndex = (currentIndex - 1 + results.length) % results.length
        const match = results[prevIndex]
        editor.commands.setTextSelection({ from: match.from, to: match.to })
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { currentIndex: prevIndex })
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        // Scroll AFTER decorations are updated in the DOM
        requestAnimationFrame(() => scrollToSelection(editor))
        return true
      },

      replaceCurrent: () => ({ editor }) => {
        const storage = editor.storage.searchReplace
        const { results, currentIndex } = storage
        if (results.length === 0) return false
        const match = results[currentIndex]
        const replaceTerm = extension.options.replaceTerm
        editor.chain()
          .setTextSelection({ from: match.from, to: match.to })
          .deleteSelection()
          .insertContent(replaceTerm)
          .run()
        return true
      },

      replaceAll: () => ({ editor }) => {
        const storage = editor.storage.searchReplace
        const { results } = storage
        if (results.length === 0) return false
        const replaceTerm = extension.options.replaceTerm
        // Replace from end to start to preserve positions
        const sorted = [...results].sort((a, b) => b.from - a.from)
        const { tr } = editor.state
        for (const match of sorted) {
          tr.replaceWith(match.from, match.to, replaceTerm ? editor.state.schema.text(replaceTerm) : editor.state.schema.text(''))
        }
        editor.view.dispatch(tr)
        syncStorageFromPlugin(editor)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchReplacePluginKey,
        state: {
          init() {
            // Hardcoded rather than read from `this.options`: see the long
            // comment in addCommands() -- extension identity is not reliable
            // to read from inside these lifecycle methods, and these match
            // the same literal defaults addOptions() declares.
            return {
              searchTerm: '',
              caseSensitive: false,
              wholeWord: false,
              regex: false,
              results: [],
              currentIndex: 0,
              decorations: DecorationSet.empty,
            }
          },
          apply(tr, oldState) {
            const meta = tr.getMeta(searchReplacePluginKey)
            // Only recalculate if search params changed or doc changed
            if (!meta && !tr.docChanged) {
              return oldState
            }

            const next = { ...oldState, ...meta }

            if (!next.searchTerm) {
              return { ...next, results: [], currentIndex: 0, decorations: DecorationSet.empty }
            }

            const results = findMatches(tr.doc, next.searchTerm, next.caseSensitive, next.wholeWord, next.regex)

            // Clamp currentIndex
            let currentIndex = next.currentIndex
            if (currentIndex >= results.length) {
              currentIndex = 0
            }

            const decorations = results.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class: index === currentIndex
                  ? 'search-match-current'
                  : 'search-match',
              })
            )

            return { ...next, results, currentIndex, decorations: DecorationSet.create(tr.doc, decorations) }
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations
          },
        },
      }),
    ]
  },
})

function scrollToSelection(editor: { view: { domAtPos: (pos: number) => { node: Node } } }) {
  try {
    const { node } = editor.view.domAtPos(0)
    const el = node instanceof HTMLElement ? node : node.parentElement
    el?.querySelector('.search-match-current')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  } catch {
    // ignore scroll errors
  }
}

// Extend TipTap Commands interface
declare module '@tiptap/core' {
  // v3 made editor.storage a typed, augmentable interface (empty by default)
  // rather than Record<string, any> -- without this, every
  // editor.storage.searchReplace access is a type error.
  interface Storage {
    searchReplace: SearchReplaceStorage
  }

  interface Commands<ReturnType> {
    searchReplace: {
      setSearchTerm: (term: string) => ReturnType
      setReplaceTerm: (term: string) => ReturnType
      setCaseSensitive: (value: boolean) => ReturnType
      setWholeWord: (value: boolean) => ReturnType
      setRegex: (value: boolean) => ReturnType
      goToNextMatch: () => ReturnType
      goToPrevMatch: () => ReturnType
      replaceCurrent: () => ReturnType
      replaceAll: () => ReturnType
    }
  }
}
