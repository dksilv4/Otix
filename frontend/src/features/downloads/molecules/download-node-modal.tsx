import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import {
  DownloadCloud,
  ExternalLink,
  HardDrive,
  Laptop,
  Server,
  Sparkles,
} from 'lucide-react'

export interface DownloadNodeModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
}

const GITHUB_RELEASE_BASE = 'https://github.com/dksilv4/Otix/releases/latest/download'
const GITHUB_RELEASE_PAGE = 'https://github.com/dksilv4/Otix/releases/latest'

export const DownloadNodeModal = ({ isOpen, isExiting, onClose }: DownloadNodeModalProps) => {
  const downloadOptions = [
    {
      platform: 'macOS',
      arch: 'Apple Silicon (M1-M4) & Intel',
      filename: 'Otix-Node.dmg',
      format: 'Apple Disk Image (.dmg)',
      description: 'Open the DMG, drag Otix Node to Applications, and double-click to start. No terminal or scripts needed.',
      url: `${GITHUB_RELEASE_BASE}/Otix-Node.dmg`,
      primary: true,
      badge: 'Universal DMG',
    },
    {
      platform: 'Windows',
      arch: '64-bit (x64)',
      filename: 'Otix-Node-Windows-x64.zip',
      format: 'Portable Executable (.zip)',
      description: 'Extract the zip and double-click otix-node.exe. Automatically opens your browser on launch.',
      url: `${GITHUB_RELEASE_BASE}/Otix-Node-Windows-x64.zip`,
      primary: true,
      badge: 'Portable .exe',
    },
    {
      platform: 'Linux',
      arch: 'x86_64 & arm64',
      filename: 'Otix-Node-Linux-x64.tar.gz',
      format: 'Standalone Binary (.tar.gz)',
      description: 'Lightweight ~7MB static binary or run via Docker on your home server.',
      url: `${GITHUB_RELEASE_BASE}/Otix-Node-Linux-x64.tar.gz`,
      primary: false,
      badge: 'Static Binary',
    },
    {
      platform: 'Unraid',
      arch: 'Docker / Community Apps',
      filename: 'my-otix-server.xml',
      format: 'Template (.xml)',
      description: 'Add to Unraid templates-user or search "Otix Node" in Community Applications.',
      url: 'https://raw.githubusercontent.com/dksilv4/Otix/main/node/unraid/my-otix-server.xml',
      primary: false,
      badge: 'Unraid Template',
    },
  ]

  return (
    <DkDialog
      open={isOpen !== false && !isExiting}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Download Otix Node"
      description="Run the Otix companion daemon on your computer or NAS to host games, sync saves, and enable remote access."
      className="max-w-3xl"
    >
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
        {/* Onboarding Highlights Banner */}
        <div className="p-4 rounded-2xl bg-primary/10 shadow-[var(--dk-shadow-sm)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-primary mt-0.5 sm:mt-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Simple Double-Click Setup</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                No terminal commands or scripts required. Double-click to launch, and it will immediately open your browser with your 6-character Claim PIN (e.g.{' '}
                <span className="font-mono text-primary font-bold">OTX-XXXX</span>).
              </p>
            </div>
          </div>
          <DkButton size="sm" variant="ghost" asChild className="shrink-0">
            <a href={GITHUB_RELEASE_PAGE} target="_blank" rel="noreferrer" className="flex items-center gap-1.5">
              GitHub Releases
              <ExternalLink size={13} />
            </a>
          </DkButton>
        </div>

        {/* Download Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {downloadOptions.map((opt) => (
            <div
              key={opt.platform}
              className="p-4 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    {opt.platform === 'macOS' ? (
                      <Laptop className="h-4 w-4 text-foreground/80" />
                    ) : opt.platform === 'Windows' ? (
                      <HardDrive className="h-4 w-4 text-foreground/80" />
                    ) : (
                      <Server className="h-4 w-4 text-foreground/80" />
                    )}
                    <span className="text-sm font-bold text-foreground">{opt.platform}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--dk-surface-ghost-hover)] text-muted-foreground">
                    {opt.badge}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-muted-foreground mb-2">{opt.arch}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-muted-foreground/60 truncate">{opt.filename}</span>
                <DkButton size="sm" variant={opt.primary ? 'primary' : 'secondary'} asChild>
                  <a href={opt.url} target="_blank" rel="noreferrer" download className="flex items-center gap-1.5">
                    <DownloadCloud size={13} />
                    Download
                  </a>
                </DkButton>
              </div>
            </div>
          ))}
        </div>

        {/* 3-Step Setup Instructions */}
        <div className="p-4 rounded-xl bg-[var(--dk-surface-ghost)] space-y-2.5">
          <h5 className="text-xs font-bold uppercase tracking-wider text-foreground/80">How it works</h5>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                1
              </span>
              <p>Download and open the app for your OS. It runs quietly in the background.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                2
              </span>
              <p>Your browser opens to the setup page with your 6-character claim PIN.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                3
              </span>
              <p>Otix auto-detects the node on your network. Click Claim to link it!</p>
            </div>
          </div>
        </div>
      </div>
    </DkDialog>
  )
};
