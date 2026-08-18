import { useState, useCallback, useRef, useEffect, Fragment, KeyboardEvent, DragEvent, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Editor as TiptapEditor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import { Editor } from './components/Editor'
import { AppMenuBar, type MenuState } from './components/AppMenuBar'
import { TabContextMenu } from './components/TabContextMenu'
import { DocumentMap } from './components/Editor/DocumentMap'
import { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog'
import { UserGuideDialog } from './components/UserGuideDialog'
import packageJson from '../package.json'
import {
  exportMarkdown,
  htmlToMarkdown,
  getSelectedHtml,
  wrapHtmlDocument,
  exportHtmlFile,
  copyMarkdownToClipboard,
  openMarkdownFile,
  saveMarkdownFile,
  saveMarkdownFileAs,
  setFileHandle,
  clearFileHandle,
  hasFileHandle,
  readFromFileHandle,
  setDocumentLineEnding,
  watchFileHandle,
} from './lib/markdown'
import { markdownToHtml } from './lib/markdownParser'
import { pasteAsMarkdown } from './lib/pasteAsMarkdown'
import { readClipboardText, writeClipboardText } from './lib/clipboard'
import { isTauri, getCliFilePath, readFileByPath, setFilePath, getFilePath, watchFilePath, fileExists, pollFileRecreation } from './lib/tauri'
import { useTheme } from './hooks/useTheme'
import { loadRecentFiles, addRecentFile, clearRecentFiles } from './lib/recentFiles'

interface Document {
  id: string
  filename: string
  content: string
  lastModified: number
  filePath?: string  // Full disk path, Tauri only
}

const STORAGE_KEY = 'wysiwyg-md-documents'
const ACTIVE_DOC_KEY = 'wysiwyg-md-active-doc'
const MD_SHORTCUTS_KEY = 'wysiwyg-md-shortcuts'
const ZOOM_KEY = 'wysiwyg-md-zoom'
const AUTO_SAVE_FILE_KEY = 'wysiwyg-md-auto-save-file'
const RESTORE_SESSION_KEY = 'wysiwyg-md-restore-session'
const SHOW_PREVIEW_KEY = 'wysiwyg-md-show-preview'
const SHOW_DOCMAP_KEY = 'wysiwyg-md-show-docmap'

const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]

function loadZoom(): number {
  try {
    const stored = localStorage.getItem(ZOOM_KEY)
    if (stored) {
      const val = parseInt(stored, 10)
      if (ZOOM_STEPS.includes(val)) return val
    }
  } catch {
    // localStorage unavailable (private browsing / storage disabled) — use the default
  }
  return 100
}

function loadMarkdownShortcuts(): boolean {
  try {
    const stored = localStorage.getItem(MD_SHORTCUTS_KEY)
    return stored === 'true'
  } catch {
    return false
  }
}

function saveMarkdownShortcuts(enabled: boolean): void {
  localStorage.setItem(MD_SHORTCUTS_KEY, String(enabled))
}

function loadRestoreSession(): boolean {
  try {
    const stored = localStorage.getItem(RESTORE_SESSION_KEY)
    return stored !== 'false' // default true
  } catch {
    return true
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

function createBlankDoc(): Document {
  return { id: generateId(), filename: 'untitled.md', content: '', lastModified: Date.now() }
}

/** Clear undo/redo history so users can't undo past a document load. */
function clearEditorHistory(editor: TiptapEditor) {
  const newState = EditorState.create({
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  })
  editor.view.updateState(newState)
}

function getEditorScrollContainer(editor: TiptapEditor | null): HTMLElement | null {
  return editor?.view?.dom?.closest('.overflow-y-auto') as HTMLElement | null
}

function loadDocuments(): Document[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return [createBlankDoc()]
}

function saveDocuments(docs: Document[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs))
}

function loadActiveDocId(): string | null {
  return localStorage.getItem(ACTIVE_DOC_KEY)
}

function saveActiveDocId(id: string): void {
  localStorage.setItem(ACTIVE_DOC_KEY, id)
}

function App() {
  const { theme, setTheme } = useTheme()
  const [documents, setDocuments] = useState<Document[]>(() => {
    if (!isTauri()) return [createBlankDoc()]
    if (!loadRestoreSession()) return [createBlankDoc()]
    return loadDocuments()
  })
  const [activeDocId, setActiveDocId] = useState<string>(() => {
    if (!isTauri() || !loadRestoreSession()) return documents[0]?.id || generateId()
    const savedId = loadActiveDocId()
    if (savedId && documents.find((d: Document) => d.id === savedId)) {
      return savedId
    }
    return documents[0]?.id || generateId()
  })
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem(SHOW_PREVIEW_KEY) === 'true')
  const [markdownContent, setMarkdownContent] = useState('')
  const [notification, setNotification] = useState<string | null>(null)
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingFilename, setEditingFilename] = useState('')
  const [markdownShortcuts, setMarkdownShortcuts] = useState(loadMarkdownShortcuts)
  const [dirtyDocs, setDirtyDocs] = useState<Set<string>>(new Set())
  const [statusInfo, setStatusInfo] = useState({ words: 0, chars: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileChangedDocs, setFileChangedDocs] = useState<Set<string>>(new Set())
  const [fileDeletedDocs, setFileDeletedDocs] = useState<Set<string>>(new Set())
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; docId: string; filename: string } | null>(null)
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; docId: string } | null>(null)
  const tabRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const [showDocumentMap, setShowDocumentMap] = useState(() => localStorage.getItem(SHOW_DOCMAP_KEY) === 'true')
  const [showShortcutsDialog, setShowShortcutsDialog] = useState(false)
  const [showUserGuideDialog, setShowUserGuideDialog] = useState(false)
  const [showAboutDialog, setShowAboutDialog] = useState(false)
  const [searchBarMode, setSearchBarMode] = useState<'find' | 'findReplace' | null>(null)
  // Undo/redo availability, kept in real state and updated via a transaction
  // listener (set up in handleEditorReady) rather than read from editorRef
  // during render -- ref mutations don't trigger re-renders, so a render-time
  // read here could show stale button state between an undo-stack change and
  // whatever unrelated update next re-renders the app.
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [zoom, setZoom] = useState(loadZoom)
  const [recentFiles, setRecentFiles] = useState<string[]>(loadRecentFiles)
  const [autoSaveToFile, setAutoSaveToFile] = useState(() => localStorage.getItem(AUTO_SAVE_FILE_KEY) === 'true')
  const [restoreSession, setRestoreSession] = useState(loadRestoreSession)
  const [isRestoringSession, setIsRestoringSession] = useState(() =>
    isTauri() && loadRestoreSession() && loadDocuments().some(d => d.filePath)
  )
  const zoomIn = useCallback(() => {
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z)
      const next = ZOOM_STEPS[Math.min(i + 1, ZOOM_STEPS.length - 1)]
      localStorage.setItem(ZOOM_KEY, String(next))
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const i = ZOOM_STEPS.indexOf(z)
      const next = ZOOM_STEPS[Math.max(i - 1, 0)]
      localStorage.setItem(ZOOM_KEY, String(next))
      return next
    })
  }, [])

  const autoSaveFileTimeoutRef = useRef<number | null>(null)
  const editorRef = useRef<TiptapEditor | null>(null)
  // Tracks the current editor's transaction listener so it can be detached
  // before a new one is attached on remount (markdownShortcuts toggle).
  const undoRedoCleanupRef = useRef<(() => void) | null>(null)
  const autoSaveTimeoutRef = useRef<number | null>(null)
  const isLoadingContentRef = useRef(false)
  const editorInitializedRef = useRef(false)
  const dirtyDocsRef = useRef(dirtyDocs)
  const documentsRef = useRef(documents)
  const scrollPositionsRef = useRef(new Map<string, number>())
  const recentlySavedRef = useRef(new Set<string>())

  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0]
  const activeDocRef = useRef(activeDoc)
  const activeDocIdRef = useRef(activeDocId)
  const showPreviewRef = useRef(showPreview)
  // Keep refs in sync
  useEffect(() => {
    activeDocRef.current = activeDoc
    activeDocIdRef.current = activeDocId
  }, [activeDoc, activeDocId])

  useEffect(() => {
    showPreviewRef.current = showPreview
  }, [showPreview])


  useEffect(() => {
    dirtyDocsRef.current = dirtyDocs
  }, [dirtyDocs])

  useEffect(() => {
    documentsRef.current = documents
  }, [documents])

  const updateStatusInfo = useCallback(() => {
    if (!editorRef.current) return
    const text = editorRef.current.getText()
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const chars = text.length
    setStatusInfo({ words, chars })
  }, [])

  // Save documents to localStorage when they change (Tauri only — web starts fresh)
  useEffect(() => {
    if (!isTauri()) return
    const toSave = documents.map(doc =>
      doc.filePath ? { ...doc, content: '' } : doc
    )
    saveDocuments(toSave)
  }, [documents])

  // Save active document ID (Tauri only — web starts fresh)
  useEffect(() => {
    if (!isTauri()) return
    saveActiveDocId(activeDocId)
  }, [activeDocId])

  // Tauri session restoration: re-read file-backed docs from disk on startup
  useEffect(() => {
    if (!isRestoringSession) return
    let cancelled = false

    ;(async () => {
      const failed: string[] = []
      const restored: Document[] = []

      for (const doc of documents) {
        if (!doc.filePath) {
          restored.push(doc)
          continue
        }
        const content = await readFileByPath(doc.filePath)
        if (content !== null) {
          setFilePath(doc.id, doc.filePath)
          restored.push({ ...doc, content, lastModified: Date.now() })
        } else {
          failed.push(doc.filename)
        }
      }

      if (cancelled) return

      if (restored.length === 0) {
        restored.push(createBlankDoc())
      }

      // Determine final active doc
      let finalActiveId = activeDocId
      if (!restored.find(d => d.id === activeDocId)) {
        finalActiveId = restored[0].id
      }

      // Sync refs BEFORE state updates so handleEditorReady sees fresh data
      // (React batches the state updates below, and the ref-syncing useEffect
      // hasn't run yet when the editor mounts on the resulting re-render)
      documentsRef.current = restored
      const restoredActiveDoc = restored.find(d => d.id === finalActiveId) || restored[0]
      activeDocRef.current = restoredActiveDoc
      activeDocIdRef.current = finalActiveId

      setDocuments(restored)
      if (finalActiveId !== activeDocId) {
        setActiveDocId(finalActiveId)
      }

      if (failed.length > 0) {
        setNotification(`Could not reload: ${failed.join(', ')}`)
        setTimeout(() => setNotification(null), 5000)
      }

      setIsRestoringSession(false)
    })()

    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- runs once on mount

  const showNotification = useCallback((message: string) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }, [])

  const markDirty = useCallback((docId: string) => {
    setDirtyDocs((prev) => {
      if (prev.has(docId)) return prev
      const next = new Set(prev)
      next.add(docId)
      return next
    })
  }, [])

  const markClean = useCallback((docId: string) => {
    setDirtyDocs((prev) => {
      if (!prev.has(docId)) return prev
      const next = new Set(prev)
      next.delete(docId)
      return next
    })
  }, [])

  const handleEditorReady = useCallback((editor: TiptapEditor | null) => {
    // Detach the previous editor's transaction listener before attaching a
    // new one -- handleEditorReady runs again on remount (markdownShortcuts
    // toggle), and the old editor instance would otherwise leak a listener.
    undoRedoCleanupRef.current?.()
    undoRedoCleanupRef.current = null

    editorRef.current = editor

    if (editor) {
      const updateUndoRedo = () => {
        setCanUndo(editor.can().undo())
        setCanRedo(editor.can().redo())
      }
      updateUndoRedo()
      editor.on('transaction', updateUndoRedo)
      undoRedoCleanupRef.current = () => editor.off('transaction', updateUndoRedo)
    } else {
      setCanUndo(false)
      setCanRedo(false)
    }

    // Only load content once when editor first initializes
    if (editor && !editorInitializedRef.current) {
      editorInitializedRef.current = true
      isLoadingContentRef.current = true
      const doc = activeDocRef.current
      const html = doc?.content ? markdownToHtml(doc.content) : '<p></p>'
      editor.commands.setContent(html, { emitUpdate: false })
      clearEditorHistory(editor)
      if (showPreviewRef.current && doc?.content) {
        setMarkdownContent(doc.content)
      }
      setTimeout(() => {
        isLoadingContentRef.current = false
        updateStatusInfo()
      }, 100)

      // Check for CLI file path (Tauri "Open With")
      getCliFilePath().then(async (cliPath) => {
        if (!cliPath) return
        const content = await readFileByPath(cliPath)
        if (content === null) return
        const currentDocId = activeDocIdRef.current
        const filename = cliPath.split(/[/\\]/).pop() || 'document.md'
        isLoadingContentRef.current = true
        const cliHtml = markdownToHtml(content)
        editor.commands.setContent(cliHtml, { emitUpdate: false })
        clearEditorHistory(editor)
        editor.chain().setTextSelection(0).focus().run()
        setFilePath(currentDocId, cliPath)
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === currentDocId
              ? { ...d, filename, content, lastModified: Date.now(), filePath: cliPath }
              : d
          )
        )
        if (showPreviewRef.current) {
          setMarkdownContent(content)
        }
        setTimeout(() => {
          isLoadingContentRef.current = false
          updateStatusInfo()
        }, 100)
      })
    }
  }, [updateStatusInfo]) // updateStatusInfo is stable (no deps)

  const markRecentlySaved = useCallback((docId: string) => {
    recentlySavedRef.current.add(docId)
    setTimeout(() => recentlySavedRef.current.delete(docId), 3000)
  }, [])

  const handleUpdate = useCallback(() => {
    updateStatusInfo()

    // Skip auto-save when loading content programmatically
    if (isLoadingContentRef.current) {
      return
    }

    markDirty(activeDocId)

    // Update markdown preview when content changes
    if (showPreview && editorRef.current) {
      setMarkdownContent(exportMarkdown(editorRef.current))
    }

    // Auto-save with debounce
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      if (editorRef.current && !isLoadingContentRef.current) {
        const markdown = exportMarkdown(editorRef.current)
        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === activeDocId
              ? { ...doc, content: markdown, lastModified: Date.now() }
              : doc
          )
        )
      }
    }, 1000)

    // Auto-save to file (longer debounce, only for documents with file handles/paths)
    const hasFile = hasFileHandle(activeDocId) || (isTauri() && !!getFilePath(activeDocId))
    if (autoSaveToFile && hasFile) {
      if (autoSaveFileTimeoutRef.current) {
        clearTimeout(autoSaveFileTimeoutRef.current)
      }
      autoSaveFileTimeoutRef.current = window.setTimeout(() => {
        if (editorRef.current && !isLoadingContentRef.current) {
          const markdown = exportMarkdown(editorRef.current)
          const currentDoc = activeDocRef.current
          const docId = activeDocIdRef.current
          saveMarkdownFile(markdown, currentDoc?.filename || 'document.md', docId).then((savedName) => {
            if (savedName) {
              markClean(docId)
              markRecentlySaved(docId)
            }
          })
        }
      }, 4000)
    }
  }, [updateStatusInfo, showPreview, activeDocId, markDirty, autoSaveToFile])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    const currentDocId = activeDocIdRef.current
    const currentDoc = activeDocRef.current
    const markdown = exportMarkdown(editorRef.current)
    const savedName = await saveMarkdownFile(markdown, currentDoc?.filename || 'document.md', currentDocId)
    if (savedName) {
      markClean(currentDocId)
      markRecentlySaved(currentDocId)
      const savedFilePath = isTauri() ? getFilePath(currentDocId) : undefined
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === currentDocId
            ? { ...doc, filename: savedName, content: markdown, filePath: savedFilePath }
            : doc
        )
      )
      showNotification(`Saved as ${savedName}`)
    }
  }, [showNotification, markClean, markRecentlySaved])

  const handleSaveAs = useCallback(async () => {
    if (!editorRef.current) return
    const currentDocId = activeDocIdRef.current
    const currentDoc = activeDocRef.current
    const markdown = exportMarkdown(editorRef.current)
    const savedName = await saveMarkdownFileAs(markdown, currentDoc?.filename || 'document.md', currentDocId)
    if (savedName) {
      markClean(currentDocId)
      markRecentlySaved(currentDocId)
      const savedFilePath = isTauri() ? getFilePath(currentDocId) : undefined
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === currentDocId
            ? { ...doc, filename: savedName, content: markdown, filePath: savedFilePath }
            : doc
        )
      )
      showNotification(`Saved as ${savedName}`)
    }
  }, [showNotification, markClean, markRecentlySaved])

  const handleCopy = useCallback(async () => {
    if (!editorRef.current) return
    const selectedHtml = getSelectedHtml(editorRef.current)
    const markdown = selectedHtml
      ? htmlToMarkdown(selectedHtml)
      : exportMarkdown(editorRef.current)
    const success = await copyMarkdownToClipboard(markdown)
    if (success) {
      showNotification(selectedHtml ? 'Selection copied as Markdown' : 'Document copied as Markdown')
    } else {
      showNotification('Failed to copy to clipboard')
    }
  }, [showNotification])

  const handleCopyHtml = useCallback(async () => {
    if (!editorRef.current) return
    const selectedHtml = getSelectedHtml(editorRef.current)
    const html = selectedHtml || editorRef.current.getHTML()
    try {
      await writeClipboardText(html)
      showNotification(selectedHtml ? 'Selection copied as HTML' : 'Document copied as HTML')
    } catch {
      showNotification('Failed to copy to clipboard')
    }
  }, [showNotification])

  const handleCopyPlainText = useCallback(async () => {
    if (!editorRef.current) return
    const selectedHtml = getSelectedHtml(editorRef.current)
    let plainText: string
    if (selectedHtml) {
      const div = document.createElement('div')
      div.innerHTML = selectedHtml
      plainText = div.textContent || ''
    } else {
      plainText = editorRef.current.getText()
    }
    try {
      await writeClipboardText(plainText)
      showNotification(selectedHtml ? 'Selection copied as plain text' : 'Document copied as plain text')
    } catch {
      showNotification('Failed to copy to clipboard')
    }
  }, [showNotification])

  const handleExportHtml = useCallback(async () => {
    if (!editorRef.current) return
    const currentDoc = activeDocRef.current
    const bodyHtml = editorRef.current.getHTML()
    const baseName = (currentDoc?.filename || 'document.md').replace(/\.md$/, '')
    const fullHtml = wrapHtmlDocument(bodyHtml, baseName)
    const savedName = await exportHtmlFile(fullHtml, baseName + '.html')
    if (savedName) {
      showNotification(`Exported as ${savedName}`)
    }
  }, [showNotification])

  const handleNewTab = useCallback(() => {
    const newDoc: Document = {
      id: generateId(),
      filename: 'untitled.md',
      content: '',
      lastModified: Date.now(),
    }
    setDocuments((prev) => [...prev, newDoc])
    setActiveDocId(newDoc.id)
    if (editorRef.current) {
      isLoadingContentRef.current = true
      editorRef.current.commands.setContent('<p></p>', { emitUpdate: false })
      clearEditorHistory(editorRef.current)
      setTimeout(() => {
        isLoadingContentRef.current = false
        editorRef.current?.commands.focus()
        updateStatusInfo()
      }, 100)
    }
    if (showPreviewRef.current) {
      setMarkdownContent('')
    }
  }, [updateStatusInfo])

  const handleCloseTab = useCallback(async (docId: string) => {
    if (dirtyDocs.has(docId)) {
      let shouldClose: boolean
      if (isTauri()) {
        const { confirm } = await import('@tauri-apps/plugin-dialog')
        shouldClose = await confirm('This document has unsaved changes. Close anyway?', {
          title: 'Unsaved Changes',
          kind: 'warning',
        })
      } else {
        shouldClose = window.confirm('This document has unsaved changes. Close anyway?')
      }
      if (!shouldClose) return
    }
    clearFileHandle(docId)
    markClean(docId)
    setFileDeletedDocs((prev) => { if (!prev.has(docId)) return prev; const next = new Set(prev); next.delete(docId); return next })
    setFileChangedDocs((prev) => { if (!prev.has(docId)) return prev; const next = new Set(prev); next.delete(docId); return next })

    setDocuments((prev) => {
      const filtered = prev.filter((d) => d.id !== docId)

      if (filtered.length === 0) {
        // Last tab closed — create a fresh untitled doc
        const newDoc: Document = {
          id: generateId(),
          filename: 'untitled.md',
          content: '',
          lastModified: Date.now(),
        }
        setActiveDocId(newDoc.id)
        if (editorRef.current) {
          isLoadingContentRef.current = true
          editorRef.current.commands.setContent('<p></p>', { emitUpdate: false })
          clearEditorHistory(editorRef.current)
          setTimeout(() => { isLoadingContentRef.current = false; updateStatusInfo() }, 100)
        }
        if (showPreviewRef.current) {
          setMarkdownContent('')
        }
        return [newDoc]
      }

      // If we closed the active tab, switch to the first remaining
      if (docId === activeDocId) {
        const newActiveDoc = filtered[0]
        setActiveDocId(newActiveDoc.id)
        if (editorRef.current) {
          isLoadingContentRef.current = true
          const html = newActiveDoc.content ? markdownToHtml(newActiveDoc.content) : '<p></p>'
          editorRef.current.commands.setContent(html, { emitUpdate: false })
          clearEditorHistory(editorRef.current)
          setTimeout(() => { isLoadingContentRef.current = false; updateStatusInfo() }, 100)
        }
        if (showPreviewRef.current) {
          setMarkdownContent(newActiveDoc.content)
        }
      }

      return filtered
    })
  }, [activeDocId, markClean, dirtyDocs])

  const handleSwitchTab = useCallback((docId: string) => {
    // Save current document first (only if not already loading)
    if (editorRef.current && !isLoadingContentRef.current) {
      const markdown = exportMarkdown(editorRef.current)
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === activeDocId
            ? { ...doc, content: markdown, lastModified: Date.now() }
            : doc
        )
      )
    }

    // Save scroll position for the current tab
    const container = getEditorScrollContainer(editorRef.current)
    if (container) {
      scrollPositionsRef.current.set(activeDocId, container.scrollTop)
    }

    setActiveDocId(docId)
    const doc = documents.find((d) => d.id === docId)
    if (editorRef.current && doc) {
      isLoadingContentRef.current = true
      const html = doc.content ? markdownToHtml(doc.content) : '<p></p>'
      editorRef.current.commands.setContent(html, { emitUpdate: false })
      clearEditorHistory(editorRef.current)
      if (showPreviewRef.current) {
        setMarkdownContent(doc.content)
      }
      setTimeout(() => {
        isLoadingContentRef.current = false
        updateStatusInfo()
        // Restore scroll position for the target tab
        const el = getEditorScrollContainer(editorRef.current)
        if (el) el.scrollTop = scrollPositionsRef.current.get(docId) ?? 0
      }, 100)
    }
  }, [activeDocId, documents, updateStatusInfo])

  const togglePreview = useCallback(() => {
    setShowPreview((prev) => {
      const next = !prev
      if (next && editorRef.current) {
        setMarkdownContent(exportMarkdown(editorRef.current))
      }
      localStorage.setItem(SHOW_PREVIEW_KEY, String(next))
      return next
    })
  }, [])

  const toggleDocumentMap = useCallback(() => {
    setShowDocumentMap((prev) => {
      const next = !prev
      localStorage.setItem(SHOW_DOCMAP_KEY, String(next))
      return next
    })
  }, [])

  const toggleMarkdownShortcuts = useCallback(() => {
    // Save current editor content before the editor remounts (prevents content loss)
    if (editorRef.current && !isLoadingContentRef.current) {
      const markdown = exportMarkdown(editorRef.current)
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === activeDocIdRef.current
            ? { ...doc, content: markdown, lastModified: Date.now() }
            : doc
        )
      )
    }
    // Reset synchronously so handleEditorReady reloads content on remount
    editorInitializedRef.current = false
    setMarkdownShortcuts((prev) => {
      const next = !prev
      saveMarkdownShortcuts(next)
      showNotification(`Markdown shortcuts: ${next ? 'ON' : 'OFF'}`)
      return next
    })
  }, [showNotification])

  const handleCloseOtherTabs = useCallback(async (keepDocId: string) => {
    const toClose = documents.filter((d) => d.id !== keepDocId)
    for (const doc of toClose) {
      if (dirtyDocs.has(doc.id)) {
        let shouldClose: boolean
        if (isTauri()) {
          const { confirm } = await import('@tauri-apps/plugin-dialog')
          shouldClose = await confirm(`"${doc.filename}" has unsaved changes. Close anyway?`, {
            title: 'Unsaved Changes',
            kind: 'warning',
          })
        } else {
          shouldClose = window.confirm(`"${doc.filename}" has unsaved changes. Close anyway?`)
        }
        if (!shouldClose) continue
      }
      clearFileHandle(doc.id)
      markClean(doc.id)
    }
    const closedIds = toClose.map(d => d.id)
    setFileDeletedDocs((prev) => { const next = new Set(prev); closedIds.forEach(id => next.delete(id)); return next.size === prev.size ? prev : next })
    setFileChangedDocs((prev) => { const next = new Set(prev); closedIds.forEach(id => next.delete(id)); return next.size === prev.size ? prev : next })
    setDocuments((prev) => {
      const remaining = prev.filter((d) => d.id === keepDocId)
      if (remaining.length === 0) return prev
      return remaining
    })
    if (activeDocId !== keepDocId) {
      handleSwitchTab(keepDocId)
    }
  }, [documents, dirtyDocs, activeDocId, markClean, handleSwitchTab])

  const handleCloseAllTabs = useCallback(async () => {
    for (const doc of documents) {
      if (dirtyDocs.has(doc.id)) {
        let shouldClose: boolean
        if (isTauri()) {
          const { confirm } = await import('@tauri-apps/plugin-dialog')
          shouldClose = await confirm(`"${doc.filename}" has unsaved changes. Close anyway?`, {
            title: 'Unsaved Changes',
            kind: 'warning',
          })
        } else {
          shouldClose = window.confirm(`"${doc.filename}" has unsaved changes. Close anyway?`)
        }
        if (!shouldClose) return
      }
      clearFileHandle(doc.id)
      markClean(doc.id)
    }
    setFileDeletedDocs(new Set())
    setFileChangedDocs(new Set())
    const newDoc: Document = {
      id: generateId(),
      filename: 'untitled.md',
      content: '',
      lastModified: Date.now(),
    }
    setDocuments([newDoc])
    setActiveDocId(newDoc.id)
    if (editorRef.current) {
      isLoadingContentRef.current = true
      editorRef.current.commands.setContent('<p></p>', { emitUpdate: false })
      clearEditorHistory(editorRef.current)
      setTimeout(() => { isLoadingContentRef.current = false; updateStatusInfo() }, 100)
    }
    if (showPreviewRef.current) {
      setMarkdownContent('')
    }
  }, [documents, dirtyDocs, markClean, updateStatusInfo])

  const cycleTab = useCallback((direction: 1 | -1) => {
    if (documents.length <= 1) return
    const currentIndex = documents.findIndex((d) => d.id === activeDocId)
    const nextIndex = (currentIndex + direction + documents.length) % documents.length
    handleSwitchTab(documents[nextIndex].id)
  }, [documents, activeDocId, handleSwitchTab])

  // Tab drag-and-drop reorder (pointer events)
  // Use refs so global listeners always see current values without re-registering
  const draggingTabIdRef = useRef<string | null>(null)
  const dragInsertIndexRef = useRef<number | null>(null)

  const handleTabPointerDown = useCallback((e: ReactPointerEvent, docId: string) => {
    if (e.button !== 0) return // left button only
    dragStartRef.current = { x: e.clientX, y: e.clientY, docId }
  }, [])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const startInfo = dragStartRef.current
      if (!startInfo) return

      // Phase 1: not yet dragging, check movement threshold
      if (!draggingTabIdRef.current) {
        const dx = e.clientX - startInfo.x
        const dy = e.clientY - startInfo.y
        if (Math.sqrt(dx * dx + dy * dy) < 5) return
        draggingTabIdRef.current = startInfo.docId
        setDraggingTabId(startInfo.docId)
        setDragPos({ x: e.clientX, y: e.clientY })
        return
      }

      // Phase 2: actively dragging
      setDragPos({ x: e.clientX, y: e.clientY })
      // Calculate insert index from tab positions
      const docs = documentsRef.current
      let insertIdx = docs.length
      for (let i = 0; i < docs.length; i++) {
        const el = tabRefsMap.current.get(docs[i].id)
        if (!el) continue
        const rect = el.getBoundingClientRect()
        const midX = rect.left + rect.width / 2
        if (e.clientX < midX) {
          insertIdx = i
          break
        }
      }
      dragInsertIndexRef.current = insertIdx
      setDragInsertIndex(insertIdx)
    }

    const handlePointerUp = () => {
      const currentDragId = draggingTabIdRef.current
      const currentInsertIdx = dragInsertIndexRef.current
      if (currentDragId && currentInsertIdx !== null) {
        setDocuments((prev) => {
          const fromIndex = prev.findIndex((d) => d.id === currentDragId)
          if (fromIndex < 0) return prev
          // Adjust target: if inserting after the dragged item, account for removal
          let toIndex = currentInsertIdx
          if (fromIndex < toIndex) toIndex--
          if (fromIndex === toIndex) return prev
          const next = [...prev]
          const [moved] = next.splice(fromIndex, 1)
          next.splice(toIndex, 0, moved)
          return next
        })
      }
      dragStartRef.current = null
      draggingTabIdRef.current = null
      dragInsertIndexRef.current = null
      setDraggingTabId(null)
      setDragInsertIndex(null)
      setDragPos(null)
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
  }, []) // stable — reads refs, not state

  const handleReloadFromDisk = useCallback(async (docId: string) => {
    const clearChanged = () => setFileChangedDocs((prev) => {
      if (!prev.has(docId)) return prev
      const next = new Set(prev)
      next.delete(docId)
      return next
    })

    if (isTauri()) {
      const path = getFilePath(docId)
      if (!path) return
      const content = await readFileByPath(path)
      if (content === null) {
        showNotification('Failed to reload file')
        return
      }
      setDocuments((prev) => prev.map((doc) =>
        doc.id === docId ? { ...doc, content, lastModified: Date.now() } : doc
      ))
      if (docId === activeDocIdRef.current && editorRef.current) {
        isLoadingContentRef.current = true
        editorRef.current.commands.setContent(markdownToHtml(content), { emitUpdate: false })
        clearEditorHistory(editorRef.current)
        editorRef.current.chain().setTextSelection(0).focus().run()
        isLoadingContentRef.current = false
        updateStatusInfo()
      }
      markClean(docId)
      clearChanged()
      markRecentlySaved(docId)
      showNotification('Reloaded from disk')
    } else if (hasFileHandle(docId)) {
      const content = await readFromFileHandle(docId)
      if (content === null) {
        showNotification('Failed to reload file')
        return
      }
      setDocuments((prev) => prev.map((doc) =>
        doc.id === docId ? { ...doc, content, lastModified: Date.now() } : doc
      ))
      if (docId === activeDocIdRef.current && editorRef.current) {
        isLoadingContentRef.current = true
        editorRef.current.commands.setContent(markdownToHtml(content), { emitUpdate: false })
        clearEditorHistory(editorRef.current)
        editorRef.current.chain().setTextSelection(0).focus().run()
        isLoadingContentRef.current = false
        updateStatusInfo()
      }
      markClean(docId)
      clearChanged()
      markRecentlySaved(docId)
      showNotification('Reloaded from disk')
    }
  }, [showNotification, markClean, markRecentlySaved, updateStatusInfo])

  const handleTabContextMenu = useCallback((e: ReactMouseEvent, docId: string, filename: string) => {
    e.preventDefault()
    setTabContextMenu({ x: e.clientX, y: e.clientY, docId, filename })
  }, [])

  // Open a markdown file from content (used by drag-and-drop, recent files, and file open)
  // Returns the document ID of the created/updated document.
  const openFileFromContent = useCallback((filename: string, content: string, filePath?: string): string => {
    // If the only tab is a pristine untitled doc, replace it instead of creating a new tab
    const docs = documentsRef.current
    const isPristineUntitled = docs.length === 1
      && docs[0].filename === 'untitled.md'
      && !dirtyDocsRef.current.has(docs[0].id)
      && !hasFileHandle(docs[0].id)
      && (!isTauri() || !getFilePath(docs[0].id))

    if (isPristineUntitled) {
      const docId = docs[0].id
      if (filePath) setFilePath(docId, filePath)
      setDocuments((prev) => prev.map((doc) =>
        doc.id === docId ? { ...doc, filename, content, lastModified: Date.now(), filePath } : doc
      ))
      if (editorRef.current) {
        isLoadingContentRef.current = true
        const html = markdownToHtml(content)
        editorRef.current.commands.setContent(html, { emitUpdate: false })
        clearEditorHistory(editorRef.current)
        editorRef.current.chain().setTextSelection(0).focus().run()
        setTimeout(() => {
          isLoadingContentRef.current = false
          updateStatusInfo()
          const el = getEditorScrollContainer(editorRef.current)
          if (el) el.scrollTop = 0
        }, 100)
      }
      if (showPreviewRef.current) {
        setMarkdownContent(content)
      }
      showNotification(`Opened ${filename}`)
      return docId
    }

    const newDoc: Document = {
      id: generateId(),
      filename,
      content,
      lastModified: Date.now(),
      filePath,
    }
    if (filePath) setFilePath(newDoc.id, filePath)
    setDocuments((prev) => [...prev, newDoc])
    setActiveDocId(newDoc.id)
    if (editorRef.current) {
      isLoadingContentRef.current = true
      const html = markdownToHtml(content)
      editorRef.current.commands.setContent(html, { emitUpdate: false })
      clearEditorHistory(editorRef.current)
      editorRef.current.chain().setTextSelection(0).focus().run()
      setTimeout(() => {
        isLoadingContentRef.current = false
        updateStatusInfo()
        const el = getEditorScrollContainer(editorRef.current)
        if (el) el.scrollTop = 0
      }, 100)
    }
    if (showPreviewRef.current) {
      setMarkdownContent(content)
    }
    showNotification(`Opened ${filename}`)
    return newDoc.id
  }, [updateStatusInfo, showNotification])

  const handleOpen = useCallback(async () => {
    const result = await openMarkdownFile()
    if (!result) return

    const docId = openFileFromContent(result.filename, result.content, result.filePath)

    // Store file handle for future saves (web File System Access API)
    if (result.fileHandle) {
      setFileHandle(docId, result.fileHandle)
    }
    // Detect line endings for round-trip fidelity
    setDocumentLineEnding(docId, result.content)
    markClean(docId)

    // Track in recent files (Tauri only — web doesn't have persistent paths)
    if (result.filePath) {
      setRecentFiles(addRecentFile(result.filePath))
    }
  }, [openFileFromContent, markClean])

  // Listen for single-instance event (second instance passes its file to us)
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<{ args: string[]; cwd: string }>('single-instance', async (event) => {
        const { args, cwd } = event.payload
        // Find first .md/.markdown arg (skip argv[0] which is the exe path)
        const filePath = args.slice(1).find(a => {
          const lower = a.toLowerCase()
          return lower.endsWith('.md') || lower.endsWith('.markdown')
        })
        if (!filePath) return
        // Resolve relative paths against cwd
        const fullPath = filePath.match(/^[a-zA-Z]:[\\/]|^\//) ? filePath
          : cwd.replace(/[\\/]$/, '') + '/' + filePath
        const content = await readFileByPath(fullPath)
        if (content === null) return
        const filename = fullPath.split(/[/\\]/).pop() || 'document.md'
        openFileFromContent(filename, content, fullPath)
        setDocumentLineEnding(fullPath, content)
        setRecentFiles(addRecentFile(fullPath))
      }).then(fn => { unlisten = fn })
    })
    return () => { unlisten?.() }
  }, [openFileFromContent])

  // Menu action dispatcher
  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'file.new': handleNewTab(); break
      case 'file.open': handleOpen(); break
      case 'file.save': handleSave(); break
      case 'file.saveAs': handleSaveAs(); break
      case 'file.reload': handleReloadFromDisk(activeDocIdRef.current); break
      case 'file.exportHtml': handleExportHtml(); break
      case 'file.print': window.print(); break
      case 'file.closeTab': handleCloseTab(activeDocId); break
      case 'file.closeOtherTabs': handleCloseOtherTabs(activeDocId); break
      case 'file.closeAll': handleCloseAllTabs(); break
      case 'file.exit':
        if (isTauri()) {
          import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
            getCurrentWindow().close()
          })
        } else {
          window.close()
        }
        break
      case 'edit.undo': editorRef.current?.chain().focus().undo().run(); break
      case 'edit.redo': editorRef.current?.chain().focus().redo().run(); break
      case 'edit.cut': document.execCommand('cut'); break
      case 'edit.copy': document.execCommand('copy'); break
      case 'edit.paste': readClipboardText().then(text => {
        editorRef.current?.chain().focus().insertContent(text).run()
      }).catch(() => {}); break
      case 'edit.pasteMarkdown': pasteAsMarkdown().then(html => {
        if (html) editorRef.current?.chain().focus().insertContent(html).run()
      }); break
      case 'edit.find': setSearchBarMode((prev) => prev === 'find' ? null : 'find'); break
      case 'edit.findReplace': setSearchBarMode((prev) => prev === 'findReplace' ? null : 'findReplace'); break
      case 'edit.copyMarkdown': handleCopy(); break
      case 'edit.copyHtml': handleCopyHtml(); break
      case 'edit.copyPlainText': handleCopyPlainText(); break
      case 'view.togglePreview': togglePreview(); break
      case 'options.toggleShortcuts': toggleMarkdownShortcuts(); break
      case 'view.toggleDocumentMap': toggleDocumentMap(); break
      case 'view.zoomIn': zoomIn(); break
      case 'view.zoomOut': zoomOut(); break
      case 'view.zoomReset': setZoom(100); localStorage.setItem(ZOOM_KEY, '100'); break
      case 'view.theme.light': setTheme('light'); showNotification('Theme: light'); break
      case 'view.theme.dark': setTheme('dark'); showNotification('Theme: dark'); break
      case 'view.theme.system': setTheme('system'); showNotification('Theme: system'); break
      case 'options.toggleAutoSave':
        setAutoSaveToFile((prev) => {
          const next = !prev
          localStorage.setItem(AUTO_SAVE_FILE_KEY, String(next))
          showNotification(`Auto-save to file: ${next ? 'ON' : 'OFF'}`)
          return next
        })
        break
      case 'options.toggleRestoreSession':
        setRestoreSession((prev) => {
          const next = !prev
          localStorage.setItem(RESTORE_SESSION_KEY, String(next))
          showNotification(`Restore previous session: ${next ? 'ON' : 'OFF'}`)
          return next
        })
        break
      case 'help.shortcuts': setShowShortcutsDialog(true); break
      case 'help.userGuide': setShowUserGuideDialog(true); break
      case 'help.about': setShowAboutDialog(true); break
      case 'noop': break
      case 'file.clearRecent':
        setRecentFiles(clearRecentFiles())
        break
      default:
if (action.startsWith('file.openRecent:')) {
          const path = action.slice('file.openRecent:'.length)
          if (isTauri()) {
            readFileByPath(path).then((content) => {
              if (content !== null) {
                const filename = path.split(/[/\\]/).pop() || 'document.md'
                openFileFromContent(filename, content, path)
                setRecentFiles(addRecentFile(path))
              } else {
                showNotification('Failed to open file')
              }
            })
          }
        }
        break
    }
  }, [activeDocId, handleNewTab, handleOpen, handleSave, handleSaveAs, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleCopy, togglePreview, toggleDocumentMap, toggleMarkdownShortcuts, setTheme, showNotification, openFileFromContent, zoomIn, zoomOut])

  const handleStartRename = useCallback((docId: string, currentFilename: string) => {
    setEditingTabId(docId)
    setEditingFilename(currentFilename)
  }, [])

  const handleFinishRename = useCallback(() => {
    if (editingTabId && editingFilename.trim()) {
      let filename = editingFilename.trim()
      // Ensure .md extension
      if (!filename.toLowerCase().endsWith('.md')) {
        filename += '.md'
      }
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === editingTabId
            ? { ...doc, filename }
            : doc
        )
      )
    }
    setEditingTabId(null)
    setEditingFilename('')
  }, [editingTabId, editingFilename])

  const handleRenameKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFinishRename()
    } else if (e.key === 'Escape') {
      setEditingTabId(null)
      setEditingFilename('')
    }
  }, [handleFinishRename])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // F1 for keyboard shortcuts
      if (e.key === 'F1') {
        e.preventDefault()
        setShowShortcutsDialog(true)
        return
      }

      // F5 for reload from disk
      if (e.key === 'F5') {
        e.preventDefault()
        handleReloadFromDisk(activeDocIdRef.current)
        return
      }

      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault()
          handleNewTab()
          break
        case 'o':
          e.preventDefault()
          handleOpen()
          break
        case 'c':
          if (e.shiftKey) {
            e.preventDefault()
            handleCopyPlainText()
          }
          break
        case 'v':
          if (e.shiftKey) {
            e.preventDefault()
            pasteAsMarkdown().then(html => {
              if (html) editorRef.current?.chain().focus().insertContent(html).run()
            })
          }
          break
        case 's':
          e.preventDefault()
          if (e.shiftKey) {
            handleSaveAs()
          } else {
            handleSave()
          }
          break
        case 'w':
          e.preventDefault()
          handleCloseTab(activeDocIdRef.current)
          break
        case 'p':
          e.preventDefault()
          window.print()
          break
        case 'm':
          e.preventDefault()
          togglePreview()
          break
        case 'd':
          e.preventDefault()
          toggleDocumentMap()
          break
        case 'f':
          e.preventDefault()
          setSearchBarMode((prev) => prev === 'find' ? null : 'find')
          break
        case 'h':
          e.preventDefault()
          setSearchBarMode((prev) => prev === 'findReplace' ? null : 'findReplace')
          break
        case 'tab':
          e.preventDefault()
          cycleTab(e.shiftKey ? -1 : 1)
          break
        case 'pagedown':
          if (ctrl) {
            e.preventDefault()
            cycleTab(1)
          }
          break
        case 'pageup':
          if (ctrl) {
            e.preventDefault()
            cycleTab(-1)
          }
          break
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
        case '0':
          e.preventDefault()
          setZoom(100); localStorage.setItem(ZOOM_KEY, '100')
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleNewTab, handleOpen, handleSave, handleSaveAs, handleCloseTab, cycleTab, zoomIn, zoomOut, togglePreview, toggleDocumentMap, handleReloadFromDisk, handleCopyPlainText])

  // Escape from toolbar / status bar / tabs → focus editor
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Only act when focus is outside the editor's ProseMirror contenteditable
      const active = document.activeElement
      if (active && active.closest('.ProseMirror')) return
      // Don't interfere with dialogs or dropdown menus (they handle Escape themselves)
      if (active && active.closest('[role="dialog"]')) return
      editorRef.current?.commands.focus()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Ctrl+Scrollwheel zoom
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      if (e.deltaY < 0) {
        zoomIn()
      } else if (e.deltaY > 0) {
        zoomOut()
      }
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [zoomIn, zoomOut])

  // Watch ALL open documents for external file changes.
  // Builds a watcher for each document that has a file path (Tauri) or file handle (web).
  // When a change is detected, the doc ID is added to fileChangedDocs.
  // The tab badge (dot) shows for any changed doc; the info bar shows for the active doc.
  // Watch ALL open documents for external file changes.
  // Depends on documents (for file paths) and isRestoringSession (to defer until restore completes).
  // Uses getFilePath() for Tauri and hasFileHandle() for web to check if a watcher can be set up.
  const docFilePaths = documents.map((d) => d.filePath).join('\0')
  useEffect(() => {
    // Don't set up watchers while session is still restoring (file paths not yet registered)
    if (isRestoringSession) return

    let cancelled = false
    const cleanups: (() => void)[] = []

    for (const doc of documentsRef.current) {
      const docId = doc.id

      const onFileEvent = (event: { kind: 'changed' | 'removed' }) => {
        if (cancelled) return
        if (recentlySavedRef.current.has(docId)) return

        if (event.kind === 'removed') {
          const confirmAndMarkDeleted = () => {
            setFileDeletedDocs((prev) => {
              if (prev.has(docId)) return prev
              const next = new Set(prev)
              next.add(docId)
              return next
            })
            // Clear any stale "changed" state
            setFileChangedDocs((prev) => {
              if (!prev.has(docId)) return prev
              const next = new Set(prev)
              next.delete(docId)
              return next
            })
          }

          if (isTauri()) {
            // Confirm deletion after brief delay (atomic saves briefly delete)
            const path = getFilePath(docId)
            if (path) {
              setTimeout(async () => {
                if (cancelled) return
                if (recentlySavedRef.current.has(docId)) return
                const stillExists = await fileExists(path)
                if (!stillExists) {
                  confirmAndMarkDeleted()
                  // Poll for recreation since native watcher may stop
                  const stopPoll = pollFileRecreation(path, () => {
                    if (cancelled) return
                    setFileDeletedDocs((prev) => {
                      if (!prev.has(docId)) return prev
                      const next = new Set(prev)
                      next.delete(docId)
                      return next
                    })
                    setFileChangedDocs((prev) => {
                      if (prev.has(docId)) return prev
                      const next = new Set(prev)
                      next.add(docId)
                      return next
                    })
                  })
                  cleanups.push(stopPoll)
                }
              }, 500)
            }
          } else {
            confirmAndMarkDeleted()
          }
        } else {
          // File changed (or was recreated after deletion)
          setFileDeletedDocs((prev) => {
            if (!prev.has(docId)) return prev
            const next = new Set(prev)
            next.delete(docId)
            return next
          })
          setFileChangedDocs((prev) => {
            if (prev.has(docId)) return prev
            const next = new Set(prev)
            next.add(docId)
            return next
          })
        }
      }

      if (isTauri()) {
        const path = getFilePath(docId)
        if (path) {
          const cell: { unwatch: (() => void) | null } = { unwatch: null }
          watchFilePath(path, onFileEvent).then((fn) => {
            if (cancelled) {
              fn?.()
            } else {
              cell.unwatch = fn
              cleanups.push(() => cell.unwatch?.())
            }
          })
        }
      } else if (hasFileHandle(docId)) {
        const cleanup = watchFileHandle(docId, onFileEvent)
        if (cleanup) cleanups.push(cleanup)
      }
    }

    return () => {
      cancelled = true
      cleanups.forEach((fn) => fn())
    }
  }, [docFilePaths, isRestoringSession]) // Re-run when file paths change or session restore completes

  // Window title: show current filename (with dirty indicator)
  useEffect(() => {
    const rawPath = activeDoc?.filePath
    // Strip Windows extended-length prefix (\\?\) produced by Rust canonicalize / Tauri dialogs
    const cleanPath = rawPath?.startsWith('\\\\?\\') ? rawPath.slice(4) : rawPath
    const displayName = isTauri() && cleanPath
      ? cleanPath
      : (activeDoc?.filename || 'untitled.md')
    const title = `${dirtyDocs.has(activeDocId) ? '* ' : ''}${displayName} - WYSIWYG Markdown`
    document.title = title
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTitle(title)
      }).catch(() => {})
    }
  }, [activeDoc?.filename, activeDoc?.filePath, activeDocId, dirtyDocs])

  // Warn before browser/tab close with unsaved changes (browser only — Tauri uses onCloseRequested)
  useEffect(() => {
    if (isTauri()) return
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyDocsRef.current.size > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Sync dirty-doc state to Rust so the native close handler knows whether to show a confirmation dialog
  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_unsaved_changes', { hasUnsaved: dirtyDocs.size > 0 }).catch(() => {})
    })
  }, [dirtyDocs])

  // Drag-and-drop file opening
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear when leaving the root element (not entering a child)
    if (e.currentTarget === e.target) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const mdFiles = files.filter((f) => /\.(md|markdown)$/i.test(f.name))

    for (const file of mdFiles) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        if (content != null) {
          openFileFromContent(file.name, content)
        }
      }
      reader.readAsText(file)
    }
  }, [openFileFromContent])

  return (
    <div
      className="h-screen flex flex-col overflow-hidden bg-gray-100 dark:bg-gray-900 transition-colors relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Menu Bar */}
      <header className="flex-shrink-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <AppMenuBar
          menuState={{
            showPreview,
            markdownShortcuts,
            showDocumentMap,
            theme,
            canUndo,
            canRedo,
            recentFiles,
            autoSaveToFile,
            restorePreviousSession: restoreSession,
            isTauriApp: isTauri(),
          } satisfies MenuState}
          onAction={handleMenuAction}
          focusEditor={() => editorRef.current?.commands.focus()}
        />
      </header>

      {/* Tabs */}
      <div className="flex-shrink-0 z-30 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
        <div className="px-4">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {/* Toolbar buttons */}
            <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-gray-300 dark:border-gray-500 flex-shrink-0">
              <button
                onClick={handleNewTab}
                className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="New (Ctrl+N)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </button>
              <button
                onClick={handleOpen}
                className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="Open (Ctrl+O)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button
                onClick={handleSave}
                className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="Save (Ctrl+S)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </button>
              <button
                onClick={() => handleCloseTab(activeDocId)}
                className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="Close Tab (Ctrl+W)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <button
                onClick={handleCloseAllTabs}
                className="p-1 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                title="Close All Tabs"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="17" y1="5" x2="7" y2="15" />
                  <line x1="7" y1="5" x2="17" y2="15" />
                  <line x1="17" y1="12" x2="7" y2="22" />
                  <line x1="7" y1="12" x2="17" y2="22" />
                </svg>
              </button>
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-500 mx-0.5" />
              <button
                onClick={togglePreview}
                className={`p-1 rounded ${showPreview ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title="Markdown Preview (Ctrl+M)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button
                onClick={toggleDocumentMap}
                className={`p-1 rounded ${showDocumentMap ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                title="Document Map (Ctrl+D)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="15" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {documents.map((doc, idx) => (
              <Fragment key={doc.id}>
                {/* Drop indicator before this tab */}
                {draggingTabId && dragInsertIndex === idx && draggingTabId !== doc.id && (
                  (() => {
                    const fromIdx = documents.findIndex(d => d.id === draggingTabId)
                    // Don't show indicator right after the dragged tab (no-op position)
                    return fromIdx !== idx - 1 ? (
                      <div className="w-0.5 h-6 bg-blue-500 rounded flex-shrink-0 -mx-0.5" />
                    ) : null
                  })()
                )}
                <div
                  ref={(el) => { if (el) tabRefsMap.current.set(doc.id, el); else tabRefsMap.current.delete(doc.id) }}
                  className={`flex items-center gap-1 px-3 py-1 rounded-t text-sm cursor-pointer transition-colors select-none ${
                    draggingTabId === doc.id ? 'opacity-40' : ''
                  } ${
                    doc.id === activeDocId
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border-t border-l border-r border-gray-200 dark:border-gray-600'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                  onClick={() => { if (!draggingTabId) handleSwitchTab(doc.id) }}
                  onPointerDown={(e) => handleTabPointerDown(e, doc.id)}
                  onMouseDown={(e) => {
                    // Middle-click to close
                    if (e.button === 1) {
                      e.preventDefault()
                      handleCloseTab(doc.id)
                    }
                  }}
                  onContextMenu={(e) => handleTabContextMenu(e, doc.id, doc.filename)}
                >
                  {editingTabId === doc.id ? (
                    <input
                      type="text"
                      value={editingFilename}
                      onChange={(e) => setEditingFilename(e.target.value)}
                      onBlur={handleFinishRename}
                      onKeyDown={handleRenameKeyDown}
                      onClick={(e) => e.stopPropagation()}
                      className="max-w-[150px] px-1 py-0.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-blue-500 rounded outline-none"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="max-w-[150px] truncate"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(doc.id, doc.filename)
                      }}
                      title="Double-click to rename"
                    >
                      {dirtyDocs.has(doc.id) ? '* ' : ''}{doc.filename}
                    </span>
                  )}
                  {fileDeletedDocs.has(doc.id) ? (
                    <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" title="File deleted from disk" />
                  ) : fileChangedDocs.has(doc.id) ? (
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" title="File changed on disk" />
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCloseTab(doc.id)
                    }}
                    className="ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    ×
                  </button>
                </div>
                {/* Drop indicator after the last tab */}
                {draggingTabId && dragInsertIndex === idx + 1 && idx === documents.length - 1 && (
                  (() => {
                    const fromIdx = documents.findIndex(d => d.id === draggingTabId)
                    return fromIdx !== documents.length - 1 ? (
                      <div className="w-0.5 h-6 bg-blue-500 rounded flex-shrink-0 -mx-0.5" />
                    ) : null
                  })()
                )}
              </Fragment>
            ))}
            <button
              onClick={handleNewTab}
              className="px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-lg"
              title="New tab"
            >
              +
            </button>
            {/* Floating tab clone while dragging */}
            {draggingTabId && dragPos && (() => {
              const dragDoc = documents.find(d => d.id === draggingTabId)
              return dragDoc ? (
                <div
                  className="fixed z-50 flex items-center gap-1 px-3 py-1 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-blue-400 shadow-lg pointer-events-none select-none"
                  style={{ left: dragPos.x + 12, top: dragPos.y - 12 }}
                >
                  <span className="max-w-[150px] truncate">
                    {dirtyDocs.has(dragDoc.id) ? '* ' : ''}{dragDoc.filename}
                  </span>
                </div>
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* Tab context menu */}
      {tabContextMenu && (
        <TabContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          docId={tabContextMenu.docId}
          filename={tabContextMenu.filename}
          onClose={() => setTabContextMenu(null)}
          onCloseTab={handleCloseTab}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseAllTabs={handleCloseAllTabs}
          onReload={handleReloadFromDisk}
          canReload={isTauri() ? !!getFilePath(tabContextMenu.docId) : hasFileHandle(tabContextMenu.docId)}
          onRename={handleStartRename}
        />
      )}

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/20 backdrop-blur-sm pointer-events-none">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl px-12 py-8 border-2 border-dashed border-blue-500">
            <p className="text-xl font-semibold text-blue-600 dark:text-blue-400">Drop .md file to open</p>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed top-16 right-4 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-800 px-4 py-2 rounded shadow-lg z-50">
          {notification}
        </div>
      )}

      {/* Main content with optional document map */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Document Map */}
        {showDocumentMap && (
          <DocumentMap
            // DocumentMap only touches `editor` inside effects/handlers
            // (subscriptions), never during its own render, so a stale
            // reference here is not the same risk as the canUndo/canRedo
            // case above -- it's a reference hand-off, not a value computed
            // fresh from the ref every render.
            // eslint-disable-next-line react-hooks/refs
            editor={editorRef.current}
            onClose={() => { setShowDocumentMap(false); localStorage.setItem(SHOW_DOCMAP_KEY, 'false') }}
            activeDocId={activeDocId}
          />
        )}

        <main className="flex-1 min-h-0 flex flex-col">
          <div className={`flex-1 min-h-0 px-4 py-2 flex flex-col ${showPreview ? 'max-w-[95%]' : 'max-w-7xl'} mx-auto w-full`}>
          {/* File deleted from disk — inline warning bar */}
          {fileDeletedDocs.has(activeDocId) && (
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-700 dark:text-amber-300 mb-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              <span className="flex-1">{activeDoc?.filename || 'File'} has been deleted from disk</span>
              <button
                onClick={handleSaveAs}
                className="px-2 py-0.5 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
              >
                Save As
              </button>
              <button
                onClick={() => setFileDeletedDocs((prev) => { const next = new Set(prev); next.delete(activeDocId); return next })}
                className="text-amber-400 hover:text-amber-600 dark:hover:text-amber-200"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          {/* File changed on disk — inline info bar */}
          {fileChangedDocs.has(activeDocId) && (
            <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md text-sm text-blue-700 dark:text-blue-300 mb-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
              <span className="flex-1">{activeDoc?.filename || 'File'} has been modified externally</span>
              <button
                onClick={() => handleReloadFromDisk(activeDocId)}
                className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                Reload
              </button>
              <button
                onClick={() => setFileChangedDocs((prev) => { const next = new Set(prev); next.delete(activeDocId); return next })}
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                title="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
          {isRestoringSession ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <span className="text-sm">Restoring session...</span>
            </div>
          ) : (
          <div className={`flex-1 min-h-0 grid gap-4 ${showPreview ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* Editor */}
            <div className="min-h-0 flex flex-col">
              <Editor
                key={`editor-${markdownShortcuts}`}
                onUpdate={handleUpdate}
                onEditorReady={handleEditorReady}
                markdownShortcuts={markdownShortcuts}
                showSearchBar={searchBarMode !== null}
                onToggleFind={() => setSearchBarMode((prev) => prev === 'find' ? null : 'find')}
                onCloseSearchBar={() => setSearchBarMode(null)}
                initialShowReplace={searchBarMode === 'findReplace'}
                zoom={zoom}
              />
            </div>

            {/* Markdown Preview */}
            {showPreview && (
              <div className="min-h-0 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm">
                <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-4 py-[11px] flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Markdown Output</h2>
                  <button
                    onClick={() => { setShowPreview(false); localStorage.setItem(SHOW_PREVIEW_KEY, 'false') }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1"
                    title="Close preview"
                  >
                    ×
                  </button>
                </div>
                <pre className="flex-1 min-h-0 p-4 text-sm font-mono text-gray-800 dark:text-gray-200 overflow-y-auto whitespace-pre-wrap">
                  {markdownContent || '(empty)'}
                </pre>
              </div>
            )}
          </div>
          )}
          </div>
        </main>
      </div>

      {/* Status bar */}
      <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 h-7 flex items-center z-10">
        <div className="px-4 w-full flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-3">
            <span>{statusInfo.words} {statusInfo.words === 1 ? 'word' : 'words'}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span>{statusInfo.chars} {statusInfo.chars === 1 ? 'character' : 'characters'}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMarkdownShortcuts}
              className={`hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer ${markdownShortcuts ? 'text-green-600 dark:text-green-400' : ''}`}
              title={`Markdown Shortcuts: ${markdownShortcuts ? 'ON' : 'OFF'} (click to toggle)`}
            >
              MD {markdownShortcuts ? 'ON' : 'OFF'}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button
              onClick={() => handleMenuAction('options.toggleAutoSave')}
              className={`hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer ${autoSaveToFile ? 'text-green-600 dark:text-green-400' : ''}`}
              title={`Auto-save to File: ${autoSaveToFile ? 'ON' : 'OFF'} (click to toggle)`}
            >
              Auto-save {autoSaveToFile ? 'ON' : 'OFF'}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="flex items-center gap-1">
              <button onClick={zoomOut} className="hover:text-gray-700 dark:hover:text-gray-200 px-0.5">-</button>
              <button
                onClick={() => { setZoom(100); localStorage.setItem(ZOOM_KEY, '100') }}
                className={`min-w-[36px] text-center hover:text-gray-700 dark:hover:text-gray-200 ${zoom !== 100 ? 'font-medium' : ''}`}
                title="Reset zoom to 100%"
              >
                {zoom}%
              </button>
              <button onClick={zoomIn} className="hover:text-gray-700 dark:hover:text-gray-200 px-0.5">+</button>
            </span>
            {dirtyDocs.has(activeDocId) && (
              <>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span className="text-amber-500 dark:text-amber-400">Modified</span>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog
        isOpen={showShortcutsDialog}
        onClose={() => setShowShortcutsDialog(false)}
      />

      {/* User guide dialog */}
      <UserGuideDialog
        isOpen={showUserGuideDialog}
        onClose={() => setShowUserGuideDialog(false)}
      />

      {/* About dialog */}
      {showAboutDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAboutDialog(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[360px]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">WYSIWYG Markdown</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Version {packageJson.version}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              A modern WYSIWYG markdown editor built with React, TipTap, and Tailwind CSS.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              Runs as a web app or Tauri desktop app.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowAboutDialog(false)}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
