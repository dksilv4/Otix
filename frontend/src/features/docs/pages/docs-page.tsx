import { useState, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import { DOCS_CATEGORIES } from '../constants/docs-content'
import { useDocsNavigation } from '../hooks/use-docs-navigation'
import { DocsHeader } from '../components/organisms/docs-header'
import { DocsSidebarNav } from '../components/molecules/docs-sidebar-nav'
import { DocsToc } from '../components/molecules/docs-toc'
import { DocsArticleView } from '../components/organisms/docs-article-view'
import { SetupWizardModal } from '@/features/welcome'
import { X } from 'lucide-react'

export const DocsPage = () => {
  const [isWizardOpen, setIsWizardOpen] = useState(false)

  const {
    currentArticle,
    currentCategory,
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
  } = useDocsNavigation(DOCS_CATEGORIES)

  const handleOpenWizard = useCallback(() => {
    setIsWizardOpen(true)
  }, [])

  const handleCloseWizard = useCallback(() => {
    setIsWizardOpen(false)
  }, [])

  return (
    <div id="docs-page" className="min-h-screen bg-background text-foreground py-6 px-4 sm:px-6 lg:px-8">
      <Helmet>
        <title>{currentArticle.title} — Otix Documentation</title>
        <meta
          name="description"
          content={currentArticle.tagline}
        />
      </Helmet>

      <div className="mx-auto max-w-7xl">
        {/* Top Header & Breadcrumbs */}
        <DocsHeader
          currentCategory={currentCategory}
          currentArticle={currentArticle}
          onToggleMobileDrawer={() => setMobileDrawerOpen((prev) => !prev)}
        />

        {/* Responsive Layout Grid */}
        <div className="flex gap-8 lg:gap-10 items-start">
          {/* Desktop Left Navigation Sidebar */}
          <aside
            aria-label="Documentation Categories"
            className="hidden lg:block w-72 shrink-0 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2"
          >
            <DocsSidebarNav
              categories={DOCS_CATEGORIES}
              activeSectionId={currentArticle.id}
              searchQuery={searchQuery}
              searchResults={searchResults}
              onSearchChange={setSearchQuery}
              onSelectSection={selectSection}
            />
          </aside>

          {/* Main Article Content */}
          <main className="flex-1 min-w-0">
            <DocsArticleView
              article={currentArticle}
              category={currentCategory}
              adjacent={adjacent}
              onSelectSection={selectSection}
              onCopyCode={copyCode}
              onLaunchSetupWizard={handleOpenWizard}
            />
          </main>

          {/* Desktop Right Table of Contents (On this page) */}
          <DocsToc
            subheadings={currentArticle.subheadings}
            activeHeadingId={activeHeadingId}
            onScrollToHeading={scrollToHeading}
          />
        </div>
      </div>

      {/* Mobile Slide-Over Navigation Drawer */}
      {mobileDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile documentation navigation"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div
            className="relative ml-0 mr-auto w-4/5 max-w-sm h-full p-5 flex flex-col gap-4 shadow-[var(--dk-shadow-dialog)] border-r border-[var(--dk-separator)]"
            style={{ backgroundColor: 'var(--dk-surface-overlay)' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--dk-separator)]">
              <span className="font-bold text-sm tracking-tight text-foreground">
                Documentation
              </span>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <DocsSidebarNav
                categories={DOCS_CATEGORIES}
                activeSectionId={currentArticle.id}
                searchQuery={searchQuery}
                searchResults={searchResults}
                onSearchChange={setSearchQuery}
                onSelectSection={selectSection}
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Setup Wizard Modal */}
      {isWizardOpen && (
        <SetupWizardModal
          isOpen={isWizardOpen}
          onClose={handleCloseWizard}
          onCompleted={handleCloseWizard}
        />
      )}
    </div>
  )
}
