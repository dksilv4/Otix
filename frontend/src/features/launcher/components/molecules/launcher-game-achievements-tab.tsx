import { useState, useMemo } from 'react'
import { Trophy, Search, RefreshCw, Eye, EyeOff, Lock, CheckCircle2, Sparkles } from 'lucide-react'
import { useGameAchievements } from '../../hooks/use-game-achievements'
import {
  filterAchievements,
  formatUnlockDate,
  formatRarityPercentage,
  isRareAchievement,
  type AchievementFilterType,
} from '../../utils/achievement-utils'

interface LauncherGameAchievementsTabProps {
  gameId: string
  gameTitle: string
}

export const LauncherGameAchievementsTab = ({ gameId, gameTitle }: LauncherGameAchievementsTabProps) => {
  const { achievements, stats, loading, sync } = useGameAchievements(gameId)
  const [filter, setFilter] = useState<AchievementFilterType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [revealSecrets, setRevealSecrets] = useState(false)

  const filteredAchievements = useMemo(() => {
    return filterAchievements(achievements, filter, searchQuery)
  }, [achievements, filter, searchQuery])

  return (
    <div className="space-y-6">
      {/* Overview Stats Pod */}
      <div className="p-5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.06] backdrop-blur-xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Progress Circular / Badge */}
            <div className="w-14 h-14 rounded-2xl bg-[var(--dk-surface-raised)] border border-white/[0.06] flex flex-col items-center justify-center shrink-0">
              <span className="text-base font-black text-foreground leading-none">
                {stats.completionPercentage}%
              </span>
              <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                Done
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Trophy size={16} className="text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  Achievements Progress
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stats.unlocked} of {stats.total} unlocked • {stats.earnedPoints} of {stats.totalPoints} XP earned
              </p>
            </div>
          </div>

          {/* Sync Button */}
          <button
            onClick={() => sync()}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-field)] border border-white/[0.06] text-xs font-semibold text-foreground transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>

        {/* Horizontal Progress Track */}
        <div className="w-full h-2 rounded-full bg-[var(--dk-surface-field)] overflow-hidden mt-4 border border-white/[0.04]">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${stats.completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search achievements..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.06] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Filter Pills & Secret Reveal Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.06] p-1 gap-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({achievements.length})
            </button>
            <button
              onClick={() => setFilter('unlocked')}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'unlocked'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Unlocked ({stats.unlocked})
            </button>
            <button
              onClick={() => setFilter('locked')}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'locked'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Locked ({Math.max(0, stats.total - stats.unlocked)})
            </button>
            <button
              onClick={() => setFilter('rare')}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition-all cursor-pointer ${
                filter === 'rare'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Rare
            </button>
          </div>

          {/* Reveal Secrets Toggle */}
          <button
            onClick={() => setRevealSecrets(!revealSecrets)}
            className={`p-2 rounded-xl border border-white/[0.06] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
              revealSecrets
                ? 'bg-primary/20 text-primary'
                : 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:text-foreground'
            }`}
            title={revealSecrets ? 'Hide secret descriptions' : 'Reveal secret descriptions'}
          >
            {revealSecrets ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className="hidden md:inline">Secrets</span>
          </button>
        </div>
      </div>

      {/* Achievements List */}
      {filteredAchievements.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
          <Trophy size={36} className="text-muted-foreground/40 mb-3" />
          <h4 className="text-sm font-bold text-foreground">No achievements found</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {searchQuery
              ? 'No achievements match your search filter.'
              : `No achievement data has been registered or synced yet for ${gameTitle}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredAchievements.map((ach) => {
            const isSecret = ach.hidden && !ach.unlocked && !revealSecrets
            const isRare = isRareAchievement(ach.rarityPercentage)

            return (
              <div
                key={ach.id}
                className={`p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 ${
                  ach.unlocked
                    ? 'bg-[var(--dk-surface-ghost)] border-white/[0.06]'
                    : 'bg-[var(--dk-surface-ghost)]/40 border-white/[0.02]'
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl shrink-0 border border-white/[0.06] flex items-center justify-center overflow-hidden ${
                    ach.unlocked
                      ? 'bg-[var(--dk-surface-raised)]'
                      : 'bg-[var(--dk-surface-field)]/60'
                  }`}
                >
                  {isSecret ? (
                    <Lock size={18} className="text-muted-foreground/60" />
                  ) : ach.iconUrl ? (
                    <img
                      src={ach.iconUrl}
                      alt={ach.displayName}
                      className={`w-full h-full object-cover ${
                        ach.unlocked ? '' : 'grayscale opacity-35'
                      }`}
                    />
                  ) : (
                    <Trophy
                      size={20}
                      className={ach.unlocked ? 'text-primary' : 'text-muted-foreground/40'}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <h4
                      className={`text-xs font-bold truncate ${
                        ach.unlocked ? 'text-foreground' : 'text-foreground/75'
                      }`}
                    >
                      {isSecret ? 'Secret Achievement' : ach.displayName}
                    </h4>

                    {isRare && (
                      <span className="px-1.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-primary/20">
                        <Sparkles size={10} />
                        Rare {formatRarityPercentage(ach.rarityPercentage)}
                      </span>
                    )}

                    {ach.unlocked && (
                      <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 size={11} className="text-primary" />
                        {formatUnlockDate(ach.unlockedAt)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 font-normal leading-relaxed">
                    {isSecret
                      ? 'Details for this achievement are hidden until unlocked.'
                      : ach.description || 'No description provided.'}
                  </p>
                </div>

                {/* Points Badge */}
                {ach.points > 0 && (
                  <div className="shrink-0 px-2 py-1 rounded-lg bg-[var(--dk-surface-raised)] border border-white/[0.06] text-[11px] font-bold text-foreground">
                    +{ach.points} XP
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
