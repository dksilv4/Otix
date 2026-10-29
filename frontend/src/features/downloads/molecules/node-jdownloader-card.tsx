import { useState } from 'react';
import {
  DownloadCloud,
  Sliders,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DkButton } from '@ui/atoms/button';
import { useModal } from '@/lib/modals';
import { cn } from '@/lib/utils';
import type { GameServer } from '../types';
import { useNodeJDownloaderConfig, useTestJDownloader } from '../hooks/use-node-jdownloader';
import { ServerJDownloaderSettingsModal } from './server-jdownloader-settings-modal';

export const NodeJDownloaderCard = ({ server }: { server: GameServer }) => {
  const { openModal } = useModal();
  const { data: config, isLoading: configLoading } = useNodeJDownloaderConfig(server.id);
  const testMutation = useTestJDownloader(server.id);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isConfigured = Boolean(
    config?.configured ||
      config?.email ||
      (config?.directHost && config?.directPort)
  );

  const isCloud = Boolean(config?.email);
  const targetLabel = isCloud
    ? `MyJDownloader (${config?.email}) · Device: ${config?.deviceName || 'auto'}`
    : `Direct HTTP (${config?.directHost || '127.0.0.1'}:${config?.directPort || 10025})`;

  const handleOpenModal = () => {
    const closeSub = openModal(
      <ServerJDownloaderSettingsModal
        serverId={server.id}
        serverName={server.name}
        onClose={() => closeSub()}
      />
    );
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testMutation.mutateAsync();
      setTestResult(res);
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { detail?: string } }; message?: string };
      setTestResult({
        ok: false,
        message: errObj?.response?.data?.detail || errObj?.message || 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl p-4 bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-11 w-11 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0 text-primary">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-foreground">JDownloader 2 (DDL)</h4>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-online)] bg-[var(--status-online)]/15 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-online)] animate-pulse" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-[var(--dk-surface-ghost)] px-2 py-0.5 rounded-full">
                  Not Configured
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {configLoading
                ? 'Loading configuration...'
                : isConfigured
                  ? `On ${server.name} · ${targetLabel}`
                  : `Not configured on ${server.name}.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <DkButton
            size="sm"
            variant={isConfigured ? 'ghost' : 'primary'}
            className="h-8 w-8 p-0"
            onClick={handleOpenModal}
            title="Configure Client"
            aria-label="Configure Client"
          >
            <Sliders className="h-4 w-4 text-foreground/80" />
          </DkButton>
          <DkButton
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={handleTestConnection}
            disabled={testing || !isConfigured}
            title="Test Connection"
            aria-label="Test Connection"
          >
            <RefreshCw className={cn('h-4 w-4 text-primary', testing && 'animate-spin')} />
          </DkButton>
        </div>
      </div>

      {testResult?.ok && (
        <div className="p-2.5 rounded-xl bg-[var(--status-online)]/10 text-xs text-[var(--status-online)] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{testResult.message || 'JDownloader is connected and responding.'}</span>
        </div>
      )}
      {testResult && !testResult.ok && (
        <div className="p-2.5 rounded-xl bg-destructive/10 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{testResult.message || 'Failed to reach JDownloader.'}</span>
        </div>
      )}
    </div>
  );
};
