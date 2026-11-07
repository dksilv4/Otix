import { createContext, useState, type ReactNode } from 'react'
import type { PageMeta } from './types'

export type { PageMeta }

export const PageMetaContext = createContext<PageMeta>({
  navLogo: null,
  setNavLogo: () => {},
})

export const PageMetaProvider = ({ children }: { children: ReactNode }) => {
  const [navLogo, setNavLogo] = useState<string | null>(null)

  return (
    <PageMetaContext.Provider value={{ navLogo, setNavLogo }}>
      {children}
    </PageMetaContext.Provider>
  )
};

export { usePageMeta } from './hooks/use-page-meta'
