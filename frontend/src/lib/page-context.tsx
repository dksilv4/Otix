// TODO: Review this file
import { createContext, useContext, useState, type ReactNode } from 'react'

interface PageMeta {
  navLogo: string | null
  setNavLogo: (url: string | null) => void
}

const PageMetaContext = createContext<PageMeta>({
  navLogo: null,
  setNavLogo: () => {},
})

export function PageMetaProvider({ children }: { children: ReactNode }) {
  const [navLogo, setNavLogo] = useState<string | null>(null)

  return (
    <PageMetaContext.Provider value={{ navLogo, setNavLogo }}>
      {children}
    </PageMetaContext.Provider>
  )
}

export function usePageMeta() {
  return useContext(PageMetaContext)
}
