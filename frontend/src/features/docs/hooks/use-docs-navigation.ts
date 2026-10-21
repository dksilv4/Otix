import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { DocCategory, DocSectionId, DocSearchResult } from '../types'
import {
  findArticleById,
  getAdjacentArticles,
  searchDocs,
  copyToClipboard,
} from '../utils/docs-search'
import { useToast } from '@ui/molecules/toast'

export const useDocsNavigation = (categories: DocCategory[]) => {
  const navigate = useNavigate()
  const searchParams = useSearch({ strict: false }) as Record<string, unknown>
  const { toast } = useToast()

  const defaultSectionId = categories[0]?.articles[0]?.id ?? 'overview'
  const currentSectionId = (
    typeof searchParams?.section === 'string' && searchParams.section
      ? (searchParams.section as DocSectionId)
      : defaultSectionId
  ) as DocSectionId

  const [activeSectionId, setActiveSectionId] = useState<DocSectionId>(currentSectionId)
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  // Sync state if URL changes externally
  useEffect(() => {
    if (searchParams?.section && typeof searchParams.section === 'string') {
      setActiveSectionId(searchParams.section as DocSectionId)
    }
  }, [searchParams?.section])

  const currentSelection = useMemo(() => {
    return (
      findArticleById(categories, activeSectionId) ||
      findArticleById(categories, defaultSectionId) || {
        article: categories[0].articles[0],
        category: categories[0],
      }
    )
  }, [categories, activeSectionId, defaultSectionId])

  const adjacent = useMemo(() => {
    return getAdjacentArticles(categories, currentSelection.article.id)
  }, [categories, currentSelection.article.id])

  const searchResults: DocSearchResult[] = useMemo(() => {
    return searchDocs(searchQuery, categories)
  }, [searchQuery, categories])

  const selectSection = useCallback(
    (sectionId: DocSectionId) => {
      setActiveSectionId(sectionId)
      setMobileDrawerOpen(false)
      setSearchQuery('')
      navigate({
        to: '/docs',
        search: (prev) => ({ ...prev, section: sectionId }),
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [navigate],
  )

  const copyCode = useCallback(
    async (code: string, label?: string) => {
      const ok = await copyToClipboard(code)
      if (ok) {
        toast({
          title: 'Copied to Clipboard',
          description: label ? `${label} copied.` : 'Snippet copied to clipboard.',
          variant: 'success',
        })
      } else {
        toast({
          title: 'Copy Failed',
          description: 'Unable to access clipboard.',
          variant: 'error',
        })
      }
    },
    [toast],
  )

  const scrollToHeading = useCallback((headingId: string) => {
    setActiveHeadingId(headingId)
    const element = document.getElementById(headingId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Heading IntersectionObserver for active TOC spying
  useEffect(() => {
    const headings = currentSelection.article.subheadings
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el))

    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting)
        if (visible?.target?.id) {
          setActiveHeadingId(visible.target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    )

    headings.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [currentSelection.article])

  return {
    activeSectionId: currentSelection.article.id,
    currentArticle: currentSelection.article,
    currentCategory: currentSelection.category,
    activeHeadingId,
    adjacent,
    searchQuery,
    setSearchQuery,
    searchResults,
    mobileDrawerOpen,
    setMobileDrawerOpen,
    selectSection,
    scrollToHeading,
    copyCode,
  }
}
