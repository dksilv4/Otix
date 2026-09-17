import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { emitOtixEvent } from '@/lib/plugin-events'
import { useAuth } from '@/lib/providers/auth'
import { showXPToast } from '@ui/atoms/xp-toast'
import type { MoodValue, FeelingValue } from '../types'

export function useMoodCheckIn(onMoodRecorded?: () => void) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [selectedMood, setSelectedMood] = useState<MoodValue | null>(null)
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingValue | null>(null)
  const [error, setError] = useState('')

  const { data: todayData } = useQuery({
    queryKey: ['mood-checkins', 'today'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ checkedIn?: boolean }>('/mood-checkins/today')
      return data
    },
    staleTime: 1000 * 60 * 5,
    enabled: isAuthenticated && !!user?.dailyMoodCheckinsEnabled,
  })

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/mood-checkins/dismiss')
    },
    onSuccess: () => {
      queryClient.setQueryData(['mood-checkins', 'today'], { checkedIn: true })
    },
  })

  const submitMutation = useMutation({
    mutationFn: async (data: { mood: string; feeling: string }) => {
      await apiClient.post('/mood-checkins', data)
    },
    onSuccess: (_data, data) => {
      emitOtixEvent('otix:user:mood_checkin', { mood: data.mood, feeling: data.feeling })
      queryClient.setQueryData(['mood-checkins', 'today'], { checkedIn: true })
      showXPToast(10)
      onMoodRecorded?.()
      setSelectedMood(null)
      setSelectedFeeling(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const isBusy = dismissMutation.isPending || submitMutation.isPending
  const isPromptDue = isAuthenticated && !authLoading && !!user?.dailyMoodCheckinsEnabled && !todayData?.checkedIn

  const handleMoodSelect = (mood: MoodValue) => {
    setSelectedMood(mood)
    setSelectedFeeling(null)
    setError('')
    onMoodRecorded?.()
  }

  const handleFeelingSelect = (feeling: FeelingValue) => {
    setSelectedFeeling(feeling)
    if (selectedMood) {
      submitMutation.mutate({ mood: selectedMood.label, feeling: feeling.label })
    }
  }

  const handleDismiss = () => {
    dismissMutation.mutate()
    setSelectedMood(null)
    setSelectedFeeling(null)
  }

  return {
    selectedMood, selectedFeeling, error, isBusy, isPromptDue,
    handleMoodSelect, handleFeelingSelect, handleDismiss,
  }
}
