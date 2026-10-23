import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { UserProfile } from '../user-queries'
import { DEFAULT_SECTION_IDS } from '../utils/profile-sections'

interface UseProfileSectionsOptions {
  username: string
  currentSections: string[]
}

export const useProfileSections = ({
  username,
  currentSections,
}: UseProfileSectionsOptions) => {
  const queryClient = useQueryClient()

  const removeMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const baseList = currentSections.length > 0 ? currentSections : DEFAULT_SECTION_IDS
      const updated = baseList.filter((id) => id !== sectionId)
      const { data } = await apiClient.patch('/auth/me', { profileSections: updated })
      return { data, updated }
    },
    onMutate: async (sectionId: string) => {
      const queryKey = ['user', username]
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<UserProfile>(queryKey)
      if (prev) {
        const baseList =
          Array.isArray(prev.profileSections) && prev.profileSections.length > 0
            ? prev.profileSections
            : currentSections.length > 0
              ? currentSections
              : DEFAULT_SECTION_IDS
        queryClient.setQueryData<UserProfile>(queryKey, {
          ...prev,
          profileSections: baseList.filter((id) => id !== sectionId),
        })
      }
      return { prev }
    },
    onError: (_err, _sectionId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['user', username], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  const addMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const baseList = currentSections.length > 0 ? currentSections : DEFAULT_SECTION_IDS
      const updated = baseList.includes(sectionId) ? baseList : [...baseList, sectionId]
      const { data } = await apiClient.patch('/auth/me', { profileSections: updated })
      return { data, updated }
    },
    onMutate: async (sectionId: string) => {
      const queryKey = ['user', username]
      await queryClient.cancelQueries({ queryKey })
      const prev = queryClient.getQueryData<UserProfile>(queryKey)
      if (prev) {
        const baseList =
          Array.isArray(prev.profileSections) && prev.profileSections.length > 0
            ? prev.profileSections
            : currentSections.length > 0
              ? currentSections
              : DEFAULT_SECTION_IDS
        const updated = baseList.includes(sectionId) ? baseList : [...baseList, sectionId]
        queryClient.setQueryData<UserProfile>(queryKey, {
          ...prev,
          profileSections: updated,
        })
      }
      return { prev }
    },
    onError: (_err, _sectionId, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['user', username], context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  const removeSection = async (sectionId: string) => {
    await removeMutation.mutateAsync(sectionId)
  }

  const addSection = async (sectionId: string) => {
    await addMutation.mutateAsync(sectionId)
  }

  return {
    removeSection,
    addSection,
    isRemoving: removeMutation.isPending,
    removingSectionId: removeMutation.variables,
    isAdding: addMutation.isPending,
  }
}
