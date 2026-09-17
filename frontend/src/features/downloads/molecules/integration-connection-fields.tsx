import React from 'react'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { parseServiceAddress } from '../usenet-utils'

export interface IntegrationConnectionFieldsProps {
  host: string
  port: number
  apiKey: string
  useSsl: boolean
  urlBase: string
  onHostChange: (host: string) => void
  onPortChange: (port: number) => void
  onApiKeyChange: (apiKey: string) => void
  onUseSslChange: (useSsl: boolean) => void
  onUrlBaseChange: (urlBase: string) => void
  isConfigured?: boolean
  defaultPort?: number
  focusClass?: string
  checkboxClass?: string
  apiKeyHint?: string
  hostPlaceholder?: string
  urlBasePlaceholder?: string
  children?: React.ReactNode
}

function looksLikeAddressPaste(val: string) {
  return /^https?:\/\//i.test(val) || val.includes(',') || /:\d+/.test(val) || /\/.+/.test(val)
}

export function IntegrationConnectionFields({
  host,
  port,
  apiKey,
  useSsl,
  urlBase,
  onHostChange,
  onPortChange,
  onApiKeyChange,
  onUseSslChange,
  onUrlBaseChange,
  isConfigured = false,
  defaultPort,
  apiKeyHint,
  hostPlaceholder = '127.0.0.1 or service.local',
  urlBasePlaceholder = 'e.g. /service',
  children,
}: IntegrationConnectionFieldsProps) {
  const handleHostChange = (val: string) => {
    if (looksLikeAddressPaste(val)) {
      const parsed = parseServiceAddress(val, defaultPort)
      onHostChange(parsed.host)
      if (parsed.port) onPortChange(parsed.port)
      if (parsed.use_ssl !== undefined) onUseSslChange(parsed.use_ssl)
      if (parsed.url_base) onUrlBaseChange(parsed.url_base)
    } else {
      onHostChange(val)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <DkInput
            id="integration-host"
            label="Host"
            required
            placeholder={hostPlaceholder}
            value={host}
            onChange={(e) => handleHostChange(e.target.value)}
          />
        </div>
        <DkInput
          id="integration-port"
          label="Port"
          type="number"
          required
          placeholder={String(defaultPort ?? '')}
          value={port}
          onChange={(e) => onPortChange(Number(e.target.value))}
        />
      </div>
      <p className="pl-4 text-xs text-white/50">
        Paste a URL to fill host, port, SSL, and URL base.
      </p>
    </div>

      <DkInput
        id="integration-api-key"
        label="API Key"
        type="password"
        placeholder={isConfigured ? '••••••••••••••••' : 'Paste API key'}
        value={apiKey}
        onChange={(e) => onApiKeyChange(e.target.value)}
        hint={apiKeyHint}
      />

      <DkInput
        id="integration-url-base"
        label="URL Base"
        placeholder={urlBasePlaceholder}
        value={urlBase}
        onChange={(e) => onUrlBaseChange(e.target.value)}
      />

      {children}

      <div className="flex items-center">
        <DkSwitch
          checked={useSsl}
          onCheckedChange={onUseSslChange}
          label="Use SSL"
        />
      </div>
    </div>
  )
}
