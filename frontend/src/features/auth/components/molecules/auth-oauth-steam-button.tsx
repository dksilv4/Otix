import {OAuthButton} from '@/features/auth'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import {isDesktop} from '@/lib/desktop/api'
import {openExternal} from '@/lib/utils/open-external'
import {apiClient} from '@/lib/api/client'
import {useFeature} from '@/features/_config'
import type {FeatureName} from "@/features/_config/types.ts";

/** Steam OAuth login button, gated by the auth:oauth:steam feature flag. */
export function SteamOAuthButton() {
    const enabled = useFeature(SteamOAuthButton.featureName)
    if (!enabled) return null

    async function handleSteamLogin() {
        const {data} = await apiClient.post(
            '/auth/steam/initiate',
            isDesktop() ? {source: 'desktop'} : undefined,
        )
        openExternal(data.authUrl)
    }

    return (

        <OAuthButton
            icon={<SteamIcon className="h-5 w-5"/>}
            ariaLabel="Continue with Steam"
            gradient={{from: '#1b2838', to: '#1d3f5f'}}
            onClick={handleSteamLogin}
        />
    )
}

SteamOAuthButton.featureName = 'auth:oauth:steam' as FeatureName

