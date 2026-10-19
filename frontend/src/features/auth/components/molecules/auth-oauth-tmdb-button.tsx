import { OAuthButton } from './auth-oauth-button'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import { isDesktop } from '@/lib/desktop/api'
import { openExternal } from '@/lib/utils/open-external'
import { apiClient } from '@/lib/api/client'
import { useFeature } from '@/features/_config'
import type { FeatureName } from "@/features/_config/types.ts";

/** TMDb OAuth login button, gated by the auth:oauth:tmdb feature flag. */
export const TmdbOAuthButton = () => {
    const enabled = useFeature(TmdbOAuthButton.featureName)
    if (!enabled) return null

    const handleTmdbLogin = async () => {
        const { data } = await apiClient.post(
            '/auth/tmdb/initiate',
            isDesktop() ? { source: 'desktop' } : undefined,
        )
        openExternal(data.authUrl)
    }

    return (
        <OAuthButton
            icon={<TmdbIcon className="h-5 w-5"/>}
            ariaLabel="Continue with TMDb"
            gradient={{from: '#01b4e4', to: '#90cea1'}}
            onClick={handleTmdbLogin}
        />
    )
};

TmdbOAuthButton.featureName = 'auth:oauth:tmdb' as FeatureName
