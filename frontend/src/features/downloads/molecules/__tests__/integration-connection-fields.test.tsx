import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { IntegrationConnectionFields } from '../integration-connection-fields'

function Harness({
  initialHost = '127.0.0.1',
  initialPort = 8080,
  initialApiKey = '',
  initialSsl = false,
  initialUrlBase = '',
}: {
  initialHost?: string
  initialPort?: number
  initialApiKey?: string
  initialSsl?: boolean
  initialUrlBase?: string
}) {
  const [host, setHost] = useState(initialHost)
  const [port, setPort] = useState(initialPort)
  const [apiKey, setApiKey] = useState(initialApiKey)
  const [useSsl, setUseSsl] = useState(initialSsl)
  const [urlBase, setUrlBase] = useState(initialUrlBase)

  return (
    <IntegrationConnectionFields
      host={host}
      port={port}
      apiKey={apiKey}
      useSsl={useSsl}
      urlBase={urlBase}
      onHostChange={setHost}
      onPortChange={setPort}
      onApiKeyChange={setApiKey}
      onUseSslChange={setUseSsl}
      onUrlBaseChange={setUrlBase}
      defaultPort={8080}
    />
  )
}

describe('IntegrationConnectionFields', () => {
  it('shows SSL and URL base inline without an Advanced disclosure', () => {
    render(<Harness />)

    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Use SSL/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/URL Base/i)).toBeInTheDocument()
    expect(screen.getByText('Host', { selector: 'label' }).className).toMatch(/pl-4/)
    expect(screen.getByText(/Paste a URL/i).className).toMatch(/pl-4/)
  })

  it('places the SSL switch after every text input, never between fields', () => {
    render(<Harness />)

    const ssl = screen.getByRole('switch', { name: /Use SSL/i })
    for (const name of [/^Host/, /^Port/, /API Key/i, /URL Base/i]) {
      const field = screen.getByLabelText(name)
      expect(field.compareDocumentPosition(ssl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('does not render Test connection beside SSL', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /^Test connection$/i })).not.toBeInTheDocument()
  })

  it('reflects SSL when already enabled', () => {
    render(<Harness initialSsl />)
    expect(screen.getByRole('switch', { name: /Use SSL/i })).toBeChecked()
  })

  it('shows an existing URL base value', () => {
    render(<Harness initialUrlBase="/sabnzbd" />)
    expect(screen.getByDisplayValue('/sabnzbd')).toBeInTheDocument()
  })

  it('parses a pasted URL into host, port, SSL, and URL base', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const hostInput = screen.getByLabelText(/^Host/)
    await user.clear(hostInput)
    await user.paste('https://nas.local:8080/sabnzbd')

    expect(hostInput).toHaveValue('nas.local')
    expect(screen.getByLabelText(/^Port/)).toHaveValue(8080)
    expect(screen.getByRole('switch', { name: /Use SSL/i })).toBeChecked()
    expect(screen.getByDisplayValue('/sabnzbd')).toBeInTheDocument()
  })
})
