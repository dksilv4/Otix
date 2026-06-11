// TODO: Review this file
import './daily-mood-check-in.scss'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CloudRain, Frown, Laugh, Meh, Smile } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { useAuth } from '@/lib/auth'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export type MoodValue = 'bad' | 'low' | 'okay' | 'good' | 'great'
export type FeelingValue =
  | 'heartbroken'
  | 'stressed'
  | 'anxious'
  | 'tired'
  | 'lonely'
  | 'bored'
  | 'calm'
  | 'focused'
  | 'excited'
  | 'grateful'
type MoodStatus = 'submitted' | 'dismissed'

interface MoodCheckInOut {
  id: string
  userId: string
  checkinDate: string
  status: MoodStatus
  mood: MoodValue | null
  feeling: FeelingValue | null
  note: string | null
  createdAt: string
  updatedAt: string
}

interface MoodTodayResponse {
  due: boolean
  checkin: MoodCheckInOut | null
}

export interface RecordedMoodContext {
  feeling: FeelingValue | null
  Icon: LucideIcon
  label: string
  mood: MoodValue
}

const moodOptions: Array<{
  value: MoodValue
  label: string
  Icon: LucideIcon
}> = [
  { value: 'bad', label: 'Bad', Icon: CloudRain },
  { value: 'low', label: 'Low', Icon: Frown },
  { value: 'okay', label: 'Okay', Icon: Meh },
  { value: 'good', label: 'Good', Icon: Smile },
  { value: 'great', label: 'Great', Icon: Laugh },
]

const feelingOptions: Array<{ value: FeelingValue; label: string }> = [
  { value: 'heartbroken', label: 'Heartbroken' },
  { value: 'stressed', label: 'Stressed' },
  { value: 'anxious', label: 'Anxious' },
  { value: 'tired', label: 'Tired' },
  { value: 'lonely', label: 'Lonely' },
  { value: 'bored', label: 'Bored' },
  { value: 'calm', label: 'Calm' },
  { value: 'focused', label: 'Focused' },
  { value: 'excited', label: 'Excited' },
  { value: 'grateful', label: 'Grateful' },
]

const moodQueryKey = ['mood-checkins', 'today'] as const
const MOOD_CHECKIN_XP = 10

interface DailyMoodCheckInProps {
  noteComposerResetKey?: number
  onMoodRecorded?: (context: RecordedMoodContext) => void
  onPromptVisibleChange?: (visible: boolean) => void
}

export function DailyMoodCheckIn({
  noteComposerResetKey = 0,
  onMoodRecorded,
  onPromptVisibleChange,
}: DailyMoodCheckInProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null)
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingValue | null>(null)
  const [error, setError] = useState('')

  const todayQuery = useQuery({
    queryKey: moodQueryKey,
    queryFn: async () => {
      const { data } = await apiClient.get<MoodTodayResponse>('/mood-checkins/today')
      return data
    },
    enabled: isAuthenticated && !isLoading && user?.dailyMoodCheckinsEnabled !== false,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<MoodCheckInOut>('/mood-checkins/dismiss', {})
      return data
    },
    onSuccess: (checkin) => {
      queryClient.setQueryData<MoodTodayResponse>(moodQueryKey, { due: false, checkin })
    },
  })

  const submitMutation = useMutation({
    mutationFn: async ({
      feeling,
      mood,
    }: {
      feeling: FeelingValue | null
      mood: MoodValue
    }) => {
      const { data } = await apiClient.post<MoodCheckInOut>('/mood-checkins', { mood, feeling, note: null })
      return data
    },
    onSuccess: (checkin, variables) => {
      queryClient.setQueryData<MoodTodayResponse>(moodQueryKey, { due: false, checkin })
      const option = moodOptions.find((item) => item.value === variables.mood)
      if (!option) return

      const nextContext = {
        feeling: variables.feeling,
        Icon: option.Icon,
        label: option.label,
        mood: option.value,
      }
      onMoodRecorded?.(nextContext)
    },
  })

  const isBusy = dismissMutation.isPending || submitMutation.isPending
  const isPromptDue = isAuthenticated
    && user?.dailyMoodCheckinsEnabled !== false
    && !todayQuery.isLoading
    && !!todayQuery.data?.due
  const isVisible = isPromptDue

  useEffect(() => {
    onPromptVisibleChange?.(isPromptDue)
  }, [isPromptDue, onPromptVisibleChange])

  useEffect(() => {
    setSelectedMood(null)
    setSelectedFeeling(null)
  }, [noteComposerResetKey])

  const handleDismiss = async () => {
    if (isBusy) return
    setError('')
    try {
      await dismissMutation.mutateAsync()
    } catch {
      setError('Could not save this check-in. Please try again.')
    }
  }

  const handleMoodSelect = (option: (typeof moodOptions)[number]) => {
    if (isBusy) return
    setSelectedMood(option.value)
    setError('')
    onMoodRecorded?.({
      feeling: null,
      Icon: option.Icon,
      label: option.label,
      mood: option.value,
    })
  }

  const handleFeelingSelect = async (feeling: FeelingValue) => {
    if (!selectedMood || isBusy) return
    const nextFeeling = selectedFeeling === feeling ? null : feeling
    setSelectedFeeling(nextFeeling)
    setError('')
    try {
      await submitMutation.mutateAsync({
        mood: selectedMood,
        feeling: nextFeeling,
      })
      showXPToast(MOOD_CHECKIN_XP)
      setSelectedMood(null)
      setSelectedFeeling(null)
    } catch {
      setSelectedFeeling(selectedFeeling)
      setError('Could not save this feeling. Please try again.')
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <section
      aria-label="Daily mood check-in"
      className="dk-discover-checkin"
    >
      <div className="dk-discover-checkin__wrapper">
        {isPromptDue && !selectedMood && (
          <div className="dk-discover-checkin__mood-list">
            {moodOptions.map(({ value, label, Icon }) => {
              const isSelected = selectedMood === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleMoodSelect({ value, label, Icon })}
                  className={cn(
                    'dk-discover-checkin__mood-btn',
                    isSelected && 'dk-discover-checkin__mood-btn--selected',
                  )}
                  aria-pressed={isSelected}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isBusy}
              className="dk-discover-checkin__skip-btn"
            >
              {dismissMutation.isPending ? 'Skipping...' : 'Skip'}
            </button>
          </div>
        )}

        {isPromptDue && selectedMood && (
          <div className="dk-discover-checkin__feeling-list">
            {feelingOptions.map(({ value, label }) => {
              const isSelected = selectedFeeling === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleFeelingSelect(value)}
                  className={cn(
                    'dk-discover-checkin__feeling-btn',
                    isSelected && 'dk-discover-checkin__feeling-btn--selected',
                  )}
                  aria-pressed={isSelected}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}

        {error && <p className="dk-discover-checkin__error">{error}</p>}
      </div>
    </section>
  )
}
