import { describe, it, expect, vi, afterEach } from 'vitest'
import { openExternalUrl } from './tauri'

describe('openExternalUrl (web build)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('opens http(s), mailto and tel links in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await openExternalUrl('https://example.com/a?b=1')
    await openExternalUrl('mailto:someone@example.com')
    expect(open.mock.calls).toEqual([
      ['https://example.com/a?b=1', '_blank', 'noopener,noreferrer'],
      ['mailto:someone@example.com', '_blank', 'noopener,noreferrer'],
    ])
  })

  it('ignores other schemes and relative hrefs', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await openExternalUrl('javascript:alert(1)')
    await openExternalUrl('file:///etc/passwd')
    await openExternalUrl('other.md')
    await openExternalUrl('#heading')
    expect(open).not.toHaveBeenCalled()
  })
})
