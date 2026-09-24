import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EpicCodeModal } from '../epic-code-modal'
import { apiClient } from '@/lib/api/client'
import { openExternal } from '@/lib/utils/open-external'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
  },
}))

vi.mock('@/lib/utils/open-external', () => ({
  openExternal: vi.fn(),
}))

describe('EpicCodeModal', () => {
  const defaultProps = {
    authUrl: 'https://epicgames.com/id/authorize?client_id=123',
    state: 'state-abc-123',
    onClose: vi.fn(),
    onLinked: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders correctly and opens Epic login in a new tab when clicked', async () => {
    const user = userEvent.setup()
    render(<EpicCodeModal {...defaultProps} />)

    const loginButton = screen.getByRole('button', { name: /Open Epic Games login/i })
    expect(loginButton).toBeInTheDocument()

    await user.click(loginButton)

    expect(openExternal).toHaveBeenCalledWith(defaultProps.authUrl, { newTab: true })
  })

  it('submits successfully when raw code is pasted', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { connected: true } })
    const user = userEvent.setup()
    render(<EpicCodeModal {...defaultProps} />)

    const textarea = screen.getByLabelText(/Authorization code/i)
    await user.type(textarea, 'my-auth-code-123')

    const submitButton = screen.getByRole('button', { name: /Link account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic/callback', {
        code: 'my-auth-code-123',
        state: defaultProps.state,
      })
      expect(defaultProps.onLinked).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  it('extracts authorizationCode when JSON response is pasted', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { connected: true } })
    const user = userEvent.setup()
    render(<EpicCodeModal {...defaultProps} />)

    const textarea = screen.getByLabelText(/Authorization code/i)
    await user.click(textarea)
    await user.paste('{"authorizationCode":"extracted-code-999","sid":null}')

    const submitButton = screen.getByRole('button', { name: /Link account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic/callback', {
        code: 'extracted-code-999',
        state: defaultProps.state,
      })
      expect(defaultProps.onLinked).toHaveBeenCalled()
    })
  })

  it('extracts code when redirect URL is pasted', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({ data: { connected: true } })
    const user = userEvent.setup()
    render(<EpicCodeModal {...defaultProps} />)

    const textarea = screen.getByLabelText(/Authorization code/i)
    await user.click(textarea)
    await user.paste('https://www.epicgames.com/id/api/redirect?code=url-code-456')

    const submitButton = screen.getByRole('button', { name: /Link account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic/callback', {
        code: 'url-code-456',
        state: defaultProps.state,
      })
      expect(defaultProps.onLinked).toHaveBeenCalled()
    })
  })

  it('automatically refreshes state and retries if session expired error is received', async () => {
    // First call to callback fails with expired error
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce({
        response: { data: { detail: 'Epic linking session expired. Please try again.' } },
      })
      // Next call to /auth/oauth/epic provides a fresh state
      .mockResolvedValueOnce({
        data: { state: 'brand-new-fresh-state' },
      })
      // Second call to callback succeeds with fresh state
      .mockResolvedValueOnce({
        data: { connected: true },
      })

    const user = userEvent.setup()
    render(<EpicCodeModal {...defaultProps} />)

    const textarea = screen.getByLabelText(/Authorization code/i)
    await user.type(textarea, 'my-auth-code-777')

    const submitButton = screen.getByRole('button', { name: /Link account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic/callback', {
        code: 'my-auth-code-777',
        state: defaultProps.state,
      })
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic')
      expect(apiClient.post).toHaveBeenCalledWith('/auth/oauth/epic/callback', {
        code: 'my-auth-code-777',
        state: 'brand-new-fresh-state',
      })
      expect(defaultProps.onLinked).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })
})

