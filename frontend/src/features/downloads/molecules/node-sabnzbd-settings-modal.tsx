import React, { useState } from 'react';
import { DownloadCloud } from 'lucide-react';
import { useToast } from '@ui/molecules/toast';
import { DkInput } from '@ui/atoms/input';
import {
  useSaveServerSabnzbdConfig,
  useSaveNodeSabnzbdConfig,
  useServerUsenetConfig,
  useNodeUsenetConfig,
  useTestSabnzbd,
} from '../use-server-usenet';
import type { ConnectionTestResult, ServerUsenetConfig } from '../usenet-types';
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
import { IntegrationPathMappings, type PathMappingRow } from './integration-path-mappings';

export interface NodeSabnzbdSettingsModalProps {
  nodeId?: number;
  nodeName?: string;
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

export type ServerSabnzbdSettingsModalProps = NodeSabnzbdSettingsModalProps;

interface SabnzbdFormProps {
  config?: ServerUsenetConfig;
  targetNodeId: number;
  targetNodeName: string;
  onClose: () => void;
}

function SabnzbdForm({
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: SabnzbdFormProps) {
  const { toast } = useToast();
  const saveHook = useSaveServerSabnzbdConfig || useSaveNodeSabnzbdConfig;
  const saveMutation = saveHook(targetNodeId);
  const testSabMutation = useTestSabnzbd(targetNodeId);

  const initialSab = config?.sabnzbd;
  const isConfigured = Boolean(
    initialSab?.host &&
    Boolean(initialSab?.apiKey || initialSab?.api_key || initialSab?.configured)
  );
  const [sabHost, setSabHost] = useState(initialSab?.host || '127.0.0.1');
  const [sabPort, setSabPort] = useState(initialSab?.port || 8080);
  const [sabApiKey, setSabApiKey] = useState(initialSab?.apiKey || initialSab?.api_key || '');
  const [sabSsl, setSabSsl] = useState(Boolean(initialSab?.useSsl ?? initialSab?.use_ssl));
  const [sabUrlBase, setSabUrlBase] = useState(initialSab?.urlBase || initialSab?.url_base || '');
  const [sabCategory, setSabCategory] = useState(initialSab?.category || 'games');
  const configuredMappings = initialSab?.pathMappings || initialSab?.path_mappings;
  const [pathMappings, setPathMappings] = useState<PathMappingRow[]>(() =>
    configuredMappings?.length
      ? configuredMappings.map((mapping) => ({
          remotePath: mapping.remotePath || mapping.remote_path || '',
          hostPath: mapping.hostPath || mapping.host_path || '',
          linked: mapping.linked,
          error: mapping.error,
        }))
      : [{
          remotePath:
            initialSab?.remotePath ||
            initialSab?.providerCompleteDir ||
            initialSab?.completeDir ||
            '',
          hostPath:
            initialSab?.hostPath ||
            initialSab?.localCompleteDir ||
            initialSab?.local_complete_dir ||
            '',
          linked: initialSab?.folderLinked,
          error: initialSab?.folderError,
        }],
  );
  const [sabTestResult, setSabTestResult] = useState<ConnectionTestResult | null>(null);
  const [folderDiscoveryError, setFolderDiscoveryError] = useState<string | undefined>(
    initialSab?.folderError && !initialSab.folderLinked ? initialSab.folderError : undefined
  );

  useResetConnectionTest(
    { host: sabHost, port: Number(sabPort), apiKey: sabApiKey, useSsl: sabSsl, urlBase: sabUrlBase },
    () => setSabTestResult(null),
  );

  const handleTestSabnzbd = async () => {
    setSabTestResult(null);
    try {
      const res = await testSabMutation.mutateAsync({
        host: sabHost.trim(),
        port: Number(sabPort),
        api_key: sabApiKey.trim() || undefined,
        use_ssl: sabSsl,
        url_base: sabUrlBase.trim() || undefined,
      });
      setSabTestResult(res);
      if (res.ok) {
        toast({ title: 'Connected', description: res.message, variant: 'success' });
      } else {
        toast({ title: 'Connection failed', description: res.message, variant: 'error' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      setSabTestResult({ ok: false, message: msg });
      toast({ title: 'Error', description: msg, variant: 'error' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await saveMutation.mutateAsync({
        host: sabHost.trim(),
        port: Number(sabPort),
        api_key: sabApiKey.trim(),
        use_ssl: sabSsl,
        url_base: sabUrlBase.trim(),
        category: sabCategory.trim() || 'games',
        path_mappings: pathMappings
          .filter((mapping) => mapping.remotePath.trim() || mapping.hostPath.trim())
          .map((mapping) => ({
            remote_path: mapping.remotePath.trim(),
            host_path: mapping.hostPath.trim(),
          })),
      });
      const library = result.sabnzbdLibrary;
      if (library && !library.folderLinked) {
        if (library.pathMappings?.length) {
          setPathMappings(
            library.pathMappings.map((mapping) => ({
              remotePath: mapping.remotePath || mapping.remote_path || '',
              hostPath: mapping.hostPath || mapping.host_path || '',
              linked: mapping.linked,
              error: mapping.error,
            })),
          );
        }
        setFolderDiscoveryError(library.folderError || 'Folder not found yet');
        toast({
          title: 'Saved — folder not linked',
          description: library.folderError || 'Set the path Otix Node uses to access downloads.',
          variant: 'error',
        });
        return;
      }
      toast({
        title: 'Folder linked',
        description: library?.linkedLibraryPath
          ? `Otix now indexes ${library.linkedLibraryPath}.`
          : `Configured on ${targetNodeName}.`,
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
          onTest={handleTestSabnzbd}
          isTesting={testSabMutation.isPending}
          testResult={sabTestResult}
          isConfigured={isConfigured}
        />
      }
    >
      <IntegrationCardSection>
        <IntegrationConnectionFields
        host={sabHost}
        port={sabPort}
        apiKey={sabApiKey}
        useSsl={sabSsl}
        urlBase={sabUrlBase}
        onHostChange={setSabHost}
        onPortChange={setSabPort}
        onApiKeyChange={setSabApiKey}
        onUseSslChange={setSabSsl}
        onUrlBaseChange={setSabUrlBase}
        isConfigured={isConfigured}
        defaultPort={8080}
        hostPlaceholder="127.0.0.1 or sab.local"
        urlBasePlaceholder="e.g. /sabnzbd"
      >
        <DkInput
          id="sab-category"
          label="Category"
          placeholder="games"
          value={sabCategory}
          onChange={(e) => setSabCategory(e.target.value)}
        />
      </IntegrationConnectionFields>
      </IntegrationCardSection>

      <IntegrationCardSection title="Mappings">
        <IntegrationPathMappings
          mappings={pathMappings}
          onChange={setPathMappings}
          folderError={folderDiscoveryError}
        />
      </IntegrationCardSection>
    </IntegrationModalForm>
  );
}

export function NodeSabnzbdSettingsModal({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeSabnzbdSettingsModalProps) {
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
      title="SABnzbd"
      description={targetNodeId ? `On ${targetNodeName}` : undefined}
      icon={DownloadCloud}
      brandBgClass="text-amber-400"
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName="SABnzbd"
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <SabnzbdForm
          key={targetNodeId}
          config={config}
          targetNodeId={targetNodeId}
          targetNodeName={targetNodeName}
          onClose={onClose}
        />
      ) : null}
    </NodeIntegrationModalShell>
  );
}

export const ServerSabnzbdSettingsModal = NodeSabnzbdSettingsModal;
