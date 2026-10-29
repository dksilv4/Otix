import React, { useState, useEffect } from 'react';
import { DownloadCloud, Globe, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@ui/molecules/toast';
import { DkInput } from '@ui/atoms/input';
import {
  useNodeJDownloaderConfig,
  useSaveNodeJDownloaderConfig,
  useTestJDownloader,
} from '../hooks/use-node-jdownloader';
import type { ServerJDownloaderConfig } from '../provider-types';
import type { ConnectionTestResult } from '../usenet-types';
import {
  NodeIntegrationModalShell,
  IntegrationCardSection,
  IntegrationEmptyNodeState,
  IntegrationModalFooter,
} from './node-integration-modal-shell';
import { useResetConnectionTest } from './use-reset-connection-test';
import { useIntegrationTargetNode } from './use-integration-target-node';
import { IntegrationModalForm } from './integration-modal-form';
import { IntegrationPathMappings, type PathMappingRow } from './integration-path-mappings';

export interface NodeJDownloaderSettingsModalProps {
  nodeId?: number;
  nodeName?: string;
  serverId?: number;
  serverName?: string;
  isOpen?: boolean;
  isExiting?: boolean;
  onClose: () => void;
}

export type ServerJDownloaderSettingsModalProps = NodeJDownloaderSettingsModalProps;

interface JDownloaderFormProps {
  config?: ServerJDownloaderConfig;
  targetNodeId: number;
  targetNodeName: string;
  onClose: () => void;
}

const JDownloaderForm = ({
  config,
  targetNodeId,
  targetNodeName,
  onClose,
}: JDownloaderFormProps) => {
  const { toast } = useToast();
  const saveMutation = useSaveNodeJDownloaderConfig(targetNodeId);
  const testMutation = useTestJDownloader(targetNodeId);

  const [mode, setMode] = useState<'cloud' | 'direct'>(
    config?.email ? 'cloud' : config?.directHost ? 'direct' : 'cloud'
  );

  const [email, setEmail] = useState(config?.email || '');
  const [password, setPassword] = useState(config?.password || '');
  const [deviceName, setDeviceName] = useState(config?.deviceName || '');
  const [deviceId, setDeviceId] = useState(config?.deviceId || '');
  const [directHost, setDirectHost] = useState(config?.directHost || '127.0.0.1');
  const [directPort, setDirectPort] = useState(config?.directPort || 10025);
  const [downloadPath, setDownloadPath] = useState(config?.downloadPath || '');

  const [pathMappings, setPathMappings] = useState<PathMappingRow[]>(() =>
    config?.pathMappings?.length
      ? config.pathMappings.map((m) => ({
          remotePath: m.remotePath,
          hostPath: m.hostPath,
        }))
      : [{ remotePath: '', hostPath: '' }]
  );

  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    if (config) {
      if (config.email) setEmail(config.email);
      if (config.password) setPassword(config.password);
      if (config.deviceName) setDeviceName(config.deviceName);
      if (config.deviceId) setDeviceId(config.deviceId);
      if (config.directHost) setDirectHost(config.directHost);
      if (config.directPort) setDirectPort(config.directPort);
      if (config.downloadPath) setDownloadPath(config.downloadPath);
      if (config.email) {
        setMode('cloud');
      } else if (config.directHost) {
        setMode('direct');
      }
    }
  }, [config]);

  useResetConnectionTest(setTestResult, [
    email,
    password,
    deviceName,
    deviceId,
    directHost,
    directPort,
    mode,
  ]);

  const handleTest = async () => {
    try {
      const payload =
        mode === 'cloud'
          ? { email, password, deviceName, deviceId }
          : { directHost, directPort: Number(directPort) };
      const res = await testMutation.mutateAsync(payload);
      setTestResult(res);
      if (res.ok) {
        toast({
          title: 'Connection Successful',
          description: res.message || 'Connected to JDownloader',
          variant: 'default',
        });
      } else {
        toast({
          title: 'Connection Failed',
          description: res.message || 'Could not connect to JDownloader',
          variant: 'destructive',
        });
      }
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      const msg = errObj?.response?.data?.detail || errObj?.message || 'Connection test failed';
      setTestResult({ ok: false, message: msg });
      toast({
        title: 'Connection Error',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync({
        enabled: true,
        email: mode === 'cloud' ? email : '',
        password: mode === 'cloud' ? password : '',
        deviceName: mode === 'cloud' ? deviceName : '',
        deviceId: mode === 'cloud' ? deviceId : '',
        directHost: mode === 'direct' ? directHost : '',
        directPort: mode === 'direct' ? Number(directPort) : undefined,
        downloadPath,
        pathMappings: pathMappings.filter((m) => m.remotePath && m.hostPath),
      });

      toast({
        title: 'Configuration Saved',
        description: `JDownloader settings updated on ${targetNodeName}`,
        variant: 'default',
      });
      onClose();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      toast({
        title: 'Failed to Save',
        description: errObj?.response?.data?.detail || errObj?.message || 'Error saving settings',
        variant: 'destructive',
      });
    }
  };

  return (
    <IntegrationModalForm
      onSubmit={handleSave}
      footer={
        <IntegrationModalFooter
          onTest={handleTest}
          isTesting={testMutation.isPending}
          testResult={testResult}
          isSaving={saveMutation.isPending}
          onCancel={onClose}
        />
      }
    >
      <IntegrationCardSection title="Connection Method">
        <div className="flex gap-2 p-1 bg-[var(--dk-surface-ghost)] rounded-xl border border-white/[0.04]">
          <button
            type="button"
            onClick={() => setMode('cloud')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
              mode === 'cloud'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>MyJDownloader Cloud</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('direct')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
              mode === 'direct'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Direct HTTP Loopback</span>
          </button>
        </div>
      </IntegrationCardSection>

      {mode === 'cloud' ? (
        <IntegrationCardSection title="MyJDownloader Credentials">
          <div className="space-y-3">
            <DkInput
              id="jd-email"
              label="Email"
              placeholder="user@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <DkInput
              id="jd-password"
              label="Password"
              placeholder={config?.hasPassword ? '••••••••' : 'MyJDownloader Password'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DkInput
                id="jd-device-name"
                label="Device Name (optional)"
                placeholder="e.g. Home-NAS-JD2"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
              />
              <DkInput
                id="jd-device-id"
                label="Device ID (optional)"
                placeholder="Optional device ID"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Connects to your JDownloader instance via MyJDownloader cloud and direct LAN handshake.
            </p>
          </div>
        </IntegrationCardSection>
      ) : (
        <IntegrationCardSection title="Direct HTTP Server">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <DkInput
                id="jd-direct-host"
                label="Host"
                placeholder="127.0.0.1 or jd.local"
                value={directHost}
                onChange={(e) => setDirectHost(e.target.value)}
              />
            </div>
            <div>
              <DkInput
                id="jd-direct-port"
                label="Port"
                type="number"
                placeholder="10025"
                value={directPort}
                onChange={(e) => setDirectPort(Number(e.target.value))}
              />
            </div>
          </div>
        </IntegrationCardSection>
      )}

      <IntegrationCardSection title="Download Destination & Mappings">
        <div className="space-y-3">
          <DkInput
            id="jd-download-path"
            label="Download Folder (optional)"
            placeholder="e.g. /downloads/jdownloader"
            value={downloadPath}
            onChange={(e) => setDownloadPath(e.target.value)}
          />
          <IntegrationPathMappings
            mappings={pathMappings}
            onChange={setPathMappings}
          />
        </div>
      </IntegrationCardSection>
    </IntegrationModalForm>
  );
};

export const NodeJDownloaderSettingsModal = ({
  nodeId,
  nodeName = 'Node',
  serverId,
  serverName,
  isOpen = true,
  isExiting,
  onClose,
}: NodeJDownloaderSettingsModalProps) => {
  const effectiveId = nodeId ?? serverId;
  const effectiveName = nodeName !== 'Node' ? nodeName : (serverName ?? 'Node');
  const { targetNodeId, targetNodeName } = useIntegrationTargetNode(effectiveId, effectiveName);
  const { data: config, isLoading } = useNodeJDownloaderConfig(targetNodeId);

  return (
    <NodeIntegrationModalShell
      isOpen={isOpen}
      isExiting={isExiting}
      onClose={onClose}
      title="JDownloader 2"
      description={targetNodeId ? `Direct Downloader Provider on ${targetNodeName}` : 'Direct Downloader Provider'}
      icon={DownloadCloud}
      brandBgClass="text-primary"
      isLoading={isLoading}
      hasNode={Boolean(targetNodeId)}
      maxWidthClass="max-w-xl"
      emptyNodeState={
        <IntegrationEmptyNodeState
          serviceName="JDownloader 2"
          onClose={onClose}
        />
      }
    >
      {targetNodeId ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <JDownloaderForm
              config={config}
              targetNodeId={targetNodeId}
              targetNodeName={targetNodeName}
              onClose={onClose}
            />
          </div>
        </div>
      ) : null}
    </NodeIntegrationModalShell>
  );
};
