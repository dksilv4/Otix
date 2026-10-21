import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { createWrapper } from '@/test-utils'
import { DownloadPage } from '../pages/download-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode
    to: string
    className?: string
  }) => (
    <a href={to} className={className} data-testid={`link-${to}`}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

describe('DownloadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
  })

  it('renders downloads page hero, title, and release badge', async () => {
    const Wrapper = createWrapper()
    render(
      <HelmetProvider>
        <Wrapper>
          <DownloadPage />
        </Wrapper>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Get Otix for/i)).toBeInTheDocument()
    expect(screen.getByText(/100% Free & Open Source/i)).toBeInTheDocument()
    expect(screen.getByText(/Downloads FAQ/i)).toBeInTheDocument()
  })

  it('renders direct download options and starts download feedback banner on click', async () => {
    const Wrapper = createWrapper()
    render(
      <HelmetProvider>
        <Wrapper>
          <DownloadPage />
        </Wrapper>
      </HelmetProvider>,
    )

    // Find the primary hero download button
    const heroDownloadBtn = screen.getByText(/Download for/i)
    expect(heroDownloadBtn).toBeInTheDocument()

    // Find a download card button and click it
    const downloadButtons = screen.getAllByRole('button', { name: /Download/i })
    expect(downloadButtons.length).toBeGreaterThan(0)

    fireEvent.click(downloadButtons[0])

    // Verify success banner appears with next steps
    await waitFor(() => {
      expect(
        screen.getByText(/Your download for .* has started!/i),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Next steps to get started:/i),
      ).toBeInTheDocument()
    })

    // Dismiss banner
    const dismissBtn = screen.getByLabelText(/Dismiss download status banner/i)
    fireEvent.click(dismissBtn)

    expect(
      screen.queryByText(/Your download for .* has started!/i),
    ).not.toBeInTheDocument()
  })

  it('switches between platform tabs (macOS, Linux, Otix Node)', async () => {
    const Wrapper = createWrapper()
    render(
      <HelmetProvider>
        <Wrapper>
          <DownloadPage />
        </Wrapper>
      </HelmetProvider>,
    )

    // Switch to macOS
    const macTab = screen.getAllByRole('button', { name: /macOS/i })[0]
    fireEvent.click(macTab)

    expect(screen.getAllByText(/macOS Apple Silicon/i)[0]).toBeInTheDocument()
    expect(screen.getByText(/macOS System Requirements/i)).toBeInTheDocument()

    // Switch to Linux
    const linuxTab = screen.getAllByRole('button', { name: /Linux/i })[0]
    fireEvent.click(linuxTab)

    expect(screen.getByText(/Linux AppImage/i)).toBeInTheDocument()
    expect(screen.getByText(/Linux System Requirements/i)).toBeInTheDocument()

    // Switch to Otix Node
    const nodeTab = screen.getAllByRole('button', { name: /Otix Node/i })[0]
    fireEvent.click(nodeTab)

    expect(
      screen.getByText(/Otix Node \(Headless Companion Server\)/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Docker Run Command/i)).toBeInTheDocument()
  })

  it('renders FAQ questions and answers', () => {
    const Wrapper = createWrapper()
    render(
      <HelmetProvider>
        <Wrapper>
          <DownloadPage />
        </Wrapper>
      </HelmetProvider>,
    )

    expect(
      screen.getByText(/Is Otix completely free and open-source\?/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Why download directly from the website instead of GitHub\?/i),
    ).toBeInTheDocument()
  })
})
