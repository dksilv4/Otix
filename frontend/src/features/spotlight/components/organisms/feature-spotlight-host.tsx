import { useEffect, useRef, useCallback, useState } from 'react'
import { useModal } from '@/lib/modals'
import {
  FEATURE_SPOTLIGHT_EVENT,
  type FeatureSpotlightEventDetail,
} from '../../open-feature-spotlight'
import { FeatureSpotlightModal } from './feature-spotlight-modal'
import { FeatureSpotlightTeaser } from '../molecules/feature-spotlight-teaser'
import { useSpotlightIdleTrigger } from '../../hooks/use-spotlight-idle-trigger'
import type { FeatureTip } from '../../types'

export const FeatureSpotlightHost = () => {
  const { openModal } = useModal()
  const openModalRef = useRef(openModal)
  useEffect(() => {
    openModalRef.current = openModal
  })

  const [isModalOpen, setIsModalOpen] = useState(false)
  const { teaserTip, isTeaserVisible, dismissTeaser } = useSpotlightIdleTrigger()

  const launchModal = useCallback((tipId?: string) => {
    setIsModalOpen(true)

    const close = openModalRef.current(
      <FeatureSpotlightModal
        initialTipId={tipId}
        onClose={() => {
          setIsModalOpen(false)
          close()
        }}
      />,
    )
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<FeatureSpotlightEventDetail>
      const tipId = customEvent.detail?.tipId
      launchModal(tipId)
    }

    window.addEventListener(FEATURE_SPOTLIGHT_EVENT, handler)
    return () => window.removeEventListener(FEATURE_SPOTLIGHT_EVENT, handler)
  }, [launchModal])

  const handleOpenFromTeaser = useCallback(
    (tip: FeatureTip) => {
      dismissTeaser()
      launchModal(tip.id)
    },
    [dismissTeaser, launchModal],
  )

  // Don't show teaser if modal is currently open
  const showTeaser = isTeaserVisible && !isModalOpen

  return (
    <FeatureSpotlightTeaser
      tip={teaserTip}
      isVisible={showTeaser}
      onOpenTip={handleOpenFromTeaser}
      onDismiss={dismissTeaser}
    />
  )
}
