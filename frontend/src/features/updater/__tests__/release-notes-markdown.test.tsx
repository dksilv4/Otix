import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReleaseNotesMarkdown } from '../components/release-notes-markdown'
import * as openExternalModule from '@/lib/utils/open-external'

describe('ReleaseNotesMarkdown', () => {
  it('renders fallback when content is empty', () => {
    render(<ReleaseNotesMarkdown content="" />)
    expect(screen.getByText(/no release notes available/i)).toBeInTheDocument()
  })

  it('renders headings correctly', () => {
    const md = '# Main Title\n## Secondary Section\n### Minor Details'
    render(<ReleaseNotesMarkdown content={md} />)

    expect(screen.getByRole('heading', { level: 2, name: /main title/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /secondary section/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 4, name: /minor details/i })).toBeInTheDocument()
  })

  it('renders unordered list with bold text and inline code', () => {
    const md = `
* Feature: **New auto updater** with \`auto-download\` support
* Fix: Bug resolving *edge-cases* cleanly
    `
    render(<ReleaseNotesMarkdown content={md} />)

    expect(screen.getByText('New auto updater')).toBeInTheDocument()
    expect(screen.getByText('auto-download')).toBeInTheDocument()
    expect(screen.getByText('edge-cases')).toBeInTheDocument()
  })

  it('renders ordered lists correctly', () => {
    const md = `
1. First step
2. Second step
    `
    render(<ReleaseNotesMarkdown content={md} />)

    expect(screen.getByText('First step')).toBeInTheDocument()
    expect(screen.getByText('Second step')).toBeInTheDocument()
  })

  it('renders fenced code blocks', () => {
    const md = '```json\n{"status": "ok"}\n```'
    const { container } = render(<ReleaseNotesMarkdown content={md} />)

    expect(container.querySelector('pre')).toBeInTheDocument()
    expect(screen.getByText('{"status": "ok"}')).toBeInTheDocument()
  })

  it('renders blockquotes and horizontal rules', () => {
    const md = '> Note: Important update\n\n---\n\nRegular paragraph'
    const { container } = render(<ReleaseNotesMarkdown content={md} />)

    expect(container.querySelector('blockquote')).toBeInTheDocument()
    expect(screen.getByText('Note: Important update')).toBeInTheDocument()
    expect(container.querySelector('hr')).toBeInTheDocument()
    expect(screen.getByText('Regular paragraph')).toBeInTheDocument()
  })

  it('renders clickable links and triggers openExternal', () => {
    const openExternalSpy = vi.spyOn(openExternalModule, 'openExternal').mockImplementation(() => {})
    const md = 'See [full changelog](https://github.com/dksilv4/Otix/compare/v0.1.23...v0.1.24) for details'
    render(<ReleaseNotesMarkdown content={md} />)

    const linkBtn = screen.getByRole('button', { name: /full changelog/i })
    expect(linkBtn).toBeInTheDocument()
    fireEvent.click(linkBtn)

    expect(openExternalSpy).toHaveBeenCalledWith(
      'https://github.com/dksilv4/Otix/compare/v0.1.23...v0.1.24',
      { newTab: true }
    )
  })
})
