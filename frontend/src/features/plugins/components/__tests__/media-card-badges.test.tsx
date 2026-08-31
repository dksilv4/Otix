import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MediaCardBadges } from '../media-card-badges'

const { getSlotData, apiRef } = vi.hoisted(() => {
  const getSlotData = vi.fn()
  return {
    getSlotData,
    apiRef: {
      value: { getSlotData } as { getSlotData?: typeof getSlotData } | null,
    },
  }
})

vi.mock('@/features/plugins/api', () => ({
  getPluginAPI: () => apiRef.value,
}))

describe('MediaCardBadges', () => {
  beforeEach(() => {
    getSlotData.mockReset()
    apiRef.value = { getSlotData }
  })

  it('renders badge widgets from the media/card/badges slot', async () => {
    getSlotData.mockResolvedValue([
      {
        pluginId: 'plex',
        label: 'Plex',
        data: {
          widgets: [{ type: 'badge', props: { text: 'On Plex', tone: 'success' } }],
        },
      },
    ])

    render(<MediaCardBadges mediaId="01ABC" mediaType="movie" tmdbId="27205" />)

    expect(await screen.findByText('On Plex')).toBeInTheDocument()
    expect(getSlotData).toHaveBeenCalledWith('media/card/badges', {
      mediaId: '01ABC',
      mediaType: 'movie',
      tmdbId: '27205',
    })
  })

  it('renders nothing when the slot returns no badge widgets', async () => {
    getSlotData.mockResolvedValue([
      { pluginId: 'plex', label: 'Plex', data: { widgets: [] } },
    ])

    const { container } = render(
      <MediaCardBadges mediaId="01ABC" mediaType="movie" tmdbId={null} />,
    )

    await waitFor(() => expect(getSlotData).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('renders nothing without a desktop plugin API', async () => {
    apiRef.value = null

    const { container } = render(
      <MediaCardBadges mediaId="01ABC" mediaType="movie" />,
    )

    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(getSlotData).not.toHaveBeenCalled()
  })
})
