import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useDownloadConfig, useConnectionTest } from '../use-downloads';
import { DkButton } from '@/features/dk-ui/atoms/button';
import { DkSwitch } from '@/features/dk-ui/atoms/switch';
import { Loader2, CheckCircle2, XCircle, Server, Search } from 'lucide-react';

export function DownloadConfigSection() {
  const { user } = useAuth();
  const { config, loading, saveConfig } = useDownloadConfig(user?.id);
  const { testingSabnzbd, testingNzbplanet, testSabnzbd, testNzbplanet } = useConnectionTest();

  const [sabnzbdHost, setSabnzbdHost] = useState('');
  const [sabnzbdPort, setSabnzbdPort] = useState(8080);
  const [sabnzbdApiKey, setSabnzbdApiKey] = useState('');
  const [sabnzbdUseSsl, setSabnzbdUseSsl] = useState(false);
  const [nzbplanetApiKey, setNzbplanetApiKey] = useState('');
  const [sabnzbdCompletePath, setSabnzbdCompletePath] = useState('');
  const [downloadPath, setDownloadPath] = useState('');
  const [postProcessEnabled, setPostProcessEnabled] = useState(true);
  const [autoSearch, setAutoSearch] = useState(false);
  const [intervalHours, setIntervalHours] = useState(12);
  const [saving, setSaving] = useState(false);
  const [sabnzbdStatus, setSabnzbdStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [nzbplanetStatus, setNzbplanetStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  useEffect(() => {
    if (config) {
      setSabnzbdHost(config.sabnzbdHost ?? '');
      setSabnzbdPort(config.sabnzbdPort ?? 8080);
      setSabnzbdApiKey(config.sabnzbdApiKey ?? '');
      setSabnzbdUseSsl(config.sabnzbdUseSsl ?? false);
      setNzbplanetApiKey(config.nzbplanetApiKey ?? '');
      setSabnzbdCompletePath(config.sabnzbdCompletePath ?? '');
      setDownloadPath(config.downloadPath ?? '');
      setPostProcessEnabled(config.postProcessEnabled ?? true);
      setAutoSearch(config.autoSearchWishlist ?? false);
      setIntervalHours(config.wishlistIntervalHours ?? 12);
    }
  }, [config]);

  if (!isElectron) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveConfig({
        userId: user!.id,
        sabnzbdHost: sabnzbdHost || null,
        sabnzbdPort: sabnzbdPort || null,
        sabnzbdApiKey: sabnzbdApiKey || null,
        sabnzbdUseSsl,
        nzbplanetApiKey: nzbplanetApiKey || null,
        sabnzbdCompletePath: sabnzbdCompletePath || null,
        downloadPath: downloadPath || null,
        postProcessEnabled,
        autoSearchWishlist: autoSearch,
        wishlistIntervalHours: intervalHours,
        preferredRepackers: config?.preferredRepackers || null,
      });
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSabnzbd = async () => {
    setSabnzbdStatus('idle');
    const ok = await testSabnzbd(sabnzbdHost, sabnzbdPort, sabnzbdApiKey, sabnzbdUseSsl);
    setSabnzbdStatus(ok ? 'ok' : 'fail');
  };

  const handleTestNzbplanet = async () => {
    setNzbplanetStatus('idle');
    const ok = await testNzbplanet(nzbplanetApiKey);
    setNzbplanetStatus(ok ? 'ok' : 'fail');
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading config...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Downloads</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure SABnzbd and NZBPlanet to download game ISOs.
        </p>
      </div>

      {/* SABnzbd Card */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden" style={{ borderLeft: '3px solid #e5a00d' }}>
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5a00d]/10" style={{ color: '#e5a00d' }}>
            <Server className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">SABnzbd</p>
              {sabnzbdStatus === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              {sabnzbdStatus === 'fail' && <XCircle className="h-4 w-4 text-red-400" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Usenet download client</p>
          </div>
        </div>
        <div className="border-t border-border/20 px-5 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Host</label>
              <input
                type="text" value={sabnzbdHost}
                onChange={e => setSabnzbdHost(e.target.value)}
                placeholder="192.168.1.58"
                className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Port</label>
              <input
                type="number" value={sabnzbdPort}
                onChange={e => setSabnzbdPort(parseInt(e.target.value) || 8080)}
                className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <input
              type="password" value={sabnzbdApiKey}
              onChange={e => setSabnzbdApiKey(e.target.value)}
              placeholder="SABnzbd API key"
              className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DkSwitch checked={sabnzbdUseSsl} onCheckedChange={setSabnzbdUseSsl} />
              <span className="text-xs text-muted-foreground">Use SSL</span>
            </div>
            <DkButton size="sm" variant="ghost" onClick={handleTestSabnzbd} loading={testingSabnzbd} className="shadow-none">
              Test Connection
            </DkButton>
          </div>
        </div>
      </div>

      {/* NZBPlanet Card */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden" style={{ borderLeft: '3px solid #7c3aed' }}>
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7c3aed]/10" style={{ color: '#7c3aed' }}>
            <Search className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">NZBPlanet</p>
              {nzbplanetStatus === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
              {nzbplanetStatus === 'fail' && <XCircle className="h-4 w-4 text-red-400" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Usenet indexer</p>
          </div>
        </div>
        <div className="border-t border-border/20 px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <input
              type="password" value={nzbplanetApiKey}
              onChange={e => setNzbplanetApiKey(e.target.value)}
              placeholder="NZBPlanet API key"
              className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
            />
          </div>
          <DkButton size="sm" variant="ghost" onClick={handleTestNzbplanet} loading={testingNzbplanet} className="shadow-none">
            Test API Key
          </DkButton>
        </div>
      </div>

      {/* Path mapping + post-processing */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <h3 className="text-sm font-semibold">Path Mapping</h3>
        <p className="text-xs text-muted-foreground -mt-1">
          SABnzbd downloads to one folder. Otix moves completed ISOs to your game library.
        </p>
        <div>
          <label className="text-xs font-medium text-muted-foreground">SABnzbd Completed Folder (source)</label>
          <input
            type="text" value={sabnzbdCompletePath}
            onChange={e => setSabnzbdCompletePath(e.target.value)}
            placeholder="e.g. /mnt/user/downloads/completed or \\NAS\downloads"
            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground mt-1">Where SABnzbd puts extracted files. Get this from SABnzbd → Config → Folders → Completed Download Folder.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">ISO Library Path (destination)</label>
          <input
            type="text" value={downloadPath}
            onChange={e => setDownloadPath(e.target.value)}
            placeholder="e.g. D:\Games\ISOs"
            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
          />
          <p className="text-xs text-muted-foreground mt-1">Where Otix moves ISO files after download completes.</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Post-process after download</p>
            <p className="text-xs text-muted-foreground">Automatically find and move ISOs from source to library</p>
          </div>
          <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
        </div>
      </div>

      {/* Auto-search wishlist */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <h3 className="text-sm font-semibold">Auto-Search</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-search wishlist</p>
            <p className="text-xs text-muted-foreground">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Interval (hours)</label>
            <input
              type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="mt-1 w-24 h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
            />
          </div>
        )}
      </div>

      <DkButton onClick={handleSave} loading={saving} className="w-full">
        Save Configuration
      </DkButton>
    </div>
  );
}
