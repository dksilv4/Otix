import { useEffect, useState, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useFeature } from '@/features/_config'
import { registerHubProvider } from '../registry'
import { getDefaultHubProviders } from '../providers'
import { useCommandPalette } from '../hooks/use-command-palette'

const CommandPalette = lazy(() =>
  import('./organisms/command-palette').then((m) => ({ default: m.CommandPalette })),
)

/**
 * Single global mount for the command palette. Renders the Cmd+K listener,
 * registers the bundled providers, and portals the overlay to document.body.
 * Gate on the 'hub' feature flag so it can be flipped off.
 */
export const CommandPaletteMount = () => {
  const enabled = useFeature('hub')
  const palette = useCommandPalette()
  const [hasOpened, setHasOpened] = useState(false)

  useEffect(() => {
    if (palette.isOpen) {
      setHasOpened(true)
    }
  }, [palette.isOpen])

  useEffect(() => {
    const unregisters = getDefaultHubProviders().map(registerHubProvider)
    return () => unregisters.forEach((unregister) => unregister())
  }, [])

  if (!enabled || (!hasOpened && !palette.isOpen)) return null

  return createPortal(
    <Suspense fallback={null}>
      <CommandPalette isOpen={palette.isOpen} onClose={palette.close} />
    </Suspense>,
    document.body,
  )
};
