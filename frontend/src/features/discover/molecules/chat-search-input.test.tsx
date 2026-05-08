import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatSearchInput } from './chat-search-input'

describe('ChatSearchInput', () => {
  it('renders with placeholder text', () => {
    render(
      <ChatSearchInput value="" onChange={vi.fn()} placeholder="What are you in the mood for?" />,
    )
    const input = screen.getByPlaceholderText('What are you in the mood for?')
    expect(input).toBeInTheDocument()
  })

  it('renders with a default placeholder', () => {
    render(<ChatSearchInput value="" onChange={vi.fn()} />)
    const input = screen.getByPlaceholderText('What are you in the mood for?')
    expect(input).toBeInTheDocument()
  })

  it('renders the value in the input', () => {
    render(<ChatSearchInput value="test query" onChange={vi.fn()} />)
    const input = screen.getByDisplayValue('test query')
    expect(input).toBeInTheDocument()
  })

  it('calls onChange when input changes', async () => {
    const onChange = vi.fn()
    render(<ChatSearchInput value="" onChange={onChange} />)

    const input = screen.getByPlaceholderText('What are you in the mood for?')
    await userEvent.type(input, 'a')

    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('shows send button when value is non-empty', () => {
    render(<ChatSearchInput value="test" onChange={vi.fn()} />)
    const sendButton = screen.getByLabelText('Search')
    expect(sendButton).toBeInTheDocument()
  })

  it('hides send button when value is empty', () => {
    render(<ChatSearchInput value="" onChange={vi.fn()} />)
    expect(screen.queryByLabelText('Search')).not.toBeInTheDocument()
  })

  it('calls onSubmit when send button is clicked', async () => {
    const onSubmit = vi.fn()
    render(<ChatSearchInput value="test" onChange={vi.fn()} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByLabelText('Search'))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('calls onSubmit on Enter key', () => {
    const onSubmit = vi.fn()
    render(<ChatSearchInput value="test" onChange={vi.fn()} onSubmit={onSubmit} />)

    const input = screen.getByDisplayValue('test')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('does not call onSubmit on Enter without handler', () => {
    render(<ChatSearchInput value="test" onChange={vi.fn()} />)

    const input = screen.getByDisplayValue('test')
    // Should not throw
    fireEvent.keyDown(input, { key: 'Enter' })
  })

  it('renders Discover mode button', () => {
    render(<ChatSearchInput value="" onChange={vi.fn()} />)
    expect(screen.getByText('Discover')).toBeInTheDocument()
  })

  it('renders with Sparkles icon', () => {
    const { container } = render(<ChatSearchInput value="" onChange={vi.fn()} />)
    // lucide-react Sparkles renders as an SVG
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('disables input when disabled prop is true', () => {
    render(<ChatSearchInput value="" onChange={vi.fn()} disabled />)
    const input = screen.getByPlaceholderText('What are you in the mood for?')
    expect(input).toBeDisabled()
  })

  it('applies custom className', () => {
    const { container } = render(
      <ChatSearchInput value="" onChange={vi.fn()} className="custom-class" />,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })
})
