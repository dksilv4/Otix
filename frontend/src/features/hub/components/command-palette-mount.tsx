import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useFeature } from '@/features/_config'
import { registerHubProvider } from '../registry'
import { getDefaultHubProviders } from '../providers'
import { useCommandPalette } from '../hooks/use-command-palette'
import { CommandPalette } from './organisms/command-palette'

/**
 * Single global mount for the command palette. Renders the Cmd+K listener,
 * registers the bundled providers, and portals the overlay to document.body.
 * Gate on the 'hub' feature flag so it can be flipped off.
 */
export function CommandPaletteMount() {
  const enabled = useFeature('hub')
  const palette = useCommandPalette()

  useEffect(() => {
    const unregisters = getDefaultHubProviders().map(registerHubProvider)
    return () => unregisters.forEach((unregister) => unregister())
  }, [])

  if (!enabled) return null

  return createPortal(
    <CommandPalette isOpen={palette.isOpen} onClose={palette.close} />,
    document.body,
  )
}
