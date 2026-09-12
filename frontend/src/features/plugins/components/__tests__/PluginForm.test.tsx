import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PluginForm } from '../PluginForm'
import type { PluginConfigField } from '@/features/plugins/types/plugins'

const fields: Record<string, PluginConfigField> = {
  name: { type: 'string', label: 'Name', required: true },
  port: { type: 'number', label: 'Port', default: 8080, min: 1, max: 65535 },
  token: { type: 'secret', label: 'API Token' },
  mode: { type: 'enum', label: 'Mode', values: ['auto', 'manual'] },
  region: { type: 'select', label: 'Region', values: [{ value: 'eu', label: 'Europe' }] },
  enabled: { type: 'boolean', label: 'Enabled' },
}

describe('PluginForm', () => {
  it('renders each field type', () => {
    render(<PluginForm fields={fields} values={{}} onChange={() => {}} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Port')).toBeInTheDocument()
    expect(screen.getByText('API Token')).toBeInTheDocument()
    expect(screen.getByText('Mode')).toBeInTheDocument()
    expect(screen.getByText('Region')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  it('calls onChange for text and number inputs', () => {
    const onChange = vi.fn()
    render(<PluginForm fields={{ name: fields.name, port: fields.port }} values={{}} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Otix' } })
    expect(onChange).toHaveBeenCalledWith('name', 'Otix')

    fireEvent.change(screen.getByLabelText('Port'), { target: { value: '9090' } })
    expect(onChange).toHaveBeenCalledWith('port', 9090)
  })

  it('calls onChange for boolean switch', () => {
    const onChange = vi.fn()
    render(<PluginForm fields={{ enabled: fields.enabled }} values={{ enabled: false }} onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith('enabled', true)
  })

  it('reveals secret on eye toggle', () => {
    render(<PluginForm fields={{ token: fields.token }} values={{ token: 'abc' }} onChange={() => {}} />)
    const input = screen.getByLabelText(/API Token/) as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByRole('button', { name: /reveal secret/i }))
    expect((screen.getByLabelText(/API Token/) as HTMLInputElement).type).toBe('text')
  })

  it('groups fields into sections and orders them', () => {
    const sFields: Record<string, PluginConfigField> = {
      b: { type: 'string', label: 'Beta', section: 'Network', order: 1 },
      a: { type: 'string', label: 'Alpha', section: 'Network', order: 0 },
      c: { type: 'string', label: 'Gamma', section: 'General' },
    }
    render(<PluginForm fields={sFields} values={{}} onChange={() => {}} />)

    const labels = screen.getAllByText(/Alpha|Beta|Gamma/)
    expect(labels.map((el) => el.textContent)).toEqual(['Gamma', 'Alpha', 'Beta'])
  })

  it('hides fields that fail visibility conditions', () => {
    const cond: Record<string, PluginConfigField> = {
      mode: { type: 'enum', label: 'Mode', values: ['auto', 'manual'] },
      interval: {
        type: 'number',
        label: 'Interval',
        if: { field: 'mode', equals: 'auto' },
      },
    }
    render(<PluginForm fields={cond} values={{ mode: 'manual' }} onChange={() => {}} />)
    expect(screen.queryByText('Interval')).not.toBeInTheDocument()
  })

  it('keeps advanced fields collapsed until expanded', () => {
    const adv: Record<string, PluginConfigField> = {
      normal: { type: 'string', label: 'Normal' },
      hidden: { type: 'string', label: 'Deep Setting', advanced: true },
    }
    render(<PluginForm fields={adv} values={{}} onChange={() => {}} />)
    expect(screen.queryByText('Deep Setting')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Advanced'))
    expect(screen.getByText('Deep Setting')).toBeInTheDocument()
  })

  it('renders save and test buttons in footer when not inline', () => {
    render(
      <PluginForm
        fields={fields}
        values={{}}
        onChange={() => {}}
        onTest={() => {}}
        onSubmit={() => {}}
      />,
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
    expect(screen.getByText('Test Connection')).toBeInTheDocument()
  })
})
