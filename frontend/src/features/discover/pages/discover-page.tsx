import { Helmet } from 'react-helmet-async'
import { Outlet } from '@tanstack/react-router'
import { DiscoverFeed } from '@discover/components/organisms/discover-feed'

export function DiscoverPage() {
  return (
    <>
      <Helmet>
        <title>Discover - Otix</title>
        <meta
          name="description"
          content="Discover movies, shows, games, and music on Otix."
        />
      </Helmet>
      <div className="relative">
        <DiscoverFeed />
      </div>
      <Outlet />
    </>
  )
}
