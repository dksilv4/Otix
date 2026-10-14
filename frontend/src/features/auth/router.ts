import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { safeLazy, safePrefetchChunk } from '@/lib/utils/chunk-reload'

const AuthPage = safeLazy(() => import('@auth/pages/auth-page').then(m => ({ default: m.AuthPage })))
const RegisterPage = safeLazy(() => import('@auth/pages/auth-register-page').then(m => ({ default: m.RegisterPage })))
const CallbackPage = safeLazy(() => import('@auth/pages/auth-callback-page').then(m => ({ default: m.CallbackPage })))
const TwoFactorPage = safeLazy(() => import('@auth/pages/auth-two-factor-page').then(m => ({ default: m.TwoFactorPage })))
const VerifyEmailPage = safeLazy(() => import('@auth/pages/auth-verify-email-page').then(m => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = safeLazy(() => import('@auth/pages/auth-forgot-password-page').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = safeLazy(() => import('@auth/pages/auth-reset-password-page').then(m => ({ default: m.ResetPasswordPage })))

function preload(load: () => Promise<unknown>) {
  return () => {
    safePrefetchChunk(load)
  }
}

export function createAuthRoutes(rootRoute: AnyRoute) {
  const authLoginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/login',
    component: AuthPage,
    loader: preload(() => import('@auth/pages/auth-page')),
    validateSearch: (search: Record<string, unknown>) => ({
      redirect: (search.redirect as string) || '/',
    } as { redirect?: string }),
  })

  const authRegisterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/register',
    component: RegisterPage,
    loader: preload(() => import('@auth/pages/auth-register-page')),
  })

  const authTwoFactorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/two-factor',
    component: TwoFactorPage,
    loader: preload(() => import('@auth/pages/auth-two-factor-page')),
    validateSearch: (search: Record<string, unknown>) => ({
      redirect: (search.redirect as string) || '/',
    } as { redirect?: string }),
  })

  const verifyEmailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/verify-email',
    component: VerifyEmailPage,
    loader: preload(() => import('@auth/pages/auth-verify-email-page')),
  })

  const forgotPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/forgot-password',
    component: ForgotPasswordPage,
    loader: preload(() => import('@auth/pages/auth-forgot-password-page')),
  })

  const resetPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/reset-password',
    component: ResetPasswordPage,
    loader: preload(() => import('@auth/pages/auth-reset-password-page')),
  })

  const callbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/callback/$service',
    component: CallbackPage,
    loader: preload(() => import('@auth/pages/auth-callback-page')),
  })

  return [
    authLoginRoute,
    authRegisterRoute,
    authTwoFactorRoute,
    verifyEmailRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
    callbackRoute,
  ]
}
