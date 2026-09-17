import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@ui/molecules/toast';
import {
  useProwlarrIndexers,
  useSaveServerProwlarrConfig,
  useServerUsenetConfig,
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
  ServerIntegrationModalShell,
  IntegrationCardSection,
  IntegrationEmptyServerState,
  IntegrationModalFooter,
  useResetConnectionTest,
} from './server-integration-modal-shell';
import { useIntegrationTargetServer } from './use-integration-target-server';
import { IntegrationConnectionFields } from './integration-connection-fields';
import { IntegrationModalForm } from './integration-modal-form';
import { normalizeProwlarrIndexers } from '../usenet-utils';
import { ProwlarrIndexersPanel } from './prowlarr-indexers-panel';

export interface ServerProwlarrSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

interface ProwlarrFormProps {
  config?: ServerUsenetConfig;
  targetServerId: number;
  targetServerName: string;
  onClose: () => void;
}

function ProwlarrForm({
  config,
  targetServerId,
  targetServerName,
  onClose,
}: ProwlarrFormProps) {
  const { toast } = useToast();
  const saveMutation = useSaveServerProwlarrConfig(targetServerId);
  const testProwlarrMutation = useTestProwlarr(targetServerId);
  const syncMutation = useSyncProwlarrIndexers(targetServerId);

  const initialProw = config?.prowlarr;
  const isConfigured = Boolean(
    initialProw?.host &&
    Boolean(initialProw?.api_key || initialProw?.configured)
  );
  const [prowlarrHost, setProwlarrHost] = useState(initialProw?.host || '127.0.0.1');
  const [prowlarrPort, setProwlarrPort] = useState(initialProw?.port || 9696);
  const [prowlarrApiKey, setProwlarrApiKey] = useState(initialProw?.api_key || '');
  const [prowlarrSsl, setProwlarrSsl] = useState(Boolean(initialProw?.use_ssl));
  const [prowlarrUrlBase, setProwlarrUrlBase] = useState(initialProw?.url_base || '');
  const [selectedCategories, setSelectedCategories] = useState<number[]>(() =>
    categoriesFromConfig(initialProw?.categories)
  );
  const [prowlarrTestResult, setProwlarrTestResult] = useState<ConnectionTestResult | null>(null);
  const [syncProtocol, setSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all');
  const [syncedIndexers, setSyncedIndexers] = useState<ProwlarrIndexerItem[]>([]);

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
    targetServerId
  );
  const activeIndexers = fetchedIndexers.length > 0 ? fetchedIndexers : syncedIndexers;

  const handleTestProwlarr = async () => {
    setProwlarrTestResult(null);
    try {
      const res = await testProwlarrMutation.mutateAsync({
        host: prowlarrHost.trim(),
        port: Number(prowlarrPort),
        api_key: prowlarrApiKey.trim() || undefined,
        use_ssl: prowlarrSsl,
        url_base: prowlarrUrlBase.trim() || undefined,
      });
      setProwlarrTestResult(res);
      if (res.ok) {
        toast({ title: 'Connected', description: res.message, variant: 'success' });
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
        description: res.message,
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
      await saveMutation.mutateAsync({
        host: prowlarrHost.trim(),
        port: Number(prowlarrPort),
        api_key: prowlarrApiKey.trim(),
        use_ssl: prowlarrSsl,
        url_base: prowlarrUrlBase.trim(),
        categories: selectedCategories.length > 0 ? selectedCategories : [...DEFAULT_PROWLARR_CATEGORIES],
      });
      toast({
        title: 'Settings saved',
        description: `Configured on ${targetServerName}.`,
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
}

export function ServerProwlarrSettingsModal({
  serverId,
  serverName = 'Server',
  isOpen = true,
  isExiting,
  onClose,
}: ServerProwlarrSettingsModalProps) {
  const { targetServerId, targetServerName } = useIntegrationTargetServer(serverId, serverName);
  const { data: config, isLoading } = useServerUsenetConfig(targetServerId);

  return (
    <ServerIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="Prowlarr"
      description={targetServerId ? `On ${targetServerName}` : undefined}
      icon={Search}
      brandBgClass="text-rose-400"
      isLoading={isLoading}
      hasServer={Boolean(targetServerId)}
      emptyServerState={
        <IntegrationEmptyServerState
          serviceName="Prowlarr"
          onClose={onClose}
        />
      }
    >
      {targetServerId ? (
        <ProwlarrForm
          key={targetServerId}
          config={config}
          targetServerId={targetServerId}
          targetServerName={targetServerName}
          onClose={onClose}
        />
      ) : null}
    </ServerIntegrationModalShell>
  );
}
