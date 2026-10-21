import { describe, it, expect, vi } from 'vitest'
import {
  searchDocs,
  findArticleById,
  getAdjacentArticles,
  extractSnippet,
  copyToClipboard,
  getAllArticles,
} from '../utils/docs-search'
import { DOCS_CATEGORIES } from '../constants/docs-content'

describe('docs-search utilities', () => {
  it('returns all articles across categories', () => {
    const articles = getAllArticles(DOCS_CATEGORIES)
    expect(articles.length).toBeGreaterThan(10)
    expect(articles.some((a) => a.id === 'overview')).toBe(true)
    expect(articles.some((a) => a.id === 'installation')).toBe(true)
  })

  it('finds article by valid ID', () => {
    const result = findArticleById(DOCS_CATEGORIES, 'byos-streaming')
    expect(result).not.toBeNull()
    expect(result?.article.id).toBe('byos-streaming')
    expect(result?.category.id).toBe('architecture')
  })

  it('returns null for non-existent article ID', () => {
    const result = findArticleById(DOCS_CATEGORIES, 'non-existent-article-id')
    expect(result).toBeNull()
  })

  it('determines adjacent articles for pagination', () => {
    const adjacent = getAdjacentArticles(DOCS_CATEGORIES, 'installation')
    expect(adjacent.prev?.article.id).toBe('overview')
    expect(adjacent.next?.article.id).toBe('setup-wizard')
  })

  it('returns empty results when query is empty or blank', () => {
    expect(searchDocs('', DOCS_CATEGORIES)).toEqual([])
    expect(searchDocs('   ', DOCS_CATEGORIES)).toEqual([])
  })

  it('searches articles by title', () => {
    const results = searchDocs('Installation', DOCS_CATEGORIES)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.article.id === 'installation')).toBe(true)
    expect(results[0].matchType).toBe('title')
  })

  it('searches articles by keyword', () => {
    const results = searchDocs('unraid', DOCS_CATEGORIES)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.article.keywords.includes('unraid'))).toBe(true)
  })

  it('searches articles by subheading', () => {
    const results = searchDocs('Zero Media Relay', DOCS_CATEGORIES)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.article.id === 'byos-streaming')).toBe(true)
  })

  it('extracts snippet around matching word', () => {
    const text = 'Otix is an all-in-one entertainment suite supporting Plex and Jellyfin media streaming directly.'
    const snippet = extractSnippet(text, 'jellyfin', 40)
    expect(snippet.toLowerCase()).toContain('jellyfin')
  })

  it('copies text via navigator.clipboard when available', async () => {
    const originalClipboard = navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    const ok = await copyToClipboard('test copy command')
    expect(ok).toBe(true)
    expect(writeTextMock).toHaveBeenCalledWith('test copy command')

    Object.assign(navigator, { clipboard: originalClipboard })
  })
})
