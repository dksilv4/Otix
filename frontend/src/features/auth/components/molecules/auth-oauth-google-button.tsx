import { OAuthButton } from './auth-oauth-button'
import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import {openExternal} from '@/lib/utils/open-external'
import {apiClient} from '@/lib/api/client'
import {useFeature} from '@/features/_config'
import type {FeatureName} from "@/features/_config/types.ts";

/** Google OAuth login button, gated by the auth:oauth:google feature flag. (molecule) */
export const GoogleOAuthButton = () => {
    const enabled = useFeature(GoogleOAuthButton.featureName)
    if (!enabled) return null

    const handleGoogleLogin = async () => {
        const {data} = await apiClient.post('/auth/google/initiate')
        openExternal(data.authUrl)
    }

    return (
        <OAuthButton
            icon={<GoogleIcon className="h-5 w-5"/>}
            ariaLabel="Continue with Google"
            gradient={{from: '#4285F4', to: '#34A853'}}
            onClick={handleGoogleLogin}
        />
    )
};

GoogleOAuthButton.featureName = 'auth:oauth:google' as FeatureName
