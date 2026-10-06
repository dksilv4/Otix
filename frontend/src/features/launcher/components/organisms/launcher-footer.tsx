/* ── LauncherFooter — composes DiskSpaceWidget + LauncherScanWidget ── */

import { DiskSpaceWidget } from '@/features/launcher/components/molecules/launcher-disk-space-widget'
import { LauncherScanWidget } from '@/features/launcher/components/molecules/launcher-scan-widget'

export const LauncherFooter = ({ id }: { id?: string }) => {
  return (
    <div id={id} className="flex flex-col md:flex-row justify-between items-stretch gap-6">
      <DiskSpaceWidget id="launcher-disk-widget" />
      <LauncherScanWidget id="launcher-scan-widget" />
    </div>
  )
};
