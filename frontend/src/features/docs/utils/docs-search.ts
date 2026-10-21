import type { DocCategory, DocArticle, DocSearchResult } from '../types'

/** Returns all articles in a flat array across categories */
export const getAllArticles = (categories: DocCategory[]): DocArticle[] => {
  return categories.flatMap((cat) => cat.articles)
}

/** Looks up an article and its parent category by article ID */
export const findArticleById = (
  categories: DocCategory[],
  articleId: string,
): { article: DocArticle; category: DocCategory } | null => {
  for (const category of categories) {
    const article = category.articles.find((a) => a.id === articleId)
    if (article) {
      return { article, category }
    }
  }
  return null
}

/** Determines previous and next articles for pagination navigation */
export const getAdjacentArticles = (
  categories: DocCategory[],
  currentArticleId: string,
): {
  prev: { article: DocArticle; category: DocCategory } | null
  next: { article: DocArticle; category: DocCategory } | null
} => {
  const flat: { article: DocArticle; category: DocCategory }[] = []
  for (const category of categories) {
    for (const article of category.articles) {
      flat.push({ article, category })
    }
  }

  const currentIndex = flat.findIndex((item) => item.article.id === currentArticleId)
  if (currentIndex === -1) {
    return { prev: null, next: null }
  }

  return {
    prev: currentIndex > 0 ? flat[currentIndex - 1] : null,
    next: currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null,
  }
}

/** Searches documentation across titles, subheadings, blocks, and keywords */
export const searchDocs = (
  query: string,
  categories: DocCategory[],
): DocSearchResult[] => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const results: DocSearchResult[] = []

  for (const category of categories) {
    for (const article of category.articles) {
      // 1. Check title
      if (article.title.toLowerCase().includes(normalized)) {
        results.push({
          article,
          matchedSnippet: article.tagline,
          matchType: 'title',
        })
        continue
      }

      // 2. Check keywords
      const matchedKeyword = article.keywords.find((k) => k.toLowerCase().includes(normalized))
      if (matchedKeyword) {
        results.push({
          article,
          matchedSnippet: `Matched keyword: ${matchedKeyword} · ${article.tagline}`,
          matchType: 'keyword',
        })
        continue
      }

      // 3. Check subheadings
      const matchedSubheading = article.subheadings.find((s) =>
        s.title.toLowerCase().includes(normalized),
      )
      if (matchedSubheading) {
        results.push({
          article,
          matchedSnippet: `Section: ${matchedSubheading.title}`,
          matchType: 'subheading',
        })
        continue
      }

      // 4. Check blocks (paragraphs, lists, callouts)
      let contentSnippet = ''
      for (const block of article.blocks) {
        if (block.text && block.text.toLowerCase().includes(normalized)) {
          contentSnippet = extractSnippet(block.text, normalized)
          break
        }
        if (block.callout && block.callout.text.toLowerCase().includes(normalized)) {
          contentSnippet = extractSnippet(block.callout.text, normalized)
          break
        }
        if (block.items) {
          const matchedItem = block.items.find((item) => item.toLowerCase().includes(normalized))
          if (matchedItem) {
            contentSnippet = extractSnippet(matchedItem, normalized)
            break
          }
        }
      }

      if (contentSnippet) {
        results.push({
          article,
          matchedSnippet: contentSnippet,
          matchType: 'content',
        })
      }
    }
  }

  return results
}

/** Extracts a concise snippet centered around the match term */
export const extractSnippet = (fullText: string, searchTerm: string, maxLen = 120): string => {
  const lower = fullText.toLowerCase()
  const idx = lower.indexOf(searchTerm)
  if (idx === -1) return fullText.slice(0, maxLen)

  const start = Math.max(0, idx - 40)
  const end = Math.min(fullText.length, idx + searchTerm.length + 60)
  let snippet = fullText.slice(start, end).trim()
  if (start > 0) snippet = '...' + snippet
  if (end < fullText.length) snippet = snippet + '...'
  return snippet
}

/** Copies text to system clipboard with fallback */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback for older environments
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(textarea)
      return ok
    } catch {
      return false
    }
  }
  return false
}
