import { useEffect, useRef } from 'react'
import { useModal } from '@/lib/modals'
import { levelUpListeners, type LevelUpEvent } from '@ui/atoms/xp-toast'
import { LevelUpModal } from '../molecules/level-up-modal'

/** Listens for level-up events and opens the celebratory LevelUpModal via the modal framework. */
export const LevelUpHost = () => {
  const { openModal } = useModal()
  const openModalRef = useRef(openModal)
  useEffect(() => {
    openModalRef.current = openModal
  })
  const isOpenRef = useRef(false)

  useEffect(() => {
    const handler = (event: LevelUpEvent) => {
      if (isOpenRef.current) return
      isOpenRef.current = true
      const close = openModalRef.current(
        <LevelUpModal
          level={event.level}
          title={event.title}
          onClose={() => {
            isOpenRef.current = false
            close()
          }}
        />,
      )
    }

    levelUpListeners.add(handler)
    return () => {
      levelUpListeners.delete(handler)
    }
  }, [])

  return null
};
