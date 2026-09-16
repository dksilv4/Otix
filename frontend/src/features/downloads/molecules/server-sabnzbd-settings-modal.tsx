import React, { useState } from 'react';
import {
  X,
  Server,
  Radio,
  CheckCircle2,
  AlertCircle,
  DownloadCloud,
  Check,
  RefreshCw,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/old-features/ui/molecules/toast';
import { useGameServers } from '../use-server-downloads';
import {
  useSaveServerSabnzbdConfig,
  useServerUsenetConfig,
  useTestSabnzbd,
} from '../use-server-usenet';
import type { ConnectionTestResult, ServerUsenetConfig } from '../usenet-types';
import { parseServiceAddress } from '../usenet-utils';

interface ServerSabnzbdSettingsModalProps {
  serverId?: number;
  serverName?: string;
  isOpen: boolean;
  onClose: () => void;
}

interface SabnzbdFormProps {
  config?: ServerUsenetConfig;
  targetServerId: number;
  targetServerName: string;
  onClose: () => void;
}

function SabnzbdForm({
  config,
  targetServerId,
  targetServerName,
  onClose,
}: SabnzbdFormProps) {
  const { toast } = useToast();
  const saveMutation = useSaveServerSabnzbdConfig(targetServerId);
  const testSabMutation = useTestSabnzbd(targetServerId);

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
  const [pathMappings, setPathMappings] = useState(() =>
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

  const handleSabHostChange = (val: string) => {
    if (
      /^https?:\/\//i.test(val) ||
      val.includes('/') ||
      val.includes(',') ||
      (val.includes('.') && !/^\d+(\.\d+)*$/.test(val.trim()))
    ) {
      const parsed = parseServiceAddress(val, 8080);
      setSabHost(parsed.host);
      if (parsed.port) setSabPort(parsed.port);
      if (parsed.use_ssl !== undefined) setSabSsl(parsed.use_ssl);
      if (parsed.url_base) setSabUrlBase(parsed.url_base);
    } else {
      setSabHost(val);
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
        toast({
          title: 'SABnzbd Saved — Folder Not Linked',
          description: library.folderError || 'Set the path that Otix Server uses to access SABnzbd downloads.',
          variant: 'error',
        });
        return;
      }
      toast({
        title: 'SABnzbd Folder Linked',
        description: library?.linkedLibraryPath
          ? `Otix now indexes ${library.linkedLibraryPath}.`
          : `Configured on ${targetServerName}.`,
        variant: 'success',
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not update SABnzbd configuration.';
      toast({
        title: 'Failed to Save',
        description: msg,
        variant: 'error',
      });
    }
  };

  return (
    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-6">
      <div className="p-4 rounded-xl bg-white/[0.02] border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              SABnzbd Download Client
            </h3>
          </div>
          {sabTestResult ? (
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
              placeholder="e.g. server.mydomain.com/sabnzbd or 192.168.1.10"
              value={sabHost}
              onChange={(e) => handleSabHostChange(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-400"
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
              placeholder="8080"
              value={sabPort}
              onChange={(e) => setSabPort(Number(e.target.value))}
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-400"
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
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-400"
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
              className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-400"
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
            className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-400 text-xs"
          />
        </div>

        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
              <Link2 className="h-3.5 w-3.5" />
              SABnzbd Path Mapping
            </label>
            {initialSab?.folderLinked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Linked
              </span>
            )}
          </div>
          <div className="space-y-2">
            {pathMappings.map((mapping, index) => {
              return (
                <div key={index} className="rounded-lg border border-white/[0.06] bg-black/10 p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-foreground/70">
                      Mapping {index + 1}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {mapping.linked && (
                        <span className="text-[10px] font-medium text-emerald-400">Linked</span>
                      )}
                      {pathMappings.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPathMappings((items) => items.filter((_, i) => i !== index))}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                          aria-label={`Remove path mapping ${index + 1}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                        Remote path (inside SABnzbd)
                      </label>
                      <input
                        type="text"
                        placeholder="Auto-detect, e.g. /downloads/complete/games"
                        value={mapping.remotePath}
                        onChange={(e) => setPathMappings((items) =>
                          items.map((item, i) =>
                            i === index
                              ? { ...item, remotePath: e.target.value, linked: false, error: '' }
                              : item
                          )
                        )}
                        className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-400 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
                        Host path (inside Otix Server)
                      </label>
                      <input
                        type="text"
                        placeholder="Same as remote path when left empty"
                        value={mapping.hostPath}
                        onChange={(e) => setPathMappings((items) =>
                          items.map((item, i) =>
                            i === index
                              ? { ...item, hostPath: e.target.value, linked: false, error: '' }
                              : item
                          )
                        )}
                        className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-400 text-xs"
                      />
                    </div>
                  </div>
                  {mapping.error && <p className="mt-1.5 text-[10px] text-amber-400">{mapping.error}</p>}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setPathMappings((items) => [
                ...items,
                { remotePath: '', hostPath: '', linked: false, error: '' },
              ])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/10"
            >
              <Plus className="h-3 w-3" />
              Add mapping
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            This mapping applies only to SABnzbd. The two paths must point to the same shared folder.
          </p>
          {initialSab?.folderError && !initialSab.folderLinked && (
            <p className="text-[10px] leading-relaxed text-amber-400">{initialSab.folderError}</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={sabSsl}
              onChange={(e) => setSabSsl(e.target.checked)}
              className="rounded border-border text-amber-500 focus:ring-amber-400"
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
            <span>{testSabMutation.isPending ? 'Testing...' : 'Test Connection'}</span>
          </button>
        </div>
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
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          <span>{saveMutation.isPending ? 'Saving...' : 'Save SABnzbd Settings'}</span>
        </button>
      </div>
    </form>
  );
}

export function ServerSabnzbdSettingsModal({
  serverId,
  serverName = 'Server',
  isOpen,
  onClose,
}: ServerSabnzbdSettingsModalProps) {
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
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                SABnzbd Downloader Settings
              </h2>
              <p className="text-xs text-muted-foreground">
                Configure SABnzbd on {targetServerName} to download games directly to server storage.
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
            <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />
            <span>Loading current settings...</span>
          </div>
        ) : (
          <SabnzbdForm
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
