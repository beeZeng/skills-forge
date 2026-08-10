/** Escape HTML special characters. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Lightweight Markdown → HTML for SKILL.md preview (no external deps).
 * Supports: fenced code, inline code, headings, lists, quotes, hr, bold/italic, links, paragraphs.
 */
export function renderMarkdownToHtml(markdown: string): string {
  const raw = markdown.replace(/\r\n/g, '\n')
  const fences: string[] = []
  const withFences = raw.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const idx = fences.length
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    fences.push(
      `<pre class="md-pre"><code${langClass}>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`,
    )
    return `\n%%FENCE${idx}%%\n`
  })

  const lines = withFences.split('\n')
  const html: string[] = []
  let i = 0
  let inUl = false
  let inOl = false
  let inBlockquote = false

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>')
      inUl = false
    }
    if (inOl) {
      html.push('</ol>')
      inOl = false
    }
  }
  const closeQuote = () => {
    if (inBlockquote) {
      html.push('</blockquote>')
      inBlockquote = false
    }
  }

  const inline = (text: string) => {
    let s = escapeHtml(text)
    s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
    s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>')
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
    return s
  }

  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = line.match(/^%%FENCE(\d+)%%$/)
    if (fenceMatch) {
      closeLists()
      closeQuote()
      html.push(fences[Number(fenceMatch[1])] || '')
      i += 1
      continue
    }

    if (/^\s*$/.test(line)) {
      closeLists()
      closeQuote()
      i += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      closeLists()
      closeQuote()
      const level = heading[1].length
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeLists()
      closeQuote()
      html.push('<hr />')
      i += 1
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      closeLists()
      if (!inBlockquote) {
        html.push('<blockquote>')
        inBlockquote = true
      }
      html.push(`<p>${inline(quote[1])}</p>`)
      i += 1
      continue
    }
    closeQuote()

    const ul = line.match(/^[-*+]\s+(.*)$/)
    if (ul) {
      if (inOl) {
        html.push('</ol>')
        inOl = false
      }
      if (!inUl) {
        html.push('<ul>')
        inUl = true
      }
      html.push(`<li>${inline(ul[1])}</li>`)
      i += 1
      continue
    }

    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (ol) {
      if (inUl) {
        html.push('</ul>')
        inUl = false
      }
      if (!inOl) {
        html.push('<ol>')
        inOl = true
      }
      html.push(`<li>${inline(ol[1])}</li>`)
      i += 1
      continue
    }

    closeLists()
    html.push(`<p>${inline(line)}</p>`)
    i += 1
  }

  closeLists()
  closeQuote()
  return html.join('\n')
}
