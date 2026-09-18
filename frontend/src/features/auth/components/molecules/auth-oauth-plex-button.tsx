import { OAuthButton } from './auth-oauth-button'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import {openExternal} from '@/lib/utils/open-external'
import {apiClient} from '@/lib/api/client'
import {useFeature} from '@/features/_config'
import type {FeatureName} from "@/features/_config/types.ts";

/** Plex OAuth login button, gated by the auth:oauth:plex feature flag. (molecule) */
export function PlexOAuthButton() {
    const enabled = useFeature(PlexOAuthButton.featureName)
    if (!enabled) return null

    async function handlePlexLogin() {
        const {data} = await apiClient.post('/auth/plex/initiate')
        openExternal(data.authUrl)
    }

    return (
        <OAuthButton
            icon={<PlexIcon className="h-5 w-5"/>}
            ariaLabel="Continue with Plex"
            gradient={{from: '#BA5D2E', to: '#E5A00D'}}
            onClick={handlePlexLogin}
        />
    )
}

PlexOAuthButton.featureName = 'auth:oauth:plex' as FeatureName
