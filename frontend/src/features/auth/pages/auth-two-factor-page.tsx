import { useCallback, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAuth, TwoFactorChallenge } from '@auth'
import { AuthBackground } from '@auth/components/atoms/auth-background'
import { AuthCard } from '@auth/components/molecules/auth-card'
import { AuthHeader } from '@auth/components/molecules/auth-header'
import { Logo } from '@/old-features/ui/atoms/logo'
import { AuthBackButton } from '@auth/components/molecules/auth-back-button'
import { useFeature } from '@/features/_config'

export function TwoFactorPage() {
    const { twoFactorChallenge, cancelTwoFactor } = useAuth()
    const navigate = useNavigate()
    const is2faEnabled = useFeature('auth:two-factor')

    const search = useSearch({ strict: false }) as { redirect?: string }
    const redirect = search.redirect || '/'

    const handleSuccess = useCallback(() => {
        navigate({ to: redirect })
    }, [navigate, redirect])

    const handleTwoFactorCancel = useCallback(() => {
        cancelTwoFactor()
    }, [cancelTwoFactor])

    useEffect(() => {
        if (!is2faEnabled || !twoFactorChallenge) {
            navigate({ to: '/auth/login', search: { redirect } })
        }
    }, [is2faEnabled, twoFactorChallenge, navigate, redirect])

    if (!is2faEnabled || !twoFactorChallenge) {
        return null
    }

    return (
        <div id="auth-two-factor-page" className="relative flex min-h-screen flex-col items-center justify-center gap-4 p-4">
            <Helmet>
                <title>Two-Factor Authentication - Otix</title>
                <meta name="description" content="Verify your identity using two-factor authentication." />
                <meta name="robots" content="noindex" />
            </Helmet>

            <AuthBackground />

            <AuthBackButton />

            <AuthCard>
                <div className="mb-6 flex justify-center">
                    <Logo className="h-20 drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]" />
                </div>

                <AuthHeader
                    title="Security Verification"
                    subtitle="Two-factor authentication is required"
                />

                <TwoFactorChallenge onSuccess={handleSuccess} onCancel={handleTwoFactorCancel} />
            </AuthCard>
        </div>
    )
}
