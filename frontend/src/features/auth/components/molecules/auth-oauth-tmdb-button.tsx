import {OAuthButton} from '@/features/auth'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import {openExternal} from '@/lib/open-external'
import {apiClient} from '@/lib/api-client'
import {useFeature} from '@/features/_config'
import type {FeatureName} from "@/features/_config/types.ts";

export function TmdbOAuthButton() {
    const enabled = useFeature(TmdbOAuthButton.featureName)
    if (!enabled) return null

    async function handleTmdbLogin() {
        const {data} = await apiClient.post('/auth/tmdb/initiate')
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
}

TmdbOAuthButton.featureName = 'auth:oauth:tmdb' as FeatureName
