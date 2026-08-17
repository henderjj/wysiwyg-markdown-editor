# GitHub Flavoured Markdown Test Document

This file exercises all GFM features supported by the editor. This is a speeling error. - test

## Headings

### Third Level

#### Fourth Level

##### Fifth Level

###### Sixth Level

## Inline Formatting

This paragraph has **bold text**, *italic text*, and ***bold italic*** together. It also has ~~strikethrough~~ and `inline code` mixed with regular text.

Combine them: **bold with** `code` **inside** and *italic with ~~strikethrough~~*.

## Links and Images

Visit [GitHub](https://github.com) for more information.

Here is an image: ![Placeholder](https://placehold.co/150x50)

Here is a broken image: ![Broken image](https://placehold.co/broken)

A link with **bold text inside**: [**Important Link**](https://example.com)

## Blockquotes

> This is a blockquote.

> A longer blockquote that spans multiple lines of text to test how the parser handles continuation.

> This is another blockquote that will have an embedded blockquote. This is the second line of the blockquote.
>> This is the embedded blockquote. This is the second line of the embedded blockquote.
> Final line in the parent blockquote.

> #### Blockquote Heading 4
> 
> - Unordered list item 1 in a blockquote.
> - Unordered list item 2 in a blockquote.
> 
> *Italic* and **bold** in a blockquote.

## Unordered Lists

- First item
- Second item
- Third item with **bold** and `code`
- Fourth item

Alternate markers:

* Star marker one
* Star marker two

+ Plus marker one
+ Plus marker two

## Ordered Lists

1. First step
2. Second step
3. Third step with *emphasis*
4. Fourth step

## Task Lists

- [x] Completed task
- [x] Another done item
- [ ] Pending task
- [ ] Still to do with `code` in it
- [ ] Empty content after checkbox

## Code Blocks

Inline: Use `npm install` to install dependencies.

Fenced block with language:

```typescript
interface Document {
  id: string
  filename: string
  content: string
  lastModified: number
}

function loadDocuments(): Document[] {
  const stored = localStorage.getItem('documents')
  return stored ? JSON.parse(stored) : []
}
```

```python
def fibonacci(n: int) -> list[int]:
    """Generate Fibonacci sequence."""
    seq = [0, 1]
    for _ in range(n - 2):
        seq.append(seq[-1] + seq[-2])
    return seq[:n]
```

```bash
#!/bin/bash
echo "Hello from a shell script"
git status
npm run build
```

Plain code block (no language):

```
No syntax highlighting here.
Just plain preformatted text.
```

## Tables

| Feature | Status | Notes |
| --- | --- | --- |
| Bold | Done | `**text**` syntax |
| Italic | Done | `*text*` syntax |
| Tables | Done | Pipe syntax with header separator |
| Strikethrough | Done | `~~text~~` syntax |

Single column:

| Item |
| --- |
| Alpha |
| Beta |
| Gamma |

Wide table:

| Name | Type | Default | Required | Description |
| --- | --- | --- | --- | --- |
| id | string | auto | No | Unique identifier |
| title | string | untitled | Yes | Document title |
| content | string | empty | Yes | Markdown body |
| tags | string[] | [] | No | Categorization labels |

## Horizontal Rules

Content above the rule.

---

Content between rules.

---

Content below the rules.

---

## Mixed Content

Here is a paragraph followed immediately by a list:

- Item right after paragraph
- Another item

And a paragraph after a code block:

```json
{
  "name": "test",
  "version": "1.0.0"
}
```

Back to regular text. Now a blockquote followed by a table:

> Important note before the table.

| Key | Value |
| --- | --- |
| alpha | 1 |
| beta | 2 |

## Edge Cases

### Empty Paragraphs Around Blocks

Text before code.

```
code block
```

Text after code.

### Special Characters in Inline Formatting

**Ampersand & angle brackets < > in bold**

`<div class="test">&amp;</div>` as inline code.

### Long Unbroken Line

This is a very long paragraph that contains no line breaks whatsoever and should be rendered as a single flowing paragraph by the editor regardless of how wide or narrow the viewport happens to be at the time of rendering.

### Heading with Inline Formatting

## **Bold Heading**

## Heading with `code` inside

## *Italic Heading*

### Link in a List

- Visit [Example Site](https://example.com) for details
- Check `config.json` for settings
- Read the **documentation** carefully

### Task List with Rich Content

- [x] Set up **project structure**
- [ ] Write `markdownToHtml()` parser
- [x] Add ~~basic~~ complete GFM support
- [ ] Deploy to [production](https://example.com)

### Table with Inline Formatting

| Format | Example | Markdown |
| --- | --- | --- |
| Bold | **text** | `**text**` |
| Italic | *text* | `*text*` |
| Code | `text` | `` `text` `` |
| Strike | ~~text~~ | `~~text~~` |
| Link | [text](url) | `[text](url)` |

Text after a table.
