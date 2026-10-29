import React, { useState, useEffect } from 'react'
import { Gamepad2, Copy, Check, ExternalLink } from 'lucide-react'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import {
  useSaveServerG4UConfig,
  useSaveNodeG4UConfig,
  useServerUsenetConfig,
  useNodeUsenetConfig,
  useTestG4U,
} from '../use-server-usenet'
import type { ConnectionTestResult, ServerUsenetConfig } from '../usenet-types'
import {
  NodeIntegrationModalShell,
  IntegrationCardSection,
  IntegrationEmptyNodeState,
  IntegrationModalFooter,
} from './node-integration-modal-shell'
import { useResetConnectionTest } from './use-reset-connection-test'
import { useIntegrationTargetNode } from './use-integration-target-node'
import { IntegrationModalForm } from './integration-modal-form'
import { isG4UConfigured, buildG4URSSUrl } from '../usenet-utils'

export interface NodeG4USettingsModalProps {
  nodeId?: number
  nodeName?: string
  serverId?: number
  serverName?: string
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
}

export type ServerG4USettingsModalProps = NodeG4USettingsModalProps

interface G4UFormProps {
  config?: ServerUsenetConfig
  targetNodeId: number
  targetNodeName: string
  onClose: () => void
}

const G4UForm = ({
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: G4UFormProps) => {
  const { toast } = useToast()
  const saveHook = useSaveServerG4UConfig || useSaveNodeG4UConfig
  const saveMutation = saveHook(targetNodeId)
  const testG4UMutation = useTestG4U(targetNodeId)

  const initialG4U = config?.g4u
  const isConfigured = isG4UConfigured(initialG4U)

  const [url, setUrl] = useState(initialG4U?.url || 'https://g4u.to/api/')
  const [apiKey, setApiKey] = useState(initialG4U?.api_key || (initialG4U as any)?.apiKey || '')
  const [enabled, setEnabled] = useState(initialG4U?.enabled !== false)
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null)
  const [copiedRss, setCopiedRss] = useState(false)

  useEffect(() => {
    if (initialG4U) {
      if (initialG4U.url) setUrl(initialG4U.url)
      const key = initialG4U.api_key || (initialG4U as any)?.apiKey
      if (key) setApiKey(key)
      if (initialG4U.enabled !== undefined) setEnabled(initialG4U.enabled)
    }
  }, [initialG4U])

  useResetConnectionTest(
    {
      url,
      apiKey,
      enabled,
    },
    () => setTestResult(null),
  )

  const effectiveKey = apiKey.trim() || (isConfigured ? (initialG4U?.api_key || (initialG4U as any)?.apiKey || '') : '')
  const rssUrl = buildG4URSSUrl(url, effectiveKey)

  const handleCopyRss = async () => {
    try {
      await navigator.clipboard.writeText(rssUrl)
      setCopiedRss(true)
      toast({
        title: 'Copied to clipboard',
        description: 'g4u.to RSS feed URL copied for SABnzbd',
        variant: 'success',
      })
      setTimeout(() => setCopiedRss(false), 2000)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy the URL manually.',
        variant: 'error',
      })
    }
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      const res = await testG4UMutation.mutateAsync({
        url: url.trim(),
        api_key: effectiveKey || undefined,
      })
      setTestResult(res)
      if (res.ok) {
        toast({
          title: 'Connected',
          description: `${res.message} — click Save to apply.`,
          variant: 'success',
        })
      } else {
        toast({ title: 'Connection failed', description: res.message, variant: 'error' })
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error'
      setTestResult({ ok: false, message: msg })
      toast({ title: 'Error', description: msg, variant: 'error' })
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await saveMutation.mutateAsync({
        url: url.trim(),
        api_key: effectiveKey,
        enabled,
      })
      toast({
        title: 'Settings saved',
        description: `g4u.to indexer configured on ${targetNodeName}.`,
        variant: 'success',
      })
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update configuration.'
      toast({
        title: 'Failed to save',
        description: msg,
        variant: 'error',
      })
    }
  }

  return (
    <IntegrationModalForm
      onSubmit={handleSave}
      footer={
        <IntegrationModalFooter
          onCancel={onClose}
          isSaving={saveMutation.isPending}
          onTest={handleTest}
          isTesting={testG4UMutation.isPending}
          testResult={testResult}
          isConfigured={isConfigured}
        />
      }
    >
      <IntegrationCardSection title="Connection Details">
        <div className="space-y-4">
          <DkInput
            id="g4u-url"
            label="API URL"
            placeholder="https://g4u.to/api/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />

          <div>
            <DkInput
              id="g4u-api-key"
              label="API Key"
              type="password"
              placeholder={isConfigured ? '••••••••••••••••' : 'Enter your g4u API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required={!isConfigured}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Required for searching releases and downloading NZB files from g4u.to.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium text-foreground">Enable g4u.to indexer</p>
              <p className="text-[11px] text-muted-foreground">
                Include PC games (category 4050) when searching on this node
              </p>
            </div>
            <DkSwitch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Enable g4u.to indexer"
            />
          </div>
        </div>
      </IntegrationCardSection>

      <IntegrationCardSection title="SABnzbd RSS Feed & Newznab Setup">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            g4u.to is a dedicated Newznab PC games indexer (Category 4050). You can also add this direct feed URL into SABnzbd (<strong>Config → RSS</strong>) for automated release syncing.
          </p>

          <div className="flex items-center gap-2 rounded-xl bg-[var(--dk-surface-field)] p-2 border border-white/[0.04]">
            <input
              type="text"
              readOnly
              value={rssUrl}
              className="flex-1 bg-transparent px-2 font-mono text-xs text-foreground focus:outline-none select-all truncate"
            />
            <DkButton
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleCopyRss}
              className="shrink-0 gap-1.5 text-xs"
            >
              {copiedRss ? (
                <>
                  <Check className="h-3.5 w-3.5 text-primary" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Feed URL</span>
                </>
              )}
            </DkButton>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            <span>Root endpoint: <code className="rounded bg-[var(--dk-surface-field)] px-1 py-0.5 text-foreground font-mono">https://g4u.to/</code> (category 4050)</span>
          </div>
        </div>
      </IntegrationCardSection>
    </IntegrationModalForm>
  )
}

export const NodeG4USettingsModal = ({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeG4USettingsModalProps) => {
  const effectiveId = nodeId ?? serverId
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node')
  const { targetNodeId, targetNodeName } = useIntegrationTargetNode(effectiveId, effectiveName)
  const configHook = useServerUsenetConfig || useNodeUsenetConfig
  const { data: config, isLoading } = configHook(targetNodeId)

  return (
    <NodeIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="g4u.to"
      description={targetNodeId ? `PC Games Indexer on ${targetNodeName}` : 'PC Games Indexer'}
      icon={Gamepad2}
      brandBgClass="text-primary"
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName="g4u.to"
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <G4UForm
          key={`${targetNodeId}-${config ? 'ready' : 'loading'}`}
          config={config}
          targetNodeId={targetNodeId}
          targetNodeName={targetNodeName}
          onClose={onClose}
        />
      ) : null}
    </NodeIntegrationModalShell>
  )
}

export const ServerG4USettingsModal = NodeG4USettingsModal
