import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@ui/molecules/toast';
import {
  useProwlarrIndexers,
  useSaveServerProwlarrConfig,
  useSaveNodeProwlarrConfig,
  useServerUsenetConfig,
  useNodeUsenetConfig,
  useSyncProwlarrIndexers,
  useTestProwlarr,
} from '../use-server-usenet';
import type { ConnectionTestResult, ProwlarrIndexerItem, ServerUsenetConfig } from '../usenet-types';
import {
  categoriesFromConfig,
  DEFAULT_PROWLARR_CATEGORIES,
  PROWLARR_CATEGORY_GROUPS,
  toggleProwlarrCategory,
} from '../prowlarr-categories';
import {
  NodeIntegrationModalShell,
  IntegrationCardSection,
  IntegrationEmptyNodeState,
  IntegrationModalFooter,
} from './node-integration-modal-shell';
import { useResetConnectionTest } from './use-reset-connection-test';
import { useIntegrationTargetNode } from './use-integration-target-node';
import { IntegrationConnectionFields } from './integration-connection-fields';
import { IntegrationModalForm } from './integration-modal-form';
import { normalizeProwlarrIndexers, isProwlarrConfigured } from '../usenet-utils';
import { ProwlarrIndexersPanel } from './prowlarr-indexers-panel';

export interface NodeProwlarrSettingsModalProps {
  nodeId?: number;
  nodeName?: string;
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

export type ServerProwlarrSettingsModalProps = NodeProwlarrSettingsModalProps;

interface ProwlarrFormProps {
  config?: ServerUsenetConfig;
  targetNodeId: number;
  targetNodeName: string;
  onClose: () => void;
}

const ProwlarrForm = ({
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: ProwlarrFormProps) => {
  const { toast } = useToast();
  const saveHook = useSaveServerProwlarrConfig || useSaveNodeProwlarrConfig;
  const saveMutation = saveHook(targetNodeId);
  const testProwlarrMutation = useTestProwlarr(targetNodeId);
  const syncMutation = useSyncProwlarrIndexers(targetNodeId);

  const initialProw = config?.prowlarr;
  const isConfigured = isProwlarrConfigured(initialProw);
  const [prowlarrHost, setProwlarrHost] = useState(initialProw?.host || '127.0.0.1');
  const [prowlarrPort, setProwlarrPort] = useState(initialProw?.port || 9696);
  const [prowlarrApiKey, setProwlarrApiKey] = useState(initialProw?.api_key || (initialProw as any)?.apiKey || '');
  const [prowlarrSsl, setProwlarrSsl] = useState(Boolean(initialProw?.use_ssl ?? (initialProw as any)?.useSsl));
  const [prowlarrUrlBase, setProwlarrUrlBase] = useState(initialProw?.url_base || (initialProw as any)?.urlBase || '');
  const [selectedCategories, setSelectedCategories] = useState<number[]>(() =>
    categoriesFromConfig(initialProw?.categories)
  );
  const [prowlarrTestResult, setProwlarrTestResult] = useState<ConnectionTestResult | null>(null);
  const [syncProtocol, setSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all');
  const [syncedIndexers, setSyncedIndexers] = useState<ProwlarrIndexerItem[]>([]);

  useEffect(() => {
    if (initialProw) {
      if (initialProw.host) setProwlarrHost(initialProw.host);
      if (initialProw.port) setProwlarrPort(initialProw.port);
      const key = initialProw.api_key || (initialProw as any)?.apiKey;
      if (key) setProwlarrApiKey(key);
      setProwlarrSsl(Boolean(initialProw.use_ssl ?? (initialProw as any)?.useSsl));
      setProwlarrUrlBase(initialProw.url_base || (initialProw as any)?.urlBase || '');
      if (initialProw.categories) {
        setSelectedCategories(categoriesFromConfig(initialProw.categories));
      }
    }
  }, [initialProw]);

  useResetConnectionTest(
    {
      host: prowlarrHost,
      port: Number(prowlarrPort),
      apiKey: prowlarrApiKey,
      useSsl: prowlarrSsl,
      urlBase: prowlarrUrlBase,
    },
    () => setProwlarrTestResult(null),
  );

  const { data: fetchedIndexers = [], refetch: refetchIndexers } = useProwlarrIndexers(
    targetNodeId
  );
  const activeIndexers = fetchedIndexers.length > 0 ? fetchedIndexers : syncedIndexers;

  const handleTestProwlarr = async () => {
    setProwlarrTestResult(null);
    try {
      const trimmedKey = prowlarrApiKey.trim();
      const existingKey = initialProw?.api_key || (initialProw as any)?.apiKey || '';
      const effectiveKey = trimmedKey || (isConfigured ? existingKey : '');
      const res = await testProwlarrMutation.mutateAsync({
        host: prowlarrHost.trim(),
        port: Number(prowlarrPort),
        api_key: effectiveKey || undefined,
        use_ssl: prowlarrSsl,
        url_base: prowlarrUrlBase.trim() || undefined,
      });
      setProwlarrTestResult(res);
      if (res.ok) {
        toast({
          title: 'Connected',
          description: `${res.message} — click Save to apply.`,
          variant: 'success',
        });
      } else {
        toast({ title: 'Connection failed', description: res.message, variant: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      setProwlarrTestResult({ ok: false, message: msg });
      toast({ title: 'Error', description: msg, variant: 'error' });
    }
  };

  const handleSyncIndexers = async () => {
    try {
      const res = await syncMutation.mutateAsync(syncProtocol);
      const listed = normalizeProwlarrIndexers(res);
      setSyncedIndexers(listed);
      await refetchIndexers();
      toast({
        title: 'Indexers synced',
        description: (res as any)?.message || 'Indexers synced successfully',
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not sync indexers.';
      toast({
        title: 'Sync failed',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmedKey = prowlarrApiKey.trim();
      const existingKey = initialProw?.api_key || (initialProw as any)?.apiKey || '';
      const effectiveKey = trimmedKey || (isConfigured ? existingKey : '');
      await saveMutation.mutateAsync({
        host: prowlarrHost.trim(),
        port: Number(prowlarrPort),
        api_key: effectiveKey,
        use_ssl: prowlarrSsl,
        url_base: prowlarrUrlBase.trim(),
        categories: selectedCategories.length > 0 ? selectedCategories : [...DEFAULT_PROWLARR_CATEGORIES],
      });
      toast({
        title: 'Settings saved',
        description: `Configured on ${targetNodeName}.`,
        variant: 'success',
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update configuration.';
      toast({
        title: 'Failed to save',
        description: msg,
        variant: 'error',
      });
    }
  };

  return (
    <IntegrationModalForm
      onSubmit={handleSave}
      footer={
        <IntegrationModalFooter
          onCancel={onClose}
          isSaving={saveMutation.isPending}
          onTest={handleTestProwlarr}
          isTesting={testProwlarrMutation.isPending}
          testResult={prowlarrTestResult}
          isConfigured={isConfigured}
        />
      }
    >
      <IntegrationCardSection>
        <IntegrationConnectionFields
        host={prowlarrHost}
        port={prowlarrPort}
        apiKey={prowlarrApiKey}
        useSsl={prowlarrSsl}
        urlBase={prowlarrUrlBase}
        onHostChange={setProwlarrHost}
        onPortChange={setProwlarrPort}
        onApiKeyChange={setProwlarrApiKey}
        onUseSslChange={setProwlarrSsl}
        onUrlBaseChange={setProwlarrUrlBase}
        isConfigured={isConfigured}
        defaultPort={9696}
        hostPlaceholder="127.0.0.1 or prowlarr.local"
        urlBasePlaceholder="e.g. /prowlarr"
      />
      </IntegrationCardSection>

      <IntegrationCardSection>
        <ProwlarrIndexersPanel
          protocol={syncProtocol}
          onProtocolChange={setSyncProtocol}
          onSync={() => void handleSyncIndexers()}
          isSyncing={syncMutation.isPending}
          indexers={activeIndexers}
        />

        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-white/60">Categories</p>
          <p className="text-xs leading-relaxed text-white/50">
            Choose the release groups Prowlarr should search. Console and PC are selected for games by default.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PROWLARR_CATEGORY_GROUPS.map((group) => {
              const selected = selectedCategories.includes(group.id)
              return (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedCategories((current) => toggleProwlarrCategory(current, group.id))}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer',
                    selected
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                  )}
                >
                  {group.label}
                </button>
              )
            })}
          </div>
        </div>
      </IntegrationCardSection>
    </IntegrationModalForm>
  );
};

export const NodeProwlarrSettingsModal = ({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeProwlarrSettingsModalProps) => {
  const effectiveId = nodeId ?? serverId;
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node');
  const { targetNodeId, targetNodeName } = useIntegrationTargetNode(effectiveId, effectiveName);
  const configHook = useServerUsenetConfig || useNodeUsenetConfig;
  const { data: config, isLoading } = configHook(targetNodeId);

  return (
    <NodeIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="Prowlarr"
      description={targetNodeId ? `Indexer Provider on ${targetNodeName}` : 'Indexer Provider'}
      icon={Search}
      brandBgClass="text-rose-400"
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName="Prowlarr"
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <ProwlarrForm
          key={`${targetNodeId}-${config ? 'ready' : 'loading'}`}
          config={config}
          targetNodeId={targetNodeId}
          targetNodeName={targetNodeName}
          onClose={onClose}
        />
      ) : null}
    </NodeIntegrationModalShell>
  );
};

export const ServerProwlarrSettingsModal = NodeProwlarrSettingsModal;
