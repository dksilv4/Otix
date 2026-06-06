// TODO: Review this file
import { useQuery } from '@tanstack/react-query'
import { mediaQueries } from '../media-queries'

export function useMediaDetail(id: string) {
  return useQuery(mediaQueries.detail(id))
}
