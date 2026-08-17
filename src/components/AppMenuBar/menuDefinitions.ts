export interface MenuAction {
  type: 'action'
  label: string
  shortcut?: string
  action: string  // action key, resolved by App
  disabled?: boolean
}

export interface MenuToggle {
  type: 'toggle'
  label: string
  shortcut?: string
  action: string
  checked: boolean
}

export interface MenuSubmenu {
  type: 'submenu'
  label: string
  items: MenuItem[]
}

export interface MenuDivider {
  type: 'divider'
}

export type MenuItem = MenuAction | MenuToggle | MenuSubmenu | MenuDivider

export interface MenuDefinition {
  label: string
  accelerator?: string  // Alt key letter
  items: MenuItem[]
}

export interface MenuState {
  showPreview: boolean
  markdownShortcuts: boolean
  showDocumentMap: boolean
  theme: 'light' | 'dark' | 'system'
  canUndo: boolean
  canRedo: boolean
  recentFiles: string[]
  autoSaveToFile: boolean
  restorePreviousSession: boolean
  isTauriApp: boolean
}

export function buildMenus(state: MenuState): MenuDefinition[] {
  return [
    {
      label: 'File',
      accelerator: 'F',
      items: [
        { type: 'action', label: 'New', shortcut: 'Ctrl+N', action: 'file.new' },
        { type: 'action', label: 'Open...', shortcut: 'Ctrl+O', action: 'file.open' },
        {
          type: 'submenu',
          label: 'Open Recent',
          items: state.recentFiles.length > 0
            ? [
                ...state.recentFiles.map((path): MenuAction => ({
                  type: 'action',
                  label: path.split(/[/\\]/).pop() || path,
                  action: `file.openRecent:${path}`,
                })),
                { type: 'divider' },
                { type: 'action', label: 'Clear Recent', action: 'file.clearRecent' },
              ]
            : [{ type: 'action', label: '(No recent files)', action: 'noop', disabled: true }],
        },
        { type: 'divider' },
        { type: 'action', label: 'Save', shortcut: 'Ctrl+S', action: 'file.save' },
        { type: 'action', label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: 'file.saveAs' },
        { type: 'action', label: 'Export as HTML...', action: 'file.exportHtml' },
        { type: 'action', label: 'Reload from Disk', shortcut: 'F5', action: 'file.reload' },
        { type: 'divider' },
        { type: 'action', label: 'Print...', shortcut: 'Ctrl+P', action: 'file.print' },
        { type: 'divider' },
        { type: 'action', label: 'Close Tab', shortcut: 'Ctrl+W', action: 'file.closeTab' },
        { type: 'action', label: 'Close Other Tabs', action: 'file.closeOtherTabs' },
        { type: 'action', label: 'Close All', action: 'file.closeAll' },
        { type: 'divider' },
        { type: 'action', label: 'Exit', shortcut: 'Alt+F4', action: 'file.exit' },
      ],
    },
    {
      label: 'Edit',
      accelerator: 'E',
      items: [
        { type: 'action', label: 'Undo', shortcut: 'Ctrl+Z', action: 'edit.undo', disabled: !state.canUndo },
        { type: 'action', label: 'Redo', shortcut: 'Ctrl+Y', action: 'edit.redo', disabled: !state.canRedo },
        { type: 'divider' },
        { type: 'action', label: 'Cut', shortcut: 'Ctrl+X', action: 'edit.cut' },
        { type: 'action', label: 'Copy', shortcut: 'Ctrl+C', action: 'edit.copy' },
        { type: 'action', label: 'Paste', shortcut: 'Ctrl+V', action: 'edit.paste' },
        { type: 'action', label: 'Paste as Markdown', shortcut: 'Ctrl+Shift+V', action: 'edit.pasteMarkdown' },
        { type: 'divider' },
        { type: 'action', label: 'Find', shortcut: 'Ctrl+F', action: 'edit.find' },
        { type: 'action', label: 'Find & Replace', shortcut: 'Ctrl+H', action: 'edit.findReplace' },
        { type: 'divider' },
        { type: 'action', label: 'Copy as Markdown', action: 'edit.copyMarkdown' },
        { type: 'action', label: 'Copy as HTML', action: 'edit.copyHtml' },
        { type: 'action', label: 'Copy as Plain Text', shortcut: 'Ctrl+Shift+C', action: 'edit.copyPlainText' },
      ],
    },
    {
      label: 'View',
      accelerator: 'V',
      items: [
        { type: 'toggle', label: 'Markdown Preview', shortcut: 'Ctrl+M', checked: state.showPreview, action: 'view.togglePreview' },
        { type: 'toggle', label: 'Document Map', shortcut: 'Ctrl+D', checked: state.showDocumentMap, action: 'view.toggleDocumentMap' },
        { type: 'divider' },
        { type: 'action', label: 'Zoom In', shortcut: 'Ctrl+=', action: 'view.zoomIn' },
        { type: 'action', label: 'Zoom Out', shortcut: 'Ctrl+-', action: 'view.zoomOut' },
        { type: 'action', label: 'Reset Zoom', shortcut: 'Ctrl+0', action: 'view.zoomReset' },
        { type: 'divider' },
        {
          type: 'submenu',
          label: 'Theme',
          items: [
            { type: 'toggle', label: 'Light', checked: state.theme === 'light', action: 'view.theme.light' },
            { type: 'toggle', label: 'Dark', checked: state.theme === 'dark', action: 'view.theme.dark' },
            { type: 'toggle', label: 'System', checked: state.theme === 'system', action: 'view.theme.system' },
          ],
        },
      ],
    },
    {
      label: 'Options',
      accelerator: 'O',
      items: [
        { type: 'toggle', label: 'Markdown Shortcuts', checked: state.markdownShortcuts, action: 'options.toggleShortcuts' },
        { type: 'divider' },
        { type: 'toggle', label: 'Auto-save to File', checked: state.autoSaveToFile, action: 'options.toggleAutoSave' },
        ...(state.isTauriApp ? [
          { type: 'toggle' as const, label: 'Restore Previous Session', checked: state.restorePreviousSession, action: 'options.toggleRestoreSession' },
        ] : []),
      ],
    },
    {
      label: 'Help',
      accelerator: 'H',
      items: [
        { type: 'action', label: 'Keyboard Shortcuts', shortcut: 'F1', action: 'help.shortcuts' },
        { type: 'action', label: 'User Guide', action: 'help.userGuide' },
        { type: 'divider' },
        { type: 'action', label: 'About', action: 'help.about' },
      ],
    },
  ]
}
