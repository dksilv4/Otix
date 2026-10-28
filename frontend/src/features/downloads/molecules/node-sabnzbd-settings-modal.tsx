import React, { useState, useEffect } from 'react';
import { DownloadCloud, Sliders, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@ui/molecules/toast';
import { DkInput } from '@ui/atoms/input';
import {
  useSaveServerSabnzbdConfig,
  useSaveNodeSabnzbdConfig,
  useServerUsenetConfig,
  useNodeUsenetConfig,
  useServerUsenetHistory,
  useNodeUsenetHistory,
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
import { DownloadHistoryPanel } from './download-history-panel';
import { isSabnzbdConfigured } from '../usenet-utils';

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

const SabnzbdForm = ({
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: SabnzbdFormProps) => {
  const { toast } = useToast();
  const saveHook = useSaveServerSabnzbdConfig || useSaveNodeSabnzbdConfig;
  const saveMutation = saveHook(targetNodeId);
  const testSabMutation = useTestSabnzbd(targetNodeId);

  const initialSab = config?.sabnzbd;
  const isConfigured = isSabnzbdConfigured(initialSab);
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

  useEffect(() => {
    if (initialSab) {
      if (initialSab.host) setSabHost(initialSab.host);
      if (initialSab.port) setSabPort(initialSab.port);
      const key = initialSab.api_key || initialSab.apiKey;
      if (key) setSabApiKey(key);
      setSabSsl(Boolean(initialSab.use_ssl ?? initialSab.useSsl));
      setSabUrlBase(initialSab.url_base || initialSab.urlBase || '');
      if (initialSab.category) setSabCategory(initialSab.category);
    }
  }, [initialSab]);

  useResetConnectionTest(
    { host: sabHost, port: Number(sabPort), apiKey: sabApiKey, useSsl: sabSsl, urlBase: sabUrlBase },
    () => setSabTestResult(null),
  );

  const handleTestSabnzbd = async () => {
    setSabTestResult(null);
    try {
      const trimmedKey = sabApiKey.trim();
      const existingKey = initialSab?.api_key || initialSab?.apiKey || '';
      const effectiveKey = trimmedKey || (isConfigured ? existingKey : '');
      const res = await testSabMutation.mutateAsync({
        host: sabHost.trim(),
        port: Number(sabPort),
        api_key: effectiveKey || undefined,
        use_ssl: sabSsl,
        url_base: sabUrlBase.trim() || undefined,
      });
      setSabTestResult(res);
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
      setSabTestResult({ ok: false, message: msg });
      toast({ title: 'Error', description: msg, variant: 'error' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmedKey = sabApiKey.trim();
      const existingKey = initialSab?.api_key || initialSab?.apiKey || '';
      const effectiveKey = trimmedKey || (isConfigured ? existingKey : '');
      const result = await saveMutation.mutateAsync({
        host: sabHost.trim(),
        port: Number(sabPort),
        api_key: effectiveKey,
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
};

export const NodeSabnzbdSettingsModal = ({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeSabnzbdSettingsModalProps) => {
  const [activeTab, setActiveTab] = useState<'settings' | 'history'>('settings');
  const effectiveId = nodeId ?? serverId;
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node');
  const { targetNodeId, targetNodeName } = useIntegrationTargetNode(effectiveId, effectiveName);
  const configHook = useServerUsenetConfig || useNodeUsenetConfig;
  const { data: config, isLoading } = configHook ? configHook(targetNodeId) : { data: undefined, isLoading: false };
  const historyHook = useServerUsenetHistory || useNodeUsenetHistory;
  const { data: usenetHistory = [], isLoading: historyLoading } =
    typeof historyHook === 'function' ? historyHook(targetNodeId) : { data: [], isLoading: false };

  return (
    <NodeIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="SABnzbd"
      description={targetNodeId ? `Downloader Provider on ${targetNodeName}` : 'Downloader Provider'}
      icon={DownloadCloud}
      brandBgClass="text-amber-400"
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      maxWidthClass={activeTab === 'history' ? 'max-w-3xl' : 'max-w-xl'}
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName="SABnzbd"
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-4 pt-1 pb-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
                activeTab === 'settings'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-overlay)]',
              )}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
                activeTab === 'history'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-overlay)]',
              )}
            >
              <History className="h-3.5 w-3.5" />
              <span>Download History</span>
              {usenetHistory.length > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.2 rounded-full text-[10px] font-bold',
                    activeTab === 'history'
                      ? 'bg-black/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {usenetHistory.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {activeTab === 'settings' ? (
              <SabnzbdForm
                key={`${targetNodeId}-${config ? 'ready' : 'loading'}`}
                config={config}
                targetNodeId={targetNodeId}
                targetNodeName={targetNodeName}
                onClose={onClose}
              />
            ) : (
              <div className="p-4">
                <DownloadHistoryPanel
                  items={usenetHistory}
                  isLoading={historyLoading}
                />
              </div>
            )}
          </div>
        </div>
      ) : null}
    </NodeIntegrationModalShell>
  );
};

export const ServerSabnzbdSettingsModal = NodeSabnzbdSettingsModal;
