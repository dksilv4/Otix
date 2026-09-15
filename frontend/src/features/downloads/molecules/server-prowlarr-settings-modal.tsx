import React, { useState } from 'react';
import {
  X,
  Radio,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  RefreshCw,
  Layers,
  Database,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/old-features/ui/molecules/toast';
import { useGameServers } from '../use-server-downloads';
import {
  useProwlarrIndexers,
  useSaveServerProwlarrConfig,
  useServerUsenetConfig,
  useSyncProwlarrIndexers,
  useTestProwlarr,
} from '../use-server-usenet';
import type { ConnectionTestResult, ProwlarrSyncResponse, ServerUsenetConfig } from '../usenet-types';
import { parseServiceAddress } from '../usenet-utils';

interface ServerProwlarrSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen: boolean;
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
  const [prowlarrCategories, setProwlarrCategories] = useState(
    Array.isArray(initialProw?.categories) && initialProw.categories.length > 0
      ? initialProw.categories.join(', ')
      : '1000, 4000'
  );
  const [prowlarrTestResult, setProwlarrTestResult] = useState<ConnectionTestResult | null>(null);

  // Indexer Sync State
  const [syncProtocol, setSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all');
  const [, setSyncResult] = useState<ProwlarrSyncResponse | null>(null);

  // Current active indexers query
  const { data: activeIndexers = [], refetch: refetchIndexers } = useProwlarrIndexers(
    targetServerId,
    syncProtocol
  );

  const handleProwlarrHostChange = (val: string) => {
    if (
      /^https?:\/\//i.test(val) ||
      val.includes('/') ||
      val.includes(',') ||
      (val.includes('.') && !/^\d+(\.\d+)*$/.test(val.trim()))
    ) {
      const parsed = parseServiceAddress(val, 9696);
      setProwlarrHost(parsed.host);
      if (parsed.port) setProwlarrPort(parsed.port);
      if (parsed.use_ssl !== undefined) setProwlarrSsl(parsed.use_ssl);
      if (parsed.url_base) setProwlarrUrlBase(parsed.url_base);
    } else {
      setProwlarrHost(val);
    }
  };

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
        toast({ title: 'Prowlarr Connected', description: res.message, variant: 'success' });
      } else {
        toast({ title: 'Prowlarr Connection Failed', description: res.message, variant: 'error' });
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
      setSyncResult(res);
      await refetchIndexers();
      toast({
        title: 'Indexers Synced',
        description: res.message,
        variant: 'success',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not sync indexers from Prowlarr.';
      toast({
        title: 'Sync Failed',
        description: msg,
        variant: 'error',
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const catArray = prowlarrCategories
        .split(',')
        .map((c) => parseInt(c.trim(), 10))
        .filter((n) => !isNaN(n));

      await saveMutation.mutateAsync({
        host: prowlarrHost.trim(),
        port: Number(prowlarrPort),
        api_key: prowlarrApiKey.trim(),
        use_ssl: prowlarrSsl,
        url_base: prowlarrUrlBase.trim(),
        categories: catArray.length > 0 ? catArray : [1000, 4000],
      });
      toast({
        title: 'Prowlarr Settings Saved',
        description: `Configured on ${targetServerName}.`,
        variant: 'success',
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update Prowlarr configuration.';
      toast({
        title: 'Failed to Save',
        description: msg,
        variant: 'error',
      });
    }
  };

  return (
    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
      {/* Connection Details */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-rose-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Prowlarr Connection
            </h3>
          </div>
          {prowlarrTestResult ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                prowlarrTestResult.ok
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
              )}
            >
              {prowlarrTestResult.ok ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {prowlarrTestResult.ok ? 'Connected' : 'Offline'}
            </span>
          ) : isConfigured ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" />
              Connected
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Host (IP, Domain, or URL)
            </label>
            <input
              type="text"
              required
              placeholder="e.g. server.mydomain.com/prowlarr or 192.168.1.10"
              value={prowlarrHost}
              onChange={(e) => handleProwlarrHostChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-rose-400"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Supports custom domains, reverse proxy subpaths, or local IPs.
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Port
            </label>
            <input
              type="number"
              required
              placeholder="9696"
              value={prowlarrPort}
              onChange={(e) => setProwlarrPort(Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-rose-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              API Key
            </label>
            <input
              type="password"
              placeholder="Prowlarr API Key"
              value={prowlarrApiKey}
              onChange={(e) => setProwlarrApiKey(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-rose-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              Category IDs
            </label>
            <input
              type="text"
              placeholder="1000, 4000"
              value={prowlarrCategories}
              onChange={(e) => setProwlarrCategories(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-rose-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
            URL Base / Subpath <span className="normal-case text-[10px] text-muted-foreground/60">(Optional, e.g. /prowlarr)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. /prowlarr"
            value={prowlarrUrlBase}
            onChange={(e) => setProwlarrUrlBase(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-rose-400 text-xs"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={prowlarrSsl}
              onChange={(e) => setProwlarrSsl(e.target.checked)}
              className="rounded border-border text-rose-500 focus:ring-rose-400"
            />
            <span>Use SSL (HTTPS)</span>
          </label>

          <button
            type="button"
            onClick={handleTestProwlarr}
            disabled={testProwlarrMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold border border-border transition-colors disabled:opacity-50"
          >
            <Radio className={cn('h-3 w-3', testProwlarrMutation.isPending && 'animate-spin')} />
            <span>{testProwlarrMutation.isPending ? 'Testing...' : 'Test Connection'}</span>
          </button>
        </div>
      </div>

      {/* Indexer Sync Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-rose-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Sync Indexers
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sync indexers with Prowlarr and filter by protocol.
            </p>
          </div>

          {/* Protocol Selector Tabs */}
          <div className="flex items-center gap-1 p-1 bg-background rounded-xl border border-border self-start sm:self-auto">
            {(['all', 'torrent', 'usenet'] as const).map((proto) => (
              <button
                key={proto}
                type="button"
                onClick={() => setSyncProtocol(proto)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-all capitalize',
                  syncProtocol === proto
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {proto}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {activeIndexers.length > 0
                ? `${activeIndexers.length} ${syncProtocol} indexer${activeIndexers.length === 1 ? '' : 's'} available`
                : 'No indexers discovered yet'}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSyncIndexers}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-bold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', syncMutation.isPending && 'animate-spin')} />
            <span>{syncMutation.isPending ? 'Syncing...' : `Sync ${syncProtocol.toUpperCase()}`}</span>
          </button>
        </div>

        {/* Indexers Chip Previews */}
        {activeIndexers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 max-h-32 overflow-y-auto">
            {activeIndexers.map((idx) => (
              <span
                key={idx.id}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border',
                  idx.protocol === 'torrent'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                    : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                )}
              >
                <span>{idx.name}</span>
                <span className="text-[9px] uppercase font-bold opacity-60">
                  {idx.protocol}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold hover:bg-rose-600 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          <span>{saveMutation.isPending ? 'Saving...' : 'Save Prowlarr Settings'}</span>
        </button>
      </div>
    </form>
  );
}

export function ServerProwlarrSettingsModal({
  serverId,
  serverName = 'Server',
  isOpen,
  onClose,
}: ServerProwlarrSettingsModalProps) {
  const { data: gameServers = [] } = useGameServers();
  const effectiveServer = serverId
    ? gameServers.find((s) => s.id === serverId) || { id: serverId, name: serverName }
    : gameServers[0];
  const targetServerId = effectiveServer?.id || serverId || 1;
  const targetServerName = effectiveServer?.name || serverName;

  const { data: config, isLoading } = useServerUsenetConfig(targetServerId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Prowlarr Indexer Settings
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure Prowlarr on {targetServerName} to search Usenet & Torrent indexers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-rose-400" />
            <span>Loading current settings...</span>
          </div>
        ) : (
          <ProwlarrForm
            key={targetServerId}
            config={config}
            targetServerId={targetServerId}
            targetServerName={targetServerName}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
