import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useParams: () => ({ characterId: 'geralt-of-rivia' }),
}))

vi.mock('../../queries/character-queries', () => ({
  characterQueries: {
    detail: (id: string) => ({
      queryKey: ['character', id],
      queryFn: async () => ({
        id: '101',
        name: 'Geralt of Rivia',
        slug: 'geralt-of-rivia',
        description: 'A monster hunter for hire.',
        gender: 'male',
        species: 'human',
        mugShotUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/geralt.jpg',
        games: [
          {
            id: '1',
            mediaType: 'game',
            title: 'The Witcher 3: Wild Hunt',
            slug: 'the-witcher-3',
            posterUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/w3.jpg',
            releaseDate: '2015-05-19',
            avgRating: 93.5,
          },
        ],
      }),
    }),
  },
}))

import { CharacterDetailPage } from '../character-detail-page'

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

describe('CharacterDetailPage', () => {
  it('renders character profile information and games list', async () => {
    renderWithClient(<CharacterDetailPage />)

    expect(await screen.findByText('Geralt of Rivia')).toBeDefined()
    expect(screen.getByText('A monster hunter for hire.')).toBeDefined()
    expect(screen.getByText('human')).toBeDefined()
    expect(screen.getByText('male')).toBeDefined()
    expect(screen.getByText('The Witcher 3: Wild Hunt')).toBeDefined()
    expect(screen.getByText('2015')).toBeDefined()
    expect(screen.getByText('93.5')).toBeDefined()
  })
})
