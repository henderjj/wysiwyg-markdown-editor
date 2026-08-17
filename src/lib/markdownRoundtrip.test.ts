import { describe, it, expect } from 'vitest'
import { markdownToHtml, ESCAPABLE_PUNCTUATION } from './markdownParser'
import { htmlToMarkdown } from './markdown'

/** Convert markdown → HTML → markdown */
function roundtrip(md: string): string {
  return htmlToMarkdown(markdownToHtml(md))
}

// ─── markdownToHtml ─────────────────────────────────────────────────────────

describe('markdownToHtml', () => {
  describe('headings', () => {
    it('h1', () => {
      expect(markdownToHtml('# Hello')).toBe('<h1>Hello</h1>')
    })
    it('h2', () => {
      expect(markdownToHtml('## Hello')).toBe('<h2>Hello</h2>')
    })
    it('h3', () => {
      expect(markdownToHtml('### Hello')).toBe('<h3>Hello</h3>')
    })
    it('h4', () => {
      expect(markdownToHtml('#### Hello')).toBe('<h4>Hello</h4>')
    })
    it('h5', () => {
      expect(markdownToHtml('##### Hello')).toBe('<h5>Hello</h5>')
    })
    it('h6', () => {
      expect(markdownToHtml('###### Hello')).toBe('<h6>Hello</h6>')
    })
    it('heading with inline formatting', () => {
      expect(markdownToHtml('## **Bold** heading')).toBe('<h2><strong>Bold</strong> heading</h2>')
    })
  })

  describe('paragraphs', () => {
    it('single paragraph', () => {
      expect(markdownToHtml('Hello world')).toBe('<p>Hello world</p>')
    })
    it('two paragraphs separated by blank line', () => {
      expect(markdownToHtml('First\n\nSecond')).toBe('<p>First</p>\n<p>Second</p>')
    })
  })

  describe('inline formatting', () => {
    it('bold with **', () => {
      expect(markdownToHtml('**bold**')).toBe('<p><strong>bold</strong></p>')
    })
    it('bold with __', () => {
      expect(markdownToHtml('__bold__')).toBe('<p><strong>bold</strong></p>')
    })
    it('italic with *', () => {
      expect(markdownToHtml('*italic*')).toBe('<p><em>italic</em></p>')
    })
    it('italic with _', () => {
      expect(markdownToHtml('_italic_')).toBe('<p><em>italic</em></p>')
    })
    it('strikethrough', () => {
      expect(markdownToHtml('~~struck~~')).toBe('<p><s>struck</s></p>')
    })
    it('inline code', () => {
      expect(markdownToHtml('`code`')).toBe('<p><code>code</code></p>')
    })
    it('double backtick code with inner backtick', () => {
      expect(markdownToHtml('`` `inner` ``')).toBe('<p><code>`inner`</code></p>')
    })
    it('combined bold and italic', () => {
      // Regex parser produces slightly misnested HTML that browsers normalize
      expect(markdownToHtml('***bold italic***')).toBe('<p><strong><em>bold italic</strong></em></p>')
    })
  })

  describe('links and images', () => {
    it('link', () => {
      expect(markdownToHtml('[text](https://example.com)')).toBe(
        '<p><a href="https://example.com">text</a></p>'
      )
    })
    it('image', () => {
      expect(markdownToHtml('![alt](https://example.com/img.png)')).toBe(
        '<p><img src="https://example.com/img.png" alt="alt"></p>'
      )
    })
    it('image with empty alt', () => {
      expect(markdownToHtml('![](https://example.com/img.png)')).toBe(
        '<p><img src="https://example.com/img.png" alt=""></p>'
      )
    })
  })

  describe('lists', () => {
    it('bullet list with dash', () => {
      const html = markdownToHtml('- one\n- two')
      expect(html).toBe(
        '<ul>\n<li><p>one</p></li>\n<li><p>two</p></li>\n</ul>'
      )
    })
    it('bullet list with star preserves marker', () => {
      const html = markdownToHtml('* one\n* two')
      expect(html).toBe(
        '<ul data-marker="*">\n<li><p>one</p></li>\n<li><p>two</p></li>\n</ul>'
      )
    })
    it('bullet list with plus preserves marker', () => {
      const html = markdownToHtml('+ one\n+ two')
      expect(html).toBe(
        '<ul data-marker="+">\n<li><p>one</p></li>\n<li><p>two</p></li>\n</ul>'
      )
    })
    it('ordered list', () => {
      const html = markdownToHtml('1. first\n2. second')
      expect(html).toBe(
        '<ol>\n<li><p>first</p></li>\n<li><p>second</p></li>\n</ol>'
      )
    })
    it('task list unchecked', () => {
      const html = markdownToHtml('- [ ] todo')
      expect(html).toContain('data-type="taskList"')
      expect(html).toContain('data-checked="false"')
    })
    it('task list checked', () => {
      const html = markdownToHtml('- [x] done')
      expect(html).toContain('data-checked="true"')
      expect(html).toContain('checked="checked"')
    })
    it('task list with empty content', () => {
      const html = markdownToHtml('- [ ] ')
      expect(html).toContain('data-type="taskItem"')
    })
  })

  describe('code blocks', () => {
    it('plain code block', () => {
      expect(markdownToHtml('```\nhello\n```')).toBe(
        '<pre><code>hello</code></pre>'
      )
    })
    it('code block with language', () => {
      expect(markdownToHtml('```javascript\nconst x = 1\n```')).toBe(
        '<pre><code class="language-javascript">const x = 1</code></pre>'
      )
    })
    it('code block preserves HTML entities', () => {
      expect(markdownToHtml('```\n<div>&amp;</div>\n```')).toBe(
        '<pre><code>&lt;div&gt;&amp;amp;&lt;/div&gt;</code></pre>'
      )
    })
    it('multi-line code block', () => {
      expect(markdownToHtml('```\nline1\nline2\nline3\n```')).toBe(
        '<pre><code>line1\nline2\nline3</code></pre>'
      )
    })
  })

  describe('blockquotes', () => {
    it('simple blockquote', () => {
      expect(markdownToHtml('> hello')).toBe(
        '<blockquote><p>hello</p></blockquote>'
      )
    })
    it('multi-line blockquote merges to one paragraph', () => {
      const html = markdownToHtml('> line one\n> line two')
      expect(html).toBe('<blockquote><p>line one line two</p></blockquote>')
    })
    it('blockquote with blank line creates two paragraphs', () => {
      const html = markdownToHtml('> para one\n>\n> para two')
      expect(html).toBe('<blockquote><p>para one</p>\n<p>para two</p></blockquote>')
    })
    it('nested blockquote', () => {
      const html = markdownToHtml('>> nested')
      expect(html).toBe('<blockquote><blockquote><p>nested</p></blockquote></blockquote>')
    })
  })

  describe('tables', () => {
    it('basic table', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |'
      const html = markdownToHtml(md)
      expect(html).toContain('<table>')
      expect(html).toContain('<th><p>A</p></th>')
      expect(html).toContain('<th><p>B</p></th>')
      expect(html).toContain('<td><p>1</p></td>')
      expect(html).toContain('<td><p>2</p></td>')
    })
  })

  describe('horizontal rules', () => {
    it('triple dash', () => {
      expect(markdownToHtml('---')).toBe('<hr>')
    })
    it('triple asterisk', () => {
      expect(markdownToHtml('***')).toBe('<hr>')
    })
    it('triple underscore', () => {
      expect(markdownToHtml('___')).toBe('<hr>')
    })
  })

  describe('line ending normalization', () => {
    it('CRLF normalized to LF', () => {
      expect(markdownToHtml('# Hello\r\n\r\nWorld')).toBe(
        '<h1>Hello</h1>\n<p>World</p>'
      )
    })
    it('BOM stripped', () => {
      expect(markdownToHtml('\uFEFF# Hello')).toBe('<h1>Hello</h1>')
    })
  })
})

// ─── htmlToMarkdown ─────────────────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  it('ensures trailing newline', () => {
    const md = htmlToMarkdown('<p>Hello</p>')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('collapses triple+ newlines', () => {
    // Two separate paragraphs should have exactly one blank line between them
    const md = htmlToMarkdown('<p>A</p><p>B</p>')
    expect(md).toBe('A\n\nB\n')
  })

  it('converts bold', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**\n')
  })

  it('converts italic', () => {
    expect(htmlToMarkdown('<em>italic</em>')).toBe('*italic*\n')
  })

  it('converts strikethrough from <s>', () => {
    expect(htmlToMarkdown('<s>struck</s>')).toBe('~~struck~~\n')
  })

  it('converts strikethrough from <del>', () => {
    expect(htmlToMarkdown('<del>struck</del>')).toBe('~~struck~~\n')
  })

  it('converts headings to ATX', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title\n')
  })

  it('converts hr to ---', () => {
    expect(htmlToMarkdown('<hr>')).toBe('---\n')
  })

  it('converts images', () => {
    expect(htmlToMarkdown('<img src="url.png" alt="desc">')).toBe('![desc](url.png)\n')
  })

  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://example.com">click</a>')).toBe(
      '[click](https://example.com)\n'
    )
  })

  it('converts fenced code blocks with language', () => {
    const md = htmlToMarkdown('<pre><code class="language-js">const x = 1</code></pre>')
    expect(md).toContain('```js')
    expect(md).toContain('const x = 1')
    expect(md).toContain('```')
  })

  it('converts tables to GFM', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('| A | B |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| 1 | 2 |')
  })

  it('converts bullet list', () => {
    const md = htmlToMarkdown('<ul><li><p>item</p></li></ul>')
    expect(md).toContain('- item')
  })

  it('converts ordered list', () => {
    const md = htmlToMarkdown('<ol><li><p>item</p></li></ol>')
    expect(md).toContain('1. item')
  })

  it('converts task list', () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li></ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('- [ ] todo')
  })

  it('converts checked task list', () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li></ul>'
    const md = htmlToMarkdown(html)
    expect(md).toContain('- [x] done')
  })

  it('converts blockquote', () => {
    const md = htmlToMarkdown('<blockquote><p>quoted</p></blockquote>')
    expect(md).toContain('> quoted')
  })
})

// ─── Roundtrip tests ────────────────────────────────────────────────────────

describe('roundtrip: markdown → HTML → markdown', () => {
  describe('headings', () => {
    it('h1', () => expect(roundtrip('# Hello')).toBe('# Hello\n'))
    it('h2', () => expect(roundtrip('## Hello')).toBe('## Hello\n'))
    it('h3', () => expect(roundtrip('### Hello')).toBe('### Hello\n'))
    it('h4', () => expect(roundtrip('#### Hello')).toBe('#### Hello\n'))
    it('h5', () => expect(roundtrip('##### Hello')).toBe('##### Hello\n'))
    it('h6', () => expect(roundtrip('###### Hello')).toBe('###### Hello\n'))

    it('heading with inline formatting', () => {
      expect(roundtrip('## **Bold** heading')).toBe('## **Bold** heading\n')
    })
  })

  describe('paragraphs', () => {
    it('single paragraph', () => {
      expect(roundtrip('Hello world')).toBe('Hello world\n')
    })
    it('two paragraphs', () => {
      expect(roundtrip('First\n\nSecond')).toBe('First\n\nSecond\n')
    })
  })

  describe('inline formatting', () => {
    it('bold **', () => expect(roundtrip('**bold**')).toBe('**bold**\n'))
    it('italic *', () => expect(roundtrip('*italic*')).toBe('*italic*\n'))
    it('strikethrough', () => expect(roundtrip('~~struck~~')).toBe('~~struck~~\n'))
    it('inline code', () => expect(roundtrip('`code`')).toBe('`code`\n'))
    it('bold + italic ***', () => {
      expect(roundtrip('***bold italic***')).toBe('***bold italic***\n')
    })
    it('mixed inline', () => {
      expect(roundtrip('**bold** and *italic* and `code`')).toBe(
        '**bold** and *italic* and `code`\n'
      )
    })
  })

  describe('inline formatting normalizations', () => {
    it('__ normalizes to **', () => expect(roundtrip('__bold__')).toBe('**bold**\n'))
    it('_ normalizes to *', () => expect(roundtrip('_italic_')).toBe('*italic*\n'))
  })

  describe('links and images', () => {
    it('link roundtrips', () => {
      expect(roundtrip('[click me](https://example.com)')).toBe(
        '[click me](https://example.com)\n'
      )
    })
    it('image roundtrips', () => {
      expect(roundtrip('![alt text](https://example.com/img.png)')).toBe(
        '![alt text](https://example.com/img.png)\n'
      )
    })
    it('image with empty alt', () => {
      expect(roundtrip('![](https://example.com/img.png)')).toBe(
        '![](https://example.com/img.png)\n'
      )
    })
    it('link in paragraph context', () => {
      expect(roundtrip('See [this link](https://example.com) for details')).toBe(
        'See [this link](https://example.com) for details\n'
      )
    })
    it('image in paragraph context', () => {
      expect(roundtrip('Look at ![photo](https://example.com/pic.jpg) here')).toBe(
        'Look at ![photo](https://example.com/pic.jpg) here\n'
      )
    })
  })

  describe('bullet lists', () => {
    it('dash list', () => {
      expect(roundtrip('- one\n- two\n- three')).toBe('- one\n- two\n- three\n')
    })
    it('star list preserves marker', () => {
      expect(roundtrip('* one\n* two')).toBe('* one\n* two\n')
    })
    it('plus list preserves marker', () => {
      expect(roundtrip('+ one\n+ two')).toBe('+ one\n+ two\n')
    })
    it('list items with inline formatting', () => {
      expect(roundtrip('- **bold** item\n- *italic* item')).toBe(
        '- **bold** item\n- *italic* item\n'
      )
    })
  })

  describe('ordered lists', () => {
    it('basic ordered list', () => {
      expect(roundtrip('1. first\n2. second\n3. third')).toBe(
        '1. first\n2. second\n3. third\n'
      )
    })
  })

  describe('task lists', () => {
    it('unchecked task', () => {
      expect(roundtrip('- [ ] todo')).toContain('- [ ] todo')
    })
    it('checked task', () => {
      expect(roundtrip('- [x] done')).toContain('- [x] done')
    })
    it('mixed tasks', () => {
      const result = roundtrip('- [ ] pending\n- [x] complete')
      expect(result).toContain('- [ ] pending')
      expect(result).toContain('- [x] complete')
    })
  })

  describe('code blocks', () => {
    it('plain code block', () => {
      const result = roundtrip('```\nhello world\n```')
      expect(result).toContain('```')
      expect(result).toContain('hello world')
    })
    it('code block with language', () => {
      const result = roundtrip('```javascript\nconst x = 1\n```')
      expect(result).toContain('```javascript')
      expect(result).toContain('const x = 1')
    })
    it('code block with multiple lines', () => {
      const result = roundtrip('```python\ndef foo():\n    return 42\n```')
      expect(result).toContain('```python')
      expect(result).toContain('def foo():')
      expect(result).toContain('    return 42')
    })
    it('code block preserves special characters', () => {
      const result = roundtrip('```\n<div class="test">&amp;</div>\n```')
      expect(result).toContain('<div class="test">&amp;</div>')
    })
  })

  describe('blockquotes', () => {
    it('simple blockquote', () => {
      expect(roundtrip('> hello world')).toBe('> hello world\n')
    })
    it('multi-paragraph blockquote', () => {
      const result = roundtrip('> para one\n>\n> para two')
      expect(result).toContain('> para one')
      expect(result).toContain('> para two')
    })
    it('nested blockquote', () => {
      const result = roundtrip('>> nested text')
      expect(result).toContain('>')
      expect(result).toContain('nested text')
    })
    it('blockquote with formatting', () => {
      expect(roundtrip('> **bold** in quote')).toContain('> **bold** in quote')
    })
  })

  describe('tables', () => {
    it('basic table roundtrips', () => {
      const md = '| Name | Age |\n| --- | --- |\n| Alice | 30 |'
      const result = roundtrip(md)
      expect(result).toContain('| Name | Age |')
      expect(result).toContain('| --- | --- |')
      expect(result).toContain('| Alice | 30 |')
    })
    it('table with inline formatting', () => {
      const md = '| **Bold** | *Italic* |\n| --- | --- |\n| `code` | text |'
      const result = roundtrip(md)
      expect(result).toContain('**Bold**')
      expect(result).toContain('*Italic*')
      expect(result).toContain('`code`')
    })
    it('table with multiple rows', () => {
      const md = '| H1 | H2 |\n| --- | --- |\n| a | b |\n| c | d |'
      const result = roundtrip(md)
      expect(result).toContain('| a | b |')
      expect(result).toContain('| c | d |')
    })
  })

  describe('horizontal rules', () => {
    it('triple dash roundtrips', () => {
      expect(roundtrip('---')).toBe('---\n')
    })
    it('triple asterisk normalizes to ---', () => {
      expect(roundtrip('***')).toBe('---\n')
    })
    it('triple underscore normalizes to ---', () => {
      expect(roundtrip('___')).toBe('---\n')
    })
  })

  describe('complex documents', () => {
    it('heading + paragraph + list', () => {
      const md = '# Title\n\nSome text here.\n\n- item one\n- item two'
      const result = roundtrip(md)
      expect(result).toContain('# Title')
      expect(result).toContain('Some text here.')
      expect(result).toContain('- item one')
      expect(result).toContain('- item two')
    })

    it('heading + code block + paragraph', () => {
      const md = '## Code Example\n\n```js\nconst x = 1\n```\n\nThat was code.'
      const result = roundtrip(md)
      expect(result).toContain('## Code Example')
      // 'js' is normalized to its canonical lowlight name on import
      expect(result).toContain('```javascript')
      expect(result).toContain('const x = 1')
      expect(result).toContain('That was code.')
    })

    it('mixed inline in paragraph', () => {
      const md = 'This has **bold**, *italic*, ~~struck~~, and `code` inline.'
      const result = roundtrip(md)
      expect(result).toBe('This has **bold**, *italic*, ~~struck~~, and `code` inline.\n')
    })

    it('blockquote followed by paragraph', () => {
      const md = '> A quote\n\nA normal paragraph.'
      const result = roundtrip(md)
      expect(result).toContain('> A quote')
      expect(result).toContain('A normal paragraph.')
    })

    it('table followed by paragraph', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter table.'
      const result = roundtrip(md)
      expect(result).toContain('| A | B |')
      expect(result).toContain('After table.')
    })
  })

  describe('edge cases', () => {
    it('empty string', () => {
      expect(roundtrip('')).toBe('')
    })

    it('whitespace only', () => {
      expect(roundtrip('   ')).toBe('')
    })

    it('CRLF line endings normalized', () => {
      expect(roundtrip('# Hello\r\n\r\nWorld')).toBe('# Hello\n\nWorld\n')
    })

    it('BOM stripped', () => {
      expect(roundtrip('\uFEFF# Hello')).toBe('# Hello\n')
    })

    it('html entities in text are preserved', () => {
      const result = roundtrip('Text with <angle> & "quotes"')
      expect(result).toBe('Text with <angle> & "quotes"\n')
    })
  })

  describe('idempotency', () => {
    const cases = [
      '# Hello',
      '**bold** and *italic*',
      '- one\n- two\n- three',
      '1. first\n2. second',
      '> quoted text',
      '```js\nconst x = 1\n```',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      '---',
      '![alt](https://example.com/img.png)',
      '[link](https://example.com)',
      '- [ ] todo\n- [x] done',
    ]

    for (const input of cases) {
      it(`stable after second roundtrip: ${input.slice(0, 40)}`, () => {
        const first = roundtrip(input)
        const second = roundtrip(first)
        expect(second).toBe(first)
      })
    }
  })
})

// ─── escape handling ────────────────────────────────────────────────────────

describe('escape handling', () => {
  describe('escape character set', () => {
    it('backslash is consumed for exactly the ESCAPABLE_PUNCTUATION set', () => {
      // Pins the parser's escape regex to the exported constant: for every
      // printable ASCII char, \X strips the backslash iff X is in the set.
      for (let code = 0x20; code <= 0x7e; code++) {
        const ch = String.fromCharCode(code)
        if (ch === '\\') continue // restored char is itself a backslash — covered below
        const html = markdownToHtml(`x\\${ch}x`)
        expect(html.includes('\\'), `char ${JSON.stringify(ch)}`).toBe(
          !ESCAPABLE_PUNCTUATION.includes(ch)
        )
      }
    })

    it('escaped backslash yields a single literal backslash', () => {
      expect(markdownToHtml('x\\\\x')).toBe('<p>x\\x</p>')
    })

    it('backslash before a non-punctuation character stays literal', () => {
      expect(markdownToHtml('C:\\Users\\test')).toBe('<p>C:\\Users\\test</p>')
    })
  })

  describe('escaped HTML-significant characters (bug: literal \\& in headings)', () => {
    it('\\& in a heading renders as &', () => {
      expect(markdownToHtml('# Q\\&A')).toBe('<h1>Q&amp;A</h1>')
    })

    it('\\& in a paragraph renders as &', () => {
      expect(markdownToHtml('\\&')).toBe('<p>&amp;</p>')
    })

    it('\\< \\> \\" are entity-escaped, not left with a backslash', () => {
      expect(markdownToHtml('\\<')).toBe('<p>&lt;</p>')
      expect(markdownToHtml('a \\> b')).toBe('<p>a &gt; b</p>')
      expect(markdownToHtml('\\"quote\\"')).toBe('<p>&quot;quote&quot;</p>')
    })

    it('\\. and \\, render as literal punctuation', () => {
      expect(markdownToHtml('one\\. two\\, three')).toBe('<p>one. two, three</p>')
    })

    it('\\& inside list items, table cells, and blockquotes', () => {
      expect(markdownToHtml('- A \\& B')).toContain('A &amp; B')
      expect(markdownToHtml('| A \\& B |\n| --- |\n| C |')).toContain('A &amp; B')
      expect(markdownToHtml('> A \\& B')).toContain('A &amp; B')
    })

    it('roundtrip: # Q\\&A normalizes to bare & and stays stable', () => {
      const first = roundtrip('# Q\\&A')
      expect(first).toBe('# Q&A\n')
      expect(roundtrip(first)).toBe(first)
    })

    it('roundtrip: literal backslash before & (\\\\&) is preserved', () => {
      const first = roundtrip('\\\\&')
      expect(first).toBe('\\\\&\n')
      expect(roundtrip(first)).toBe(first)
    })
  })

  describe('intraword underscores (bug: snake_case turned italic)', () => {
    const literals = [
      'my_variable_name',
      'a_b',
      'snake_case_',
      '_snake_case',
      'x__bold__',
      'foo__bar__baz',
      'café_été_x',
    ]
    for (const input of literals) {
      it(`stays literal: ${input}`, () => {
        expect(markdownToHtml(input)).toBe(`<p>${input}</p>`)
      })
    }

    it('real underscore emphasis still works', () => {
      expect(markdownToHtml('_italic_')).toBe('<p><em>italic</em></p>')
      expect(markdownToHtml('foo _bar_ baz')).toBe('<p>foo <em>bar</em> baz</p>')
      expect(markdownToHtml('(_em_)')).toBe('<p>(<em>em</em>)</p>')
      expect(markdownToHtml('_foo_bar_')).toBe('<p><em>foo_bar</em></p>')
    })

    it('standalone __dunder__ is bold (GFM: delimiters flanked by non-words)', () => {
      expect(markdownToHtml('__dunder__')).toBe('<p><strong>dunder</strong></p>')
    })

    it('snake_case in headings, lists, and table cells stays literal', () => {
      expect(markdownToHtml('# my_variable_name')).toBe('<h1>my_variable_name</h1>')
      expect(markdownToHtml('- my_variable_name')).toContain('my_variable_name')
      expect(markdownToHtml('| my_variable_name |\n| --- |\n| x |')).toContain('my_variable_name')
    })

    it('roundtrip: snake_case survives unescaped and is idempotent', () => {
      const first = roundtrip('my_variable_name')
      expect(first).toBe('my_variable_name\n')
      expect(roundtrip(first)).toBe(first)
    })

    it('roundtrip: _real italic_ normalizes to *real italic*', () => {
      expect(roundtrip('_real italic_')).toBe('*real italic*\n')
    })

    it('roundtrip: escaped \\_ at word boundaries stays escaped', () => {
      const first = roundtrip('\\_x\\_')
      expect(first).toBe('\\_x\\_\n')
      expect(roundtrip(first)).toBe(first)
    })
  })

  describe('backslashes inside code spans', () => {
    it('escape sequences inside inline code keep their backslash', () => {
      expect(markdownToHtml('`a\\*b`')).toBe('<p><code>a\\*b</code></p>')
      expect(markdownToHtml('`\\d+\\.`')).toBe('<p><code>\\d+\\.</code></p>')
    })

    it('roundtrip: regex-like code span is preserved', () => {
      const first = roundtrip('`\\d+\\.`')
      expect(first).toBe('`\\d+\\.`\n')
      expect(roundtrip(first)).toBe(first)
    })
  })

  describe('ordered-list escaping (paragraph "1. Text" must not become a list)', () => {
    it('export escapes a paragraph starting with a list-like number', () => {
      expect(htmlToMarkdown('<p>1. Text</p>')).toBe('1\\. Text\n')
    })

    it('import reads 1\\. back as a literal paragraph', () => {
      expect(markdownToHtml('1\\. Text')).toBe('<p>1. Text</p>')
    })

    it('full cycle: paragraph stays a paragraph', () => {
      expect(markdownToHtml(htmlToMarkdown('<p>1. Text</p>'))).toBe('<p>1. Text</p>')
    })

    it('real ordered lists are unaffected', () => {
      const first = roundtrip('1. first\n2. second')
      expect(markdownToHtml(first)).toContain('<ol>')
      expect(roundtrip(first)).toBe(first)
    })
  })

  describe('heading escaping (block chars after "# " need no escape)', () => {
    it('number-dot in headings is not escaped', () => {
      expect(htmlToMarkdown('<h3>1. Example Heading</h3>')).toBe('### 1. Example Heading\n')
      expect(htmlToMarkdown('<h3>1.2 Example Heading</h3>')).toBe('### 1.2 Example Heading\n')
    })

    it('line-start block chars in headings are not escaped', () => {
      expect(htmlToMarkdown('<h2># hash</h2>')).toBe('## # hash\n')
      expect(htmlToMarkdown('<h2>&gt; quote</h2>')).toBe('## > quote\n')
      expect(htmlToMarkdown('<h2>- dash</h2>')).toBe('## - dash\n')
      expect(htmlToMarkdown('<h2>+ plus</h2>')).toBe('## + plus\n')
    })

    it('literal backslash at heading start keeps its escape', () => {
      // Editor text "\# x" (typed with MD shortcuts off) must survive: the \
      // exports as \\ and the unescape pass must not strip it.
      expect(htmlToMarkdown('<h2>\\# x</h2>')).toBe('## \\\\# x\n')
      expect(markdownToHtml('## \\\\# x')).toBe('<h2>\\# x</h2>')
      expect(htmlToMarkdown('<h2>1\\. x</h2>')).toBe('## 1\\\\. x\n')
    })

    it('roundtrip: numbered headings are stable with no added escapes', () => {
      for (const md of ['### 1.2 Example Heading', '### 1. Example Heading', '# 10. Something', '### 1.2.3 Deep Section']) {
        const first = roundtrip(md)
        expect(first).toBe(md + '\n')
        expect(roundtrip(first)).toBe(first)
      }
    })
  })
})
