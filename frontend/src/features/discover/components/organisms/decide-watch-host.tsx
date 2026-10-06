import { useEffect, useRef } from 'react'
import { useModal } from '@/lib/modals'
import { DECIDE_WATCH_EVENT } from '@discover/open-decide-watch'
import { DecideWatchModal } from '@discover/components/organisms/decide-watch-modal'

/** Listens for Hub / CTA events and opens the Decide modal via useModal + DkDialog. */
export const DecideWatchHost = () => {
  const { openModal } = useModal()
  const openModalRef = useRef(openModal)
  useEffect(() => {
    openModalRef.current = openModal
  })
  const isOpenRef = useRef(false)

  useEffect(() => {
    const handler = () => {
      if (isOpenRef.current) return
      isOpenRef.current = true
      const close = openModalRef.current(
        <DecideWatchModal
          onClose={() => {
            isOpenRef.current = false
            close()
          }}
        />,
      )
    }

    window.addEventListener(DECIDE_WATCH_EVENT, handler)
    return () => window.removeEventListener(DECIDE_WATCH_EVENT, handler)
  }, [])

  return null
};
