import { OAuthButton } from './auth-oauth-button'
import { SteamIcon } from '@/old-features/dk-ui/atoms/steam-icon'
import { isDesktop } from '@/lib/desktop-api'
import { openExternal } from '@/lib/open-external'
import { apiClient } from '@/lib/api-client'

export function SteamOAuthButton() {
  async function handleSteamLogin() {
    const { data } = await apiClient.post(
      '/auth/steam/initiate',
      isDesktop() ? { source: 'desktop' } : undefined,
    )
    openExternal(data.authUrl)
  }

  return (
    <OAuthButton
      icon={<SteamIcon className="h-5 w-5" />}
      ariaLabel="Continue with Steam"
      gradient={{ from: '#1b2838', to: '#1d3f5f' }}
      onClick={handleSteamLogin}
    />
  )
}
