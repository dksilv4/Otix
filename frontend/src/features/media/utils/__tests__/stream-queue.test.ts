import { describe, it, expect } from 'vitest'
import { buildUpcomingEpisodeQueue } from '../player'
import type { SeasonOut } from '../../queries/media-queries'

describe('buildUpcomingEpisodeQueue', () => {
  const sampleSeasons: SeasonOut[] = [
    {
      id: 's1',
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: 3,
      episodes: [
        { id: 'ep-1-1', episodeNumber: 1, name: 'Pilot', runtime: 45 },
        { id: 'ep-1-2', episodeNumber: 2, name: 'Second Episode', runtime: 48 },
        { id: 'ep-1-3', episodeNumber: 3, name: 'Third Episode', runtime: 50 },
      ],
    },
    {
      id: 's2',
      seasonNumber: 2,
      name: 'Season 2',
      episodeCount: 3,
      episodes: [
        { id: 'ep-2-1', episodeNumber: 1, name: 'Season 2 Premiere', runtime: 52 },
        { id: 'ep-2-2', episodeNumber: 2, name: 'S2 E2', runtime: 46 },
        { id: 'ep-2-3', episodeNumber: 3, name: 'S2 Finale', runtime: 55 },
      ],
    },
    {
      id: 's3',
      seasonNumber: 3,
      name: 'Season 3',
      episodeCount: 4,
      episodes: [
        { id: 'ep-3-1', episodeNumber: 1, name: 'S3 E1', runtime: 44 },
        { id: 'ep-3-2', episodeNumber: 2, name: 'S3 E2', runtime: 45 },
        { id: 'ep-3-3', episodeNumber: 3, name: 'S3 E3', runtime: 45 },
        { id: 'ep-3-4', episodeNumber: 4, name: 'Series Finale', runtime: 60 },
      ],
    },
  ]

  it('queues remaining episodes in current season and all of next season', () => {
    // Current is Season 1, Episode 2.
    // Remaining in Season 1: Episode 3 (1 episode)
    // Next season (Season 2): Episodes 1, 2, 3 (3 episodes)
    // Total so far: 4 (< 5).
    // Subsequent season (Season 3): takes 1 episode to reach at least 5!
    const queue = buildUpcomingEpisodeQueue({
      showId: 'show-100',
      showTitle: 'Breaking Bad',
      currentSeasonNumber: 1,
      currentEpisodeNumber: 2,
      seasons: sampleSeasons,
      sessionTemplate: {
        source: 'plex',
        serverUrl: 'https://plex.example.com',
        token: 'plex-token-xyz',
      },
    })

    expect(queue.length).toBeGreaterThanOrEqual(5)
    // First should be Season 1 Episode 3
    expect(queue[0].episodeContext).toEqual({
      seriesTitle: 'Breaking Bad',
      seasonNumber: 1,
      episodeNumber: 3,
      episodeTitle: 'Third Episode',
    })
    // Second should be Season 2 Episode 1
    expect(queue[1].episodeContext).toEqual({
      seriesTitle: 'Breaking Bad',
      seasonNumber: 2,
      episodeNumber: 1,
      episodeTitle: 'Season 2 Premiere',
    })
    // Third is S2 E2, Fourth is S2 E3
    expect(queue[2].episodeContext?.seasonNumber).toBe(2)
    expect(queue[2].episodeContext?.episodeNumber).toBe(2)
    expect(queue[3].episodeContext?.seasonNumber).toBe(2)
    expect(queue[3].episodeContext?.episodeNumber).toBe(3)
    // Fifth is S3 E1 (guaranteeing >= 5 upcoming episodes)
    expect(queue[4].episodeContext?.seasonNumber).toBe(3)
    expect(queue[4].episodeContext?.episodeNumber).toBe(1)
  })

  it('includes all remaining episodes in current season when there are many', () => {
    const longSeason: SeasonOut[] = [
      {
        id: 's1',
        seasonNumber: 1,
        episodeCount: 10,
        episodes: Array.from({ length: 10 }, (_, i) => ({
          id: `ep-1-${i + 1}`,
          episodeNumber: i + 1,
          name: `Ep ${i + 1}`,
          runtime: 40,
        })),
      },
      {
        id: 's2',
        seasonNumber: 2,
        episodeCount: 10,
        episodes: Array.from({ length: 10 }, (_, i) => ({
          id: `ep-2-${i + 1}`,
          episodeNumber: i + 1,
          name: `S2 Ep ${i + 1}`,
          runtime: 40,
        })),
      },
    ]

    // Playing Episode 1 of Season 1
    // Remaining in Season 1: 9 episodes (E2 to E10)
    // Next season (Season 2): 10 episodes (E1 to E10)
    // Total should be 19 episodes queued!
    const queue = buildUpcomingEpisodeQueue({
      showId: 'show-200',
      showTitle: 'Long Show',
      currentSeasonNumber: 1,
      currentEpisodeNumber: 1,
      seasons: longSeason,
    })

    expect(queue.length).toBe(19)
    expect(queue[0].episodeContext?.episodeNumber).toBe(2)
    expect(queue[8].episodeContext?.episodeNumber).toBe(10)
    expect(queue[8].episodeContext?.seasonNumber).toBe(1)
    expect(queue[9].episodeContext?.episodeNumber).toBe(1)
    expect(queue[9].episodeContext?.seasonNumber).toBe(2)
  })

  it('returns empty array when at the very last episode of the series', () => {
    const queue = buildUpcomingEpisodeQueue({
      showId: 'show-100',
      showTitle: 'Breaking Bad',
      currentSeasonNumber: 3,
      currentEpisodeNumber: 4,
      seasons: sampleSeasons,
    })

    expect(queue).toEqual([])
  })

  it('handles empty or missing seasons gracefully', () => {
    const queue = buildUpcomingEpisodeQueue({
      showId: 'show-empty',
      currentSeasonNumber: 1,
      currentEpisodeNumber: 1,
      seasons: [],
    })

    expect(queue).toEqual([])
  })
})
