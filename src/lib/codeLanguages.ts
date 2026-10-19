import { common } from 'lowlight'
import powershell from 'highlight.js/lib/languages/powershell'

// Grammars available to code blocks: lowlight's `common` set plus extras.
// Shared by the editor's highlighter and the menu's language dropdown so the
// two can't drift apart.
export const codeGrammars = { ...common, powershell }
