// TODO: Review this file
export type Maturity = 'alpha' | 'beta' | 'production'

export interface ExperimentDefinition {
  key: string
  name: string
  description: string
  maturity: Maturity
  defaultEnabled: boolean
}

export const EXPERIMENTS: ExperimentDefinition[] = [
  // ── Alpha ──
  {
    key: 'ai_recommendations',
    name: 'AI Recommendations',
    description:
      'Personalized content recommendations using embedding-based vector search and collaborative filtering. Naive all-users scan with no caching or ML pipeline yet.',
    maturity: 'alpha',
    defaultEnabled: false,
  },
  {
    key: 'mood_checkins',
    name: 'Daily Mood Check-ins',
    description:
      'Log your emotional state each day. Today-only endpoints with no aggregation, trends, or history views.',
    maturity: 'alpha',
    defaultEnabled: false,
  },
  {
    key: 'admin_edit_proposals',
    name: 'Community Edit Proposals',
    description:
      'Submit metadata corrections for media items. Admin review queue with approve/reject workflow. Not yet wired into media mutation services.',
    maturity: 'alpha',
    defaultEnabled: false,
  },

  // ── Beta ──
  {
    key: 'community_edit_proposals',
    name: 'Community Edit Proposals (Voting)',
    description:
      'Allow trusted users (based on XP threshold) to submit and vote on media edit proposals. Adds upvote/downvote on pending proposals.',
    maturity: 'beta',
    defaultEnabled: false,
  },
  {
    key: 'workout_tracker',
    name: 'Workout Tracker',
    description:
      'Log workouts with NLP-based exercise parsing from free-text input. Full CRUD with heatmap, streaks, and sets tracking. Volume stats not yet populated.',
    maturity: 'beta',
    defaultEnabled: false,
  },
  {
    key: 'friends_social',
    name: 'Friends & Social Feed',
    description:
      'Follow other users, send friend requests, and see social activity. Data layer exists but no dedicated friends page or activity feed UI yet.',
    maturity: 'beta',
    defaultEnabled: false,
  },
  {
    key: 'sse_notifications',
    name: 'Real-time Notifications',
    description:
      'Push notifications delivered via Server-Sent Events with Redis pub/sub. Infrastructure exists but notification creation is sparsely wired across services.',
    maturity: 'beta',
    defaultEnabled: false,
  },
  {
    key: 'youtube_sync',
    name: 'YouTube Music Sync',
    description:
      'Sync liked YouTube music videos into Otix as listened interactions. Uses heuristic title parsing with confidence thresholds — matching may be approximate.',
    maturity: 'beta',
    defaultEnabled: false,
  },
  {
    key: 'download_integration',
    name: 'SABnzbd + NZBPlanet Download Integration',
    description:
      'Configure SABnzbd and NZBPlanet to search for and download game ISOs directly from the desktop app. Admin-only. Local SQLite storage, no server-side traces.',
    maturity: 'alpha',
    defaultEnabled: true,
  },

  // ── Production ──
  {
    key: 'gamification',
    name: 'Gamification',
    description:
      'Earn XP for reviews, workouts, and interactions. 8 level tiers (Novice → Transcendent), 43 achievement badges, and login/review/workout streaks.',
    maturity: 'production',
    defaultEnabled: true,
  },
]

export const MATURITY_LABELS: Record<Maturity, string> = {
  alpha: 'Alpha',
  beta: 'Beta',
  production: 'Production',
}

export const MATURITY_COLORS: Record<Maturity, string> = {
  alpha: 'text-red-600 dark:text-red-400',
  beta: 'text-amber-600 dark:text-amber-400',
  production: 'text-green-600 dark:text-green-400',
}

export const MATURITY_BADGE_VARIANT: Record<Maturity, 'destructive' | 'warning' | 'success'> = {
  alpha: 'destructive',
  beta: 'warning',
  production: 'success',
}
