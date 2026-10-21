import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { UserProfile } from '../user-queries'
import type { SectionVisibility } from '../types'
import { getNextSectionVisibility, resolveSectionVisibility } from '../utils/profile-sections'

interface UseProfileSectionVisibilityOptions {
  sectionId: string
  username: string
  currentVisibilityMap?: Record<string, SectionVisibility> | null
}

export const useProfileSectionVisibility = ({
  sectionId,
  username,
  currentVisibilityMap,
}: UseProfileSectionVisibilityOptions) => {
  const queryClient = useQueryClient()
  const visibility = resolveSectionVisibility(sectionId, currentVisibilityMap)

  const mutation = useMutation({
    mutationFn: async (nextVisibility: SectionVisibility) => {
      const updatedMap: Record<string, string> = {
        ...(currentVisibilityMap || {}),
        [sectionId]: nextVisibility,
      }
      const { data } = await apiClient.patch('/auth/me', {
        sectionVisibility: updatedMap,
      })
      return data
    },
    onMutate: async (nextVisibility: SectionVisibility) => {
      const queryKey = ['user', username]
      await queryClient.cancelQueries({ queryKey })
      const previousProfile = queryClient.getQueryData<UserProfile>(queryKey)

      if (previousProfile) {
        queryClient.setQueryData<UserProfile>(queryKey, {
          ...previousProfile,
          sectionVisibility: {
            ...(previousProfile.sectionVisibility || {}),
            [sectionId]: nextVisibility,
          },
        })
      }

      return { previousProfile }
    },
    onError: (_err, _nextVisibility, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(['user', username], context.previousProfile)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  const setVisibility = async (nextVisibility: SectionVisibility) => {
    await mutation.mutateAsync(nextVisibility)
  }

  const toggleVisibility = async () => {
    const next: SectionVisibility = getNextSectionVisibility(visibility)
    await mutation.mutateAsync(next)
  }

  return {
    visibility,
    setVisibility,
    toggleVisibility,
    isUpdating: mutation.isPending,
  }
}
