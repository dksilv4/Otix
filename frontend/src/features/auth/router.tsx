import { lazy } from 'react'
import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

const AuthPage = lazy(() => import('@auth/pages/auth-page').then(m => ({ default: m.AuthPage })))
const RegisterPage = lazy(() => import('@auth/pages/register-page').then(m => ({ default: m.RegisterPage })))
const CallbackPage = lazy(() => import('@auth/pages/auth-callback-page').then(m => ({ default: m.CallbackPage })))
const TwoFactorPage = lazy(() => import('@auth/pages/auth-two-factor-page').then(m => ({ default: m.TwoFactorPage })))
const VerifyEmailPage = lazy(() => import('@auth/pages/auth-verify-email-page').then(m => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import('@auth/pages/auth-forgot-password-page').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@auth/pages/auth-reset-password-page').then(m => ({ default: m.ResetPasswordPage })))

export function createAuthRoutes(rootRoute: AnyRoute) {
  const authLoginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/login',
    component: AuthPage,
    validateSearch: (search: Record<string, unknown>) => ({
      redirect: (search.redirect as string) || '/',
    } as { redirect?: string }),
  })

  const authRegisterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/register',
    component: RegisterPage,
  })

  const authTwoFactorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/two-factor',
    component: TwoFactorPage,
    validateSearch: (search: Record<string, unknown>) => ({
      redirect: (search.redirect as string) || '/',
    } as { redirect?: string }),
  })

  const verifyEmailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/verify-email',
    component: VerifyEmailPage,
  })

  const forgotPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/forgot-password',
    component: ForgotPasswordPage,
  })

  const resetPasswordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/reset-password',
    component: ResetPasswordPage,
  })

  const callbackRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/auth/callback/$service',
    component: CallbackPage,
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
