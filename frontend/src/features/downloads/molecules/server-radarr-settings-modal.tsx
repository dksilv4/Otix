import React, { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { useToast } from '@/old-features/ui/molecules/toast';
import { DkInput } from '@/old-features/ui/atoms/input';
import {
  useServerRadarrConfig,
  useSaveServerRadarrConfig,
  useTestRadarr,
  useServerRadarrQualityProfiles,
  useServerRadarrRootFolders,
} from '../use-server-arr';
import type { ArrConnectionTestResult, ServerRadarrConfig } from '../arr-types';
import { createArrInstance, normalizeArrInstances, type ArrServiceInstance } from '../arr-instances';
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
import { ArrLibraryDefaults } from './arr-library-defaults';
import { ArrInstanceSwitcher } from './arr-instance-switcher';

export interface ServerRadarrSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

interface RadarrFormProps {
  config?: ServerRadarrConfig;
  targetServerId: number;
  targetServerName: string;
  onClose: () => void;
}

function RadarrForm({
  config,
  targetServerId,
  targetServerName,
  onClose,
}: RadarrFormProps) {
  const { toast } = useToast();
  const saveMutation = useSaveServerRadarrConfig(targetServerId);
  const testRadarrMutation = useTestRadarr(targetServerId);

  const [instances, setInstances] = useState<ArrServiceInstance[]>(() =>
    normalizeArrInstances(config, 7878)
  );
  const [selectedId, setSelectedId] = useState(instances[0]?.id);
  const selected = instances.find((item) => item.id === selectedId) || instances[0];
  const [testResult, setTestResult] = useState<ArrConnectionTestResult | null>(null);

  const { data: qualityProfiles = [], refetch: refetchProfiles } = useServerRadarrQualityProfiles(
    targetServerId,
    selected?.id,
    { enabled: false }
  );
  const { data: rootFolders = [], refetch: refetchFolders } = useServerRadarrRootFolders(
    targetServerId,
    selected?.id,
    { enabled: false }
  );

  useEffect(() => {
    if (qualityProfiles.length > 0 && selected && selected.quality_profile_id === undefined) {
      updateSelected({ quality_profile_id: qualityProfiles[0].id });
    }
  }, [qualityProfiles, selected?.id]);

  useEffect(() => {
    if (rootFolders.length > 0 && selected && !selected.root_folder_path) {
      updateSelected({ root_folder_path: rootFolders[0].path });
    }
  }, [rootFolders, selected?.id]);

  function updateSelected(patch: Partial<ArrServiceInstance>) {
    setInstances((items) =>
      items.map((item) => (item.id === selected?.id ? { ...item, ...patch } : item))
    );
  }

  const isConfigured = Boolean(selected?.host && selected?.api_key);

  useResetConnectionTest(
    {
      host: selected?.host || '',
      port: Number(selected?.port || 0),
      apiKey: selected?.api_key || '',
      useSsl: Boolean(selected?.use_ssl),
      urlBase: selected?.url_base || '',
    },
    () => setTestResult(null),
  );

  const handleTest = async () => {
    setTestResult(null);
    try {
      const res = await testRadarrMutation.mutateAsync({
        host: selected.host.trim(),
        port: Number(selected.port),
        api_key: (selected.api_key || '').trim(),
        use_ssl: Boolean(selected.use_ssl),
        url_base: (selected.url_base || '').trim(),
        instance_id: selected.id,
      });
      setTestResult(res);
      if (res.ok) {
        toast({ title: 'Connected', description: res.message || 'Connection successful.', variant: 'success' });
        await Promise.all([refetchProfiles(), refetchFolders()]);
      } else {
        toast({ title: 'Connection failed', description: res.message || 'Could not connect.', variant: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTestResult({ ok: false, message: msg });
      toast({ title: 'Connection failed', description: msg, variant: 'error' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const primary = instances.find((item) => item.enabled) || instances[0];
      await saveMutation.mutateAsync({
        enabled: true,
        host: primary.host.trim(),
        port: Number(primary.port),
        api_key: primary.api_key || undefined,
        use_ssl: Boolean(primary.use_ssl),
        url_base: primary.url_base || '',
        quality_profile_id: primary.quality_profile_id,
        root_folder_path: (primary.root_folder_path || '').trim(),
        instances: instances.map((item) => ({
          ...item,
          host: item.host.trim(),
          port: Number(item.port),
          api_key: item.api_key || '',
          url_base: item.url_base || '',
          root_folder_path: (item.root_folder_path || '').trim(),
        })),
      });
      toast({ title: 'Settings saved', description: `Updated on ${targetServerName}.`, variant: 'success' });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast({ title: 'Failed to save', description: msg, variant: 'error' });
    }
  };

  return (
    <IntegrationModalForm
      onSubmit={handleSave}
      footer={
        <IntegrationModalFooter
          onCancel={onClose}
          isSaving={saveMutation.isPending}
          onTest={handleTest}
          isTesting={testRadarrMutation.isPending}
          testResult={testResult}
          isConfigured={isConfigured}
        />
      }
    >
      <ArrInstanceSwitcher
        instances={instances}
        selectedId={selected.id}
        onSelect={(id) => {
          setSelectedId(id);
          setTestResult(null);
        }}
        onAdd={() => {
          const created = createArrInstance({ name: `Instance ${instances.length + 1}` }, 7878);
          setInstances((items) => [...items, created]);
          setSelectedId(created.id);
          setTestResult(null);
        }}
        onDelete={(id) => {
          if (instances.length <= 1) return;
          const remaining = instances.filter((item) => item.id !== id);
          setInstances(remaining);
          setSelectedId(remaining[0].id);
        }}
      />

      <IntegrationCardSection>
      <DkInput
        id="radarr-instance-name"
        label="Instance name"
        value={selected.name}
        onChange={(e) => updateSelected({ name: e.target.value })}
      />
      <IntegrationConnectionFields
        key={selected.id}
        host={selected.host}
        port={selected.port}
        apiKey={selected.api_key || ''}
        useSsl={Boolean(selected.use_ssl)}
        urlBase={selected.url_base || ''}
        onHostChange={(host) => updateSelected({ host })}
        onPortChange={(port) => updateSelected({ port })}
        onApiKeyChange={(api_key) => updateSelected({ api_key })}
        onUseSslChange={(use_ssl) => updateSelected({ use_ssl })}
        onUrlBaseChange={(url_base) => updateSelected({ url_base })}
        isConfigured={isConfigured}
        defaultPort={7878}
        hostPlaceholder="127.0.0.1 or radarr.local"
        urlBasePlaceholder="e.g. /radarr"
      />
      </IntegrationCardSection>

      <IntegrationCardSection title="Library">
        <ArrLibraryDefaults
          qualityProfiles={qualityProfiles}
          rootFolders={rootFolders}
          qualityProfileId={selected.quality_profile_id}
          rootFolderPath={selected.root_folder_path || ''}
          onQualityProfileChange={(quality_profile_id) => updateSelected({ quality_profile_id })}
          onRootFolderChange={(root_folder_path) => updateSelected({ root_folder_path })}
          onRefreshProfiles={() => refetchProfiles()}
          onRefreshFolders={() => refetchFolders()}
          rootPlaceholder="/movies"
        />
      </IntegrationCardSection>
    </IntegrationModalForm>
  );
}

export function ServerRadarrSettingsModal({
  serverId,
  serverName = 'Server',
  isOpen = true,
  isExiting,
  onClose,
}: ServerRadarrSettingsModalProps) {
  const { targetServerId, targetServerName } = useIntegrationTargetServer(serverId, serverName);
  const { data: radarrConfig, isLoading } = useServerRadarrConfig(targetServerId);

  return (
    <ServerIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="Radarr"
      description={targetServerId ? `On ${targetServerName}` : undefined}
      icon={Film}
      brandBgClass="text-amber-400"
      isLoading={isLoading}
      hasServer={Boolean(targetServerId)}
      emptyServerState={
        <IntegrationEmptyServerState
          serviceName="Radarr"
          onClose={onClose}
        />
      }
    >
      {targetServerId ? (
        <RadarrForm
          key={targetServerId}
          config={radarrConfig}
          targetServerId={targetServerId}
          targetServerName={targetServerName}
          onClose={onClose}
        />
      ) : null}
    </ServerIntegrationModalShell>
  );
}
