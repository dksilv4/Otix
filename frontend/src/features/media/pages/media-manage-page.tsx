import { useEffect } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { mediaTypeFromParam } from '@media'
import { useModal } from '@/lib/modals'
import { MediaManageModal } from '../components/organisms/media-manage-modal'

/**
 * Backwards-compatibility wrapper for any direct links or bookmarks to
 * `/media/$mediaType/$mediaId/manage`. It opens the modal via the modal framework
 * and navigates back to the media detail page when closed.
 */
export function MediaManagePage() {
  const navigate = useNavigate()
  const { openModal } = useModal()
  const params = useParams({ strict: false }) as { mediaType?: string; mediaId?: string }
  const mediaType = mediaTypeFromParam(params.mediaType || 'movie')
  const mediaId = params.mediaId || ''

  useEffect(() => {
    const close = openModal(
      <MediaManageModal
        mediaType={mediaType}
        mediaId={mediaId}
        onClose={() => {
          close()
          void (navigate as any)({
            to: '/media/$mediaType/$mediaId',
            params: { mediaType, mediaId },
          })
        }}
      />
    )
    return () => {
      close()
    }
  }, [mediaType, mediaId, openModal, navigate])

  return null
}

export { MediaManageModal } from '../components/organisms/media-manage-modal'
