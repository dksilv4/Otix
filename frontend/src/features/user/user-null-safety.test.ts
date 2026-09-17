import { describe, it, expect } from 'vitest'
import { computeReviewStats } from './user-queries'

describe('computeReviewStats null-safety and format resilience', () => {
  it('handles a bare array of review objects', () => {
    const reviews = [{ score: 8 }, { score: 10 }, { score: null }]
    const stats = computeReviewStats(reviews)
    expect(stats.totalReviews).toBe(3)
    expect(stats.ratedCount).toBe(2)
    expect(stats.averageRating).toBe(9)
    expect(stats.distribution[7].count).toBe(1) // score 8 (0-indexed 7)
    expect(stats.distribution[9].count).toBe(1) // score 10 (0-indexed 9)
  })

  it('handles DRF paginated response shape { count, results } without throwing reviews.filter is not a function', () => {
    const drfResponse = {
      count: 2,
      next: null,
      previous: null,
      results: [{ score: 6 }, { score: 4 }],
    }
    const stats = computeReviewStats(drfResponse)
    expect(stats.totalReviews).toBe(2)
    expect(stats.ratedCount).toBe(2)
    expect(stats.averageRating).toBe(5)
    expect(stats.distribution[5].count).toBe(1) // score 6
    expect(stats.distribution[3].count).toBe(1) // score 4
  })

  it('handles { items: [...] } object shape', () => {
    const itemsResponse = {
      items: [{ score: 7 }],
    }
    const stats = computeReviewStats(itemsResponse)
    expect(stats.totalReviews).toBe(1)
    expect(stats.ratedCount).toBe(1)
    expect(stats.averageRating).toBe(7)
  })

  it('safely handles null, undefined, and empty objects without crashing', () => {
    expect(computeReviewStats(null)).toEqual({
      totalReviews: 0,
      ratedCount: 0,
      averageRating: null,
      distribution: Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 })),
    })

    expect(computeReviewStats(undefined)).toEqual({
      totalReviews: 0,
      ratedCount: 0,
      averageRating: null,
      distribution: Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 })),
    })

    expect(computeReviewStats({})).toEqual({
      totalReviews: 0,
      ratedCount: 0,
      averageRating: null,
      distribution: Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 })),
    })

    expect(computeReviewStats('not an array' as unknown)).toEqual({
      totalReviews: 0,
      ratedCount: 0,
      averageRating: null,
      distribution: Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: 0 })),
    })
  })

  it('handles reviews with invalid or NaN scores safely', () => {
    const sparseReviews = [
      { score: NaN },
      { score: null },
      { score: undefined as unknown as number },
      { score: 5 },
      null as unknown as { score: number },
    ]
    const stats = computeReviewStats(sparseReviews)
    expect(stats.totalReviews).toBe(5)
    expect(stats.ratedCount).toBe(1)
    expect(stats.averageRating).toBe(5)
  })
})
