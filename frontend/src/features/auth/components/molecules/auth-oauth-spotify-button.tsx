import {OAuthButton} from '@/features/auth'
import SpotifyIcon from '@/assets/provider-logos/spotify.svg?react'
import {openExternal} from '@/lib/open-external'
import {apiClient} from '@/lib/api-client'
import {useFeature} from '@/features/_config'
import type {FeatureName} from "@/features/_config/types.ts";

export function SpotifyOAuthButton() {
    const enabled = useFeature(SpotifyOAuthButton.featureName)
    if (!enabled) return null

    async function handleSpotifyLogin() {
        const {data} = await apiClient.post('/auth/spotify/initiate')
        openExternal(data.authUrl)
    }

    return (
        <OAuthButton
            icon={<SpotifyIcon className="h-5 w-5"/>}
            ariaLabel="Continue with Spotify"
            gradient={{from: '#1DB954', to: '#191414'}}
            onClick={handleSpotifyLogin}
        />
    )
}

SpotifyOAuthButton.featureName = 'auth:oauth:spotify' as FeatureName
