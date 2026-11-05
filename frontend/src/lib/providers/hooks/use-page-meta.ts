import { useContext } from 'react'
import { PageMetaContext } from '../page-context'

export const usePageMeta = () => {
  return useContext(PageMetaContext)
}
