import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Radio,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  DownloadCloud,
  Check,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/old-features/ui/molecules/toast';
import { useGameServers } from '../use-server-downloads';
import {
  useSaveServerUsenetConfig,
  useServerUsenetConfig,
  useTestProwlarr,
  useTestSabnzbd,
} from '../use-server-usenet';
import type { ConnectionTestResult } from '../usenet-types';
import { parseServiceAddress } from '../usenet-utils';

interface ServerUsenetSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ServerUsenetSettingsModal({
  serverId,
  serverName = 'Server',
  isOpen,
  onClose,
}: ServerUsenetSettingsModalProps) {
  const { toast } = useToast();

  const { data: gameServers = [] } = useGameServers();
  const effectiveServer = serverId
    ? gameServers.find((s) => s.id === serverId) || { id: serverId, name: serverName }
    : gameServers[0];
  const targetServerId = effectiveServer?.id || serverId || 1;
  const targetServerName = effectiveServer?.name || serverName;

  const { data: config, isLoading } = useServerUsenetConfig(targetServerId);
  const saveMutation = useSaveServerUsenetConfig(targetServerId);
  const testSabMutation = useTestSabnzbd(targetServerId);
  const testProwlarrMutation = useTestProwlarr(targetServerId);

  // Form State
  const [sabHost, setSabHost] = useState('127.0.0.1');
  const [sabPort, setSabPort] = useState(8080);
  const [sabApiKey, setSabApiKey] = useState('');
  const [sabSsl, setSabSsl] = useState(false);
  const [sabUrlBase, setSabUrlBase] = useState('');
  const [sabCategory, setSabCategory] = useState('games');
  const [sabTestResult, setSabTestResult] = useState<ConnectionTestResult | null>(null);

  const [prowlarrHost, setProwlarrHost] = useState('127.0.0.1');
  const [prowlarrPort, setProwlarrPort] = useState(9696);
  const [prowlarrApiKey, setProwlarrApiKey] = useState('');
  const [prowlarrSsl, setProwlarrSsl] = useState(false);
  const [prowlarrUrlBase, setProwlarrUrlBase] = useState('');
  const [prowlarrTestResult, setProwlarrTestResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    if (config) {
      if (config.sabnzbd) {
        const s = config.sabnzbd as any;
        setSabHost(s.host || '127.0.0.1');
        setSabPort(s.port || 8080);
        setSabApiKey(s.apiKey || s.api_key || '');
        setSabSsl(Boolean(s.useSsl ?? s.use_ssl));
        setSabUrlBase(s.urlBase || s.url_base || '');
        setSabCategory(s.category || 'games');
      }
      if (config.prowlarr) {
        const p = config.prowlarr as any;
        setProwlarrHost(p.host || '127.0.0.1');
        setProwlarrPort(p.port || 9696);
        setProwlarrApiKey(p.apiKey || p.api_key || '');
        setProwlarrSsl(Boolean(p.useSsl ?? p.use_ssl));
        setProwlarrUrlBase(p.urlBase || p.url_base || '');
      }
    }
  }, [config]);

  if (!isOpen) return null;

  const handleSabHostChange = (val: string) => {
    if (/^https?:\/\//i.test(val) || val.includes('/') || val.includes(',') || (val.includes('.') && !/^\d+(\.\d+)*$/.test(val.trim()))) {
      const parsed = parseServiceAddress(val, 8080);
      setSabHost(parsed.host);
      if (parsed.port) setSabPort(parsed.port);
      if (parsed.use_ssl !== undefined) setSabSsl(parsed.use_ssl);
      if (parsed.url_base) setSabUrlBase(parsed.url_base);
    } else {
      setSabHost(val);
    }
  };

  const handleProwlarrHostChange = (val: string) => {
    if (/^https?:\/\//i.test(val) || val.includes('/') || val.includes(',') || (val.includes('.') && !/^\d+(\.\d+)*$/.test(val.trim()))) {
      const parsed = parseServiceAddress(val, 9696);
      setProwlarrHost(parsed.host);
      if (parsed.port) setProwlarrPort(parsed.port);
      if (parsed.use_ssl !== undefined) setProwlarrSsl(parsed.use_ssl);
      if (parsed.url_base) setProwlarrUrlBase(parsed.url_base);
    } else {
      setProwlarrHost(val);
    }
  };

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
        toast({ title: 'SABnzbd Connected', description: res.message, variant: 'success' });
      } else {
        toast({ title: 'SABnzbd Connection Failed', description: res.message, variant: 'error' });
      }
    } catch (err: any) {
      setSabTestResult({ ok: false, message: err.message || 'Connection error' });
      toast({ title: 'Error', description: err.message, variant: 'error' });
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
    } catch (err: any) {
      setProwlarrTestResult({ ok: false, message: err.message || 'Connection error' });
      toast({ title: 'Error', description: err.message, variant: 'error' });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync({
        enabled: true,
        sabnzbd: {
          host: sabHost.trim(),
          port: Number(sabPort),
          api_key: sabApiKey.trim(),
          use_ssl: sabSsl,
          url_base: sabUrlBase.trim(),
          category: sabCategory.trim() || 'games',
        },
        prowlarr: {
          host: prowlarrHost.trim(),
          port: Number(prowlarrPort),
          api_key: prowlarrApiKey.trim(),
          use_ssl: prowlarrSsl,
          url_base: prowlarrUrlBase.trim(),
          categories: [1000, 4000],
        },
      });
      toast({
        title: 'Usenet Settings Saved',
        description: `SABnzbd and Prowlarr configured on ${targetServerName}.`,
        variant: 'success',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Failed to Save',
        description: err.message || 'Could not update server configuration.',
        variant: 'error',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Usenet & Download Client Settings
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure SABnzbd and Prowlarr on {targetServerName} to download games directly to server storage.
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

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              <span>Loading current settings...</span>
            </div>
          ) : (
            <>
              {/* ── SABnzbd Section ── */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      SABnzbd Download Client
                    </h3>
                  </div>
                  {sabTestResult && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border',
                        sabTestResult.ok
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      )}
                    >
                      {sabTestResult.ok ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {sabTestResult.ok ? 'Connected' : 'Offline'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Host (IP, Domain, or URL)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. server.diogodasilva.com/sabnzbd or 192.168.1.10"
                      value={sabHost}
                      onChange={(e) => handleSabHostChange(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Supports custom domains (e.g. server.diogodasilva.com/sabnzbd), reverse proxy subpaths, or local IPs.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      required
                      placeholder="8080"
                      value={sabPort}
                      onChange={(e) => setSabPort(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
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
                      placeholder="SABnzbd API Key"
                      value={sabApiKey}
                      onChange={(e) => setSabApiKey(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      placeholder="games"
                      value={sabCategory}
                      onChange={(e) => setSabCategory(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    URL Base / Subpath <span className="normal-case text-[10px] text-muted-foreground/60">(Optional, e.g. /sabnzbd)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. /sabnzbd"
                    value={sabUrlBase}
                    onChange={(e) => setSabUrlBase(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-xs"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sabSsl}
                      onChange={(e) => setSabSsl(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Use SSL (HTTPS)</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleTestSabnzbd}
                    disabled={testSabMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold border border-border transition-colors disabled:opacity-50"
                  >
                    <Radio className={cn('h-3 w-3', testSabMutation.isPending && 'animate-spin')} />
                    <span>{testSabMutation.isPending ? 'Testing...' : 'Test SABnzbd'}</span>
                  </button>
                </div>
              </div>

              {/* ── Prowlarr Section ── */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Prowlarr Indexer Manager
                    </h3>
                  </div>
                  {prowlarrTestResult && (
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
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Host (IP, Domain, or URL)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. server.diogodasilva.com/prowlarr or 192.168.1.8"
                      value={prowlarrHost}
                      onChange={(e) => handleProwlarrHostChange(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Supports custom domains (e.g. server.diogodasilva.com/prowlarr), reverse proxy subpaths, or local IPs.
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
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Prowlarr API Key
                    </label>
                    <input
                      type="password"
                      placeholder="Prowlarr API Key from Settings > General"
                      value={prowlarrApiKey}
                      onChange={(e) => setProwlarrApiKey(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      URL Base <span className="normal-case text-[10px] text-muted-foreground/60">(e.g. /prowlarr)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. /prowlarr"
                      value={prowlarrUrlBase}
                      onChange={(e) => setProwlarrUrlBase(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prowlarrSsl}
                      onChange={(e) => setProwlarrSsl(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
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
                    <span>{testProwlarrMutation.isPending ? 'Testing...' : 'Test Prowlarr'}</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-muted/60 hover:bg-muted text-foreground text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{saveMutation.isPending ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
