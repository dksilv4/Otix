import React, { useState, useEffect } from 'react';
import {
  X,
  Radio,
  CheckCircle2,
  AlertCircle,
  Film,
  Check,
  RefreshCw,
  FolderOpen,
  Sliders,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/old-features/ui/molecules/toast';
import { useGameServers } from '../use-server-downloads';
import {
  useServerRadarrConfig,
  useSaveServerRadarrConfig,
  useTestRadarr,
  useServerRadarrQualityProfiles,
  useServerRadarrRootFolders,
} from '../use-server-arr';
import type { ArrConnectionTestResult, ServerRadarrConfig } from '../arr-types';
import { parseServiceAddress } from '../usenet-utils';

interface ServerRadarrSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen: boolean;
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

  const isConfigured = Boolean(
    config?.host && Boolean(config?.apiKey || config?.api_key || config?.configured)
  );

  const [host, setHost] = useState(config?.host || '127.0.0.1');
  const [port, setPort] = useState(config?.port || 7878);
  const [apiKey, setApiKey] = useState(config?.apiKey || config?.api_key || '');
  const [ssl, setSsl] = useState(Boolean(config?.useSsl ?? config?.use_ssl));
  const [urlBase, setUrlBase] = useState(config?.urlBase || config?.url_base || '');
  const [qualityProfileId, setQualityProfileId] = useState<number | undefined>(
    config?.qualityProfileId ?? config?.quality_profile_id
  );
  const [rootFolderPath, setRootFolderPath] = useState<string>(
    config?.rootFolderPath || config?.root_folder_path || ''
  );
  const [testResult, setTestResult] = useState<ArrConnectionTestResult | null>(null);

  const { data: qualityProfiles = [], refetch: refetchProfiles } = useServerRadarrQualityProfiles(targetServerId);
  const { data: rootFolders = [], refetch: refetchFolders } = useServerRadarrRootFolders(targetServerId);

  useEffect(() => {
    if (qualityProfiles.length > 0 && qualityProfileId === undefined) {
      setQualityProfileId(qualityProfiles[0].id);
    }
  }, [qualityProfiles, qualityProfileId]);

  useEffect(() => {
    if (rootFolders.length > 0 && !rootFolderPath) {
      setRootFolderPath(rootFolders[0].path);
    }
  }, [rootFolders, rootFolderPath]);

  const handleHostChange = (val: string) => {
    if (
      /^https?:\/\//i.test(val) ||
      val.includes('/') ||
      val.includes(',') ||
      (val.includes('.') && !/^\d+(\.\d+)*$/.test(val.trim()))
    ) {
      const parsed = parseServiceAddress(val, 7878);
      setHost(parsed.host);
      if (parsed.port) setPort(parsed.port);
      if (parsed.use_ssl !== undefined) setSsl(parsed.use_ssl);
      if (parsed.url_base) setUrlBase(parsed.url_base);
    } else {
      setHost(val);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const res = await testRadarrMutation.mutateAsync({
        host: host.trim(),
        port: Number(port),
        api_key: apiKey.trim(),
        use_ssl: ssl,
        url_base: urlBase.trim(),
      });
      setTestResult(res);
      if (res.ok) {
        toast({ title: 'Connection Successful', description: res.message || 'Connected to Radarr!' });
        refetchProfiles();
        refetchFolders();
      } else {
        toast({ title: 'Connection Failed', description: res.message || 'Could not connect to Radarr.', variant: 'destructive' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTestResult({ ok: false, message: msg });
      toast({ title: 'Connection Failed', description: msg, variant: 'destructive' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync({
        enabled: true,
        host: host.trim(),
        port: Number(port),
        api_key: apiKey.trim() || undefined,
        use_ssl: ssl,
        url_base: urlBase.trim(),
        quality_profile_id: qualityProfileId,
        root_folder_path: rootFolderPath.trim(),
      });
      toast({ title: 'Radarr Settings Saved', description: `Updated configuration on ${targetServerName}.` });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast({ title: 'Error Saving Settings', description: msg, variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/10 rounded-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-white/90">Target Server: {targetServerName}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
            isConfigured
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-white/5 text-white/50 border-white/10'
          )}
        >
          {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
          {isConfigured ? 'Configured' : 'Not Connected'}
        </span>
      </div>

      {/* Host & Port */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-white/70">Radarr Host / IP</label>
          <input
            type="text"
            value={host}
            onChange={(e) => handleHostChange(e.target.value)}
            placeholder="127.0.0.1 or radarr.local"
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/70">Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            placeholder="7878"
            required
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-white/70">API Key</label>
          <span className="text-[11px] text-white/40">Found in Radarr &rarr; Settings &rarr; General</span>
        </div>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={isConfigured ? '••••••••••••••••' : 'Paste API Key here'}
          className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
        />
      </div>

      {/* URL Base & SSL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/70">URL Base / Subpath (Optional)</label>
          <input
            type="text"
            value={urlBase}
            onChange={(e) => setUrlBase(e.target.value)}
            placeholder="/radarr"
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
          />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <input
            type="checkbox"
            id="radarr-ssl"
            checked={ssl}
            onChange={(e) => setSsl(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <label htmlFor="radarr-ssl" className="text-sm font-medium text-white/80 select-none cursor-pointer">
            Use HTTPS (SSL)
          </label>
        </div>
      </div>

      {/* Default Quality Profile & Root Folder */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-white/70 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-amber-400" /> Default Quality Profile
            </label>
            <button
              type="button"
              onClick={() => refetchProfiles()}
              className="text-[11px] text-white/40 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
          <select
            value={qualityProfileId ?? ''}
            onChange={(e) => setQualityProfileId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
          >
            <option value="" className="bg-neutral-900 text-white">Default / Any</option>
            {qualityProfiles.map((qp) => (
              <option key={qp.id} value={qp.id} className="bg-neutral-900 text-white">
                {qp.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-white/70 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> Default Root Folder
            </label>
            <button
              type="button"
              onClick={() => refetchFolders()}
              className="text-[11px] text-white/40 hover:text-white transition-colors"
            >
              Refresh
            </button>
          </div>
          {rootFolders.length > 0 ? (
            <select
              value={rootFolderPath}
              onChange={(e) => setRootFolderPath(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
            >
              {rootFolders.map((rf) => (
                <option key={rf.id} value={rf.path} className="bg-neutral-900 text-white">
                  {rf.path}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={rootFolderPath}
              onChange={(e) => setRootFolderPath(e.target.value)}
              placeholder="/movies"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
          )}
        </div>
      </div>

      {/* Test Status Banner */}
      {testResult && (
        <div
          className={cn(
            'p-3.5 rounded-xl border flex items-center gap-3 text-xs',
            testResult.ok
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          )}
        >
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{testResult.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={handleTest}
          disabled={testRadarrMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/90 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {testRadarrMutation.isPending ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              Test Connection
            </>
          )}
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/70 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            {saveMutation.isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ServerRadarrSettingsModal({
  serverId,
  serverName,
  isOpen,
  onClose,
}: ServerRadarrSettingsModalProps) {
  const { data: servers = [] } = useGameServers();
  const selectedServer = servers.find((s) => s.id === serverId) || servers[0];
  const targetServerId = selectedServer?.id;
  const targetServerName = serverName || selectedServer?.name || 'Local Game Server';
  const { data: radarrConfig, isLoading } = useServerRadarrConfig(targetServerId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-neutral-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Radarr Movie Configuration</h2>
              <p className="text-xs text-white/50">Manage movie automated searches and downloads on your server</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-white/40 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              Loading Radarr settings...
            </div>
          ) : targetServerId ? (
            <RadarrForm
              config={radarrConfig}
              targetServerId={targetServerId}
              targetServerName={targetServerName}
              onClose={onClose}
            />
          ) : (
            <div className="py-16 text-center text-sm text-white/40">No game server node selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}
