import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaGallery } from '../media-gallery'
import type { MediaAssetOut } from '../../../queries/media-queries'

describe('MediaGallery', () => {
  it('renders nothing when videos and screenshots are empty', () => {
    const { container } = render(<MediaGallery videos={[]} screenshots={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when videos and screenshots contain only nulls or invalid items', () => {
    const { container } = render(
      <MediaGallery
        videos={[{ url: '' }]}
        screenshots={[{ id: 1, assetType: 'screenshot', url: '' } as MediaAssetOut]}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders videos when valid YouTube videos are provided', () => {
    const videos = [
      {
        videoType: 'Trailer',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ]

    render(<MediaGallery videos={videos} screenshots={[]} title="Test Movie" />)
    expect(screen.getByText('Media Gallery')).toBeInTheDocument()
    expect(screen.getByText('Trailer')).toBeInTheDocument()
  })

  it('renders screenshots when valid screenshot assets are provided', () => {
    const screenshots: MediaAssetOut[] = [
      {
        id: 1,
        assetType: 'screenshot',
        url: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg',
      },
      {
        id: 2,
        assetType: 'screenshot',
        url: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc2.jpg',
      },
    ]

    render(<MediaGallery videos={[]} screenshots={screenshots} title="Test Game" />)
    expect(screen.getByText('Media Gallery')).toBeInTheDocument()
    expect(screen.getByAltText('Test Game screenshot 1')).toBeInTheDocument()
    expect(screen.getByAltText('Test Game screenshot 2')).toBeInTheDocument()
  })

  it('renders tabs when both videos and screenshots are present', () => {
    const videos = [
      {
        videoType: 'game_video',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
    ]
    const screenshots: MediaAssetOut[] = [
      {
        id: 1,
        assetType: 'screenshot',
        url: 'https://images.igdb.com/igdb/image/upload/t_1080p/sc1.jpg',
      },
    ]

    render(<MediaGallery videos={videos} screenshots={screenshots} title="Dual Media" />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Videos (1)')).toBeInTheDocument()
    expect(screen.getByText('Screenshots (1)')).toBeInTheDocument()
    expect(screen.getByText('Gameplay')).toBeInTheDocument()
  })
})
