import { isDesktop } from '@/lib/desktop/api'
import { isNativeMobile } from '@/lib/platform'

export const getOAuthPayloadSource = (): { source: 'desktop' | 'mobile' } | undefined => {
  if (isNativeMobile()) return { source: 'mobile' }
  if (isDesktop()) return { source: 'desktop' }
  return undefined
}
