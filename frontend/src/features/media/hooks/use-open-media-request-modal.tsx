import { useCallback, useRef } from 'react'
import { useModal } from '@/lib/modals'
import { MediaRequestConfirmModal } from '../components/organisms/media-request-confirm-modal'
import type { RequestMediaState } from './use-request-media'

export interface OpenMediaRequestModalOptions {
  state: RequestMediaState
  initialInstanceId?: string
  onWatch?: () => void
}

export const useOpenMediaRequestModal = () => {
  const { openModal } = useModal()
  const closeRef = useRef<(() => void) | null>(null)

  const openRequestModal = useCallback(
    (options: OpenMediaRequestModalOptions) => {
      // Close any active instance before opening a new one
      if (closeRef.current) {
        closeRef.current()
        closeRef.current = null
      }

      const close = openModal(
        <MediaRequestConfirmModal
          open={true}
          onClose={() => {
            if (closeRef.current) {
              closeRef.current()
              closeRef.current = null
            }
          }}
          state={options.state}
          initialInstanceId={options.initialInstanceId}
          onWatch={options.onWatch}
        />,
      )

      closeRef.current = close
      return close
    },
    [openModal],
  )

  return { openRequestModal }
}
