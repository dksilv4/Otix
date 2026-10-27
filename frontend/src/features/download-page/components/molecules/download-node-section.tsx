import { useState } from 'react'
import { Server, Copy, Check, Terminal, ExternalLink, HardDrive } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkBadge } from '@ui/atoms/badge'
import { DOCKER_NODE_COMMAND, UNRAID_TEMPLATE_URL } from '../../constants/downloads-data'
import type { PlatformDownloadOption } from '../../types'
import { DownloadCard } from '../atoms/download-card'

interface DownloadNodeSectionProps {
  options: PlatformDownloadOption[]
  onDownload: (option: PlatformDownloadOption) => void
}

export const DownloadNodeSection = ({
  options,
  onDownload,
}: DownloadNodeSectionProps) => {
  const [copiedDocker, setCopiedDocker] = useState(false)

  const nodeOptions = options.filter(
    (opt) => opt.platform === 'node' || opt.title.toLowerCase().includes('node'),
  )

  const handleCopyDocker = () => {
    navigator.clipboard.writeText(DOCKER_NODE_COMMAND).then(() => {
      setCopiedDocker(true)
      setTimeout(() => setCopiedDocker(false), 2000)
    })
  }

  return (
    <section className="space-y-6">
      {/* Intro Header */}
      <div className="rounded-2xl sm:rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)] space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <DkBadge variant="default" size="sm" className="gap-1.5 px-3 py-1 font-semibold">
            <Server className="h-3.5 w-3.5" />
            <span>Companion Daemon</span>
          </DkBadge>
          <DkBadge variant="secondary" size="sm">
            Self-Hosted Server &amp; NAS
          </DkBadge>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-foreground">
          Otix Node (Headless Companion Server)
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
          Otix Node runs in the background on your home server, NAS (Unraid, TrueNAS, Synology), or secondary PC. It handles remote game library scanning, cloud save synchronization, and zero-relay local bitstream indexing.
        </p>
      </div>

      {/* Docker Quickstart Container Pod */}
      <div className="rounded-2xl p-6 bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Terminal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">
                Docker Run Command
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Quickly spin up an Otix Node container on Linux, Unraid, or Docker Desktop.
              </p>
            </div>
          </div>

          <DkButton
            size="sm"
            variant="secondary"
            onClick={handleCopyDocker}
            className="text-xs font-semibold gap-1.5"
          >
            {copiedDocker ? (
              <Check className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copiedDocker ? 'Copied' : 'Copy Command'}</span>
          </DkButton>
        </div>

        <div className="overflow-x-auto p-4 rounded-xl bg-[var(--dk-surface-ghost)] font-mono text-xs text-foreground/90 leading-relaxed select-all">
          <pre>{DOCKER_NODE_COMMAND}</pre>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
          <a
            href={UNRAID_TEMPLATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Download Unraid Application Template (.xml)</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Standalone Binaries for Node */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Standalone Node Binaries
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodeOptions.map((opt) => (
            <DownloadCard key={opt.id} option={opt} onDownload={onDownload} />
          ))}
        </div>
      </div>
    </section>
  )
}
