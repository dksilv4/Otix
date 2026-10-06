import React, { useEffect, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import { useToast } from '@ui/molecules/toast';
import { DkInput } from '@ui/atoms/input';
import { DkDropdown } from '@ui/atoms/dropdown';
import { DkSwitch } from '@ui/atoms/switch';
import {
  useNodeRadarrConfig,
  useServerRadarrConfig,
  useSaveNodeRadarrConfig,
  useSaveServerRadarrConfig,
  useTestRadarr,
  useNodeRadarrQualityProfiles,
  useServerRadarrQualityProfiles,
  useNodeRadarrRootFolders,
  useServerRadarrRootFolders,
  useNodeSonarrConfig,
  useServerSonarrConfig,
  useSaveNodeSonarrConfig,
  useSaveServerSonarrConfig,
  useTestSonarr,
  useNodeSonarrQualityProfiles,
  useServerSonarrQualityProfiles,
  useNodeSonarrRootFolders,
  useServerSonarrRootFolders,
} from '../use-server-arr';
import type { ArrConnectionTestResult, ServerRadarrConfig, ServerSonarrConfig } from '../arr-types';
import { createArrInstance, normalizeArrInstances, type ArrServiceInstance } from '../arr-instances';
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
import { ArrLibraryDefaults } from './arr-library-defaults';
import { ArrInstanceSwitcher } from './arr-instance-switcher';

export type ArrAppType = 'radarr' | 'sonarr';

export interface NodeArrSettingsModalProps {
  appType: ArrAppType;
  nodeId?: number;
  nodeName?: string;
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

export type ServerArrSettingsModalProps = NodeArrSettingsModalProps;

interface ArrFormProps {
  appType: ArrAppType;
  config?: ServerRadarrConfig | ServerSonarrConfig;
  targetNodeId: number;
  targetNodeName: string;
  onClose: () => void;
}

const ArrForm = ({
  appType,
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: ArrFormProps) => {
  const isRadarr = appType === 'radarr';
  const defaultPort = isRadarr ? 7878 : 8989;
  const { toast } = useToast();

  const saveRadarrHook = useSaveServerRadarrConfig || useSaveNodeRadarrConfig;
  const saveSonarrHook = useSaveServerSonarrConfig || useSaveNodeSonarrConfig;
  const radarrSave = saveRadarrHook(targetNodeId);
  const sonarrSave = saveSonarrHook(targetNodeId);
  const saveMutation = isRadarr ? radarrSave : sonarrSave;

  const radarrTest = useTestRadarr(targetNodeId);
  const sonarrTest = useTestSonarr(targetNodeId);
  const testMutation = isRadarr ? radarrTest : sonarrTest;

  const [instances, setInstances] = useState<ArrServiceInstance[]>(() =>
    normalizeArrInstances(config, defaultPort)
  );
  const [selectedId, setSelectedId] = useState(instances[0]?.id);
  const selected = instances.find((item) => item.id === selectedId) || instances[0];
  const [testResult, setTestResult] = useState<ArrConnectionTestResult | null>(null);

  const radarrProfilesHook = useServerRadarrQualityProfiles || useNodeRadarrQualityProfiles;
  const sonarrProfilesHook = useServerSonarrQualityProfiles || useNodeSonarrQualityProfiles;
  const radarrProfiles = radarrProfilesHook(targetNodeId, selected?.id, { enabled: false });
  const sonarrProfiles = sonarrProfilesHook(targetNodeId, selected?.id, { enabled: false });
  const { data: qualityProfiles = [], refetch: refetchProfiles } = isRadarr ? radarrProfiles : sonarrProfiles;

  const radarrFoldersHook = useServerRadarrRootFolders || useNodeRadarrRootFolders;
  const sonarrFoldersHook = useServerSonarrRootFolders || useNodeSonarrRootFolders;
  const radarrFolders = radarrFoldersHook(targetNodeId, selected?.id, { enabled: false });
  const sonarrFolders = sonarrFoldersHook(targetNodeId, selected?.id, { enabled: false });
  const { data: rootFolders = [], refetch: refetchFolders } = isRadarr ? radarrFolders : sonarrFolders;

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

  const updateSelected = (patch: Partial<ArrServiceInstance>) => {
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
      const res = await testMutation.mutateAsync({
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
      const payload: any = {
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
      };
      if (!isRadarr) {
        payload.series_type = primary.series_type;
        payload.season_folder = primary.season_folder;
      }
      await saveMutation.mutateAsync(payload);
      toast({ title: 'Settings saved', description: `Updated on ${targetNodeName}.`, variant: 'success' });
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
          isTesting={testMutation.isPending}
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
          const created = createArrInstance({ name: `Instance ${instances.length + 1}` }, defaultPort);
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
          id={`${appType}-instance-name`}
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
          defaultPort={defaultPort}
          hostPlaceholder={`127.0.0.1 or ${appType}.local`}
          urlBasePlaceholder={`e.g. /${appType}`}
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
          rootPlaceholder={isRadarr ? '/movies' : '/tv'}
        >
          {!isRadarr && (
            <>
              <DkDropdown
                label="Series Type"
                value={selected.series_type || 'standard'}
                onChange={(series_type) => updateSelected({ series_type })}
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'anime', label: 'Anime' },
                ]}
              />
              <div className="flex items-center">
                <DkSwitch
                  checked={selected.season_folder ?? true}
                  onCheckedChange={(season_folder) => updateSelected({ season_folder })}
                  label="Create season folders"
                />
              </div>
            </>
          )}
        </ArrLibraryDefaults>
      </IntegrationCardSection>
    </IntegrationModalForm>
  );
};

export const NodeArrSettingsModal = ({
  appType,
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeArrSettingsModalProps) => {
  const isRadarr = appType === 'radarr';
  const effectiveId = nodeId ?? serverId;
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node');
  const { targetNodeId, targetNodeName } = useIntegrationTargetNode(effectiveId, effectiveName);
  const radarrConfigHook = useServerRadarrConfig || useNodeRadarrConfig;
  const sonarrConfigHook = useServerSonarrConfig || useNodeSonarrConfig;
  const radarrConfigQuery = radarrConfigHook(targetNodeId);
  const sonarrConfigQuery = sonarrConfigHook(targetNodeId);
  const { data: config, isLoading } = isRadarr ? radarrConfigQuery : sonarrConfigQuery;

  return (
    <NodeIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title={isRadarr ? 'Radarr' : 'Sonarr'}
      description={targetNodeId ? `On ${targetNodeName}` : undefined}
      icon={isRadarr ? Film : Tv}
      badge={isRadarr ? 'Movies' : 'TV Series'}
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName={isRadarr ? 'Radarr' : 'Sonarr'}
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <ArrForm
          key={`${appType}-${targetNodeId}`}
          appType={appType}
          config={config}
          targetNodeId={targetNodeId}
          targetNodeName={targetNodeName}
          onClose={onClose}
        />
      ) : null}
    </NodeIntegrationModalShell>
  );
};

export const ServerArrSettingsModal = NodeArrSettingsModal;
