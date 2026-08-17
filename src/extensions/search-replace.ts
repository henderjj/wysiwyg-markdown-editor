import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
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

const searchReplacePluginKey = new PluginKey('searchReplace')

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
    return {
      setSearchTerm: (searchTerm: string) => ({ editor }) => {
        editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!
          .options.searchTerm = searchTerm
        // Force plugin state update
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { searchTerm })
        editor.view.dispatch(tr)
        return true
      },

      setReplaceTerm: (replaceTerm: string) => ({ editor }) => {
        editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!
          .options.replaceTerm = replaceTerm
        return true
      },

      setCaseSensitive: (caseSensitive: boolean) => ({ editor }) => {
        editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!
          .options.caseSensitive = caseSensitive
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { caseSensitive })
        editor.view.dispatch(tr)
        return true
      },

      setWholeWord: (wholeWord: boolean) => ({ editor }) => {
        editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!
          .options.wholeWord = wholeWord
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { wholeWord })
        editor.view.dispatch(tr)
        return true
      },

      setRegex: (useRegex: boolean) => ({ editor }) => {
        editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!
          .options.regex = useRegex
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { regex: useRegex })
        editor.view.dispatch(tr)
        return true
      },

      goToNextMatch: () => ({ editor }) => {
        const { results, currentIndex } = editor.storage.searchReplace as SearchReplaceStorage
        if (results.length === 0) return false
        const nextIndex = (currentIndex + 1) % results.length
        ;(editor.storage.searchReplace as SearchReplaceStorage).currentIndex = nextIndex
        const match = results[nextIndex]
        editor.commands.setTextSelection({ from: match.from, to: match.to })
        // Force decoration update
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { currentIndex: nextIndex })
        editor.view.dispatch(tr)
        // Scroll AFTER decorations are updated in the DOM
        requestAnimationFrame(() => scrollToSelection(editor))
        return true
      },

      goToPrevMatch: () => ({ editor }) => {
        const { results, currentIndex } = editor.storage.searchReplace as SearchReplaceStorage
        if (results.length === 0) return false
        const prevIndex = (currentIndex - 1 + results.length) % results.length
        ;(editor.storage.searchReplace as SearchReplaceStorage).currentIndex = prevIndex
        const match = results[prevIndex]
        editor.commands.setTextSelection({ from: match.from, to: match.to })
        const { tr } = editor.state
        tr.setMeta(searchReplacePluginKey, { currentIndex: prevIndex })
        editor.view.dispatch(tr)
        // Scroll AFTER decorations are updated in the DOM
        requestAnimationFrame(() => scrollToSelection(editor))
        return true
      },

      replaceCurrent: () => ({ editor }) => {
        const storage = editor.storage.searchReplace as SearchReplaceStorage
        const { results, currentIndex } = storage
        if (results.length === 0) return false
        const match = results[currentIndex]
        const replaceTerm = editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!.options.replaceTerm
        editor.chain()
          .setTextSelection({ from: match.from, to: match.to })
          .deleteSelection()
          .insertContent(replaceTerm)
          .run()
        return true
      },

      replaceAll: () => ({ editor }) => {
        const storage = editor.storage.searchReplace as SearchReplaceStorage
        const { results } = storage
        if (results.length === 0) return false
        const replaceTerm = editor.extensionManager.extensions
          .find(e => e.name === 'searchReplace')!.options.replaceTerm
        // Replace from end to start to preserve positions
        const sorted = [...results].sort((a, b) => b.from - a.from)
        const { tr } = editor.state
        for (const match of sorted) {
          tr.replaceWith(match.from, match.to, replaceTerm ? editor.state.schema.text(replaceTerm) : editor.state.schema.text(''))
        }
        editor.view.dispatch(tr)
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- standard TipTap pattern: inner plugin callbacks rebind `this`
    const extension = this

    return [
      new Plugin({
        key: searchReplacePluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, oldDecorations) {
            // Only recalculate if search params changed or doc changed
            if (!tr.getMeta(searchReplacePluginKey) && !tr.docChanged) {
              return oldDecorations
            }

            const { searchTerm, caseSensitive, wholeWord, regex } = extension.options
            if (!searchTerm) {
              ;(extension.storage as SearchReplaceStorage).results = []
              ;(extension.storage as SearchReplaceStorage).currentIndex = 0
              return DecorationSet.empty
            }

            const results = findMatches(tr.doc, searchTerm, caseSensitive, wholeWord, regex)
            ;(extension.storage as SearchReplaceStorage).results = results

            // Clamp currentIndex
            const storage = extension.storage as SearchReplaceStorage
            if (storage.currentIndex >= results.length) {
              storage.currentIndex = 0
            }

            const decorations = results.map((match, index) =>
              Decoration.inline(match.from, match.to, {
                class: index === storage.currentIndex
                  ? 'search-match-current'
                  : 'search-match',
              })
            )

            return DecorationSet.create(tr.doc, decorations)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
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
