import {useCallback} from 'react'
import {Helmet} from 'react-helmet-async'
import {useNavigate} from '@tanstack/react-router'
import {AuthBackground} from '@auth/components/atoms/auth-background'
import {AuthCard} from '@auth/components/molecules/auth-card'
import {AuthHeader} from '@auth/components/molecules/auth-header'
import {LoginForm} from '@auth/components/organisms/auth-login-form'
import {OAuthContainer} from '@auth/components/organisms/auth-oauth-container'
import {GoogleOAuthButton} from '@auth/components/molecules/auth-oauth-google-button'
import {PlexOAuthButton} from '@auth/components/molecules/auth-oauth-plex-button'
import {TmdbOAuthButton} from '@auth/components/molecules/auth-oauth-tmdb-button'
import {SteamOAuthButton} from '@auth/components/molecules/auth-oauth-steam-button'
import {Logo} from '@ui/atoms/logo'
import {AuthBackButton} from '@auth/components/molecules/auth-back-button'

export function AuthPage() {
    const navigate = useNavigate()
    const redirect = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('redirect') || '/'
        : '/'

    const handleSuccess = useCallback(() => navigate({to: redirect}), [navigate, redirect])

    return (
        <div id="auth-page" className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4 py-8">
            <Helmet>
                <title>Sign In - Otix</title>
                <meta name="description" content="Sign in to Otix to continue your journey."/>
                <meta name="robots" content="noindex"/>
            </Helmet>

            <AuthBackground/>

            <AuthBackButton />

            <AuthCard>
                <div className="mb-6 flex justify-center">
                    <Logo className="h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]"/>
                </div>

                <AuthHeader title="Welcome back" subtitle="Sign in to continue your journey"/>

                <LoginForm onSuccess={handleSuccess}/>

                <p className="mt-8 text-xs text-muted-foreground">
                    Don't have an account?{' '}
                    <a href="/auth/register"
                        onClick={(e) => {
                            e.preventDefault();
                            navigate({to: '/auth/register'})
                        }}
                        className="text-primary transition-colors hover:text-primary/80"
                    >
                        Create one
                    </a>
                </p>

                <p className="mt-4 text-[11px] text-muted-foreground/80 text-center leading-normal">
                    By signing in, you agree to Otix&apos;s{' '}
                    <a
                        href="/terms"
                        onClick={(e) => {
                            e.preventDefault();
                            navigate({to: '/terms'})
                        }}
                        className="text-white/80 underline underline-offset-2 hover:text-white"
                    >
                        Terms of Service
                    </a>
                    .
                </p>
            </AuthCard>

            <OAuthContainer id="auth-oauth">
                <GoogleOAuthButton/>
                <PlexOAuthButton/>
                <TmdbOAuthButton/>
                <SteamOAuthButton/>
            </OAuthContainer>
        </div>
    )
}
