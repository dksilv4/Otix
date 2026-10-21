import { sanitizeImageUrl } from '@/lib/utils/image-url'

export function calculatePasswordStrength(password: string): number {
  let score = 0
  if (password.length >= 8) score += 25
  if (password.length >= 12) score += 15
  if (password.length >= 16) score += 10
  if (/[a-z]/.test(password)) score += 10
  if (/[A-Z]/.test(password)) score += 15
  if (/[0-9]/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 10
  return Math.min(score, 100)
}

export type StrengthTier = 'weak' | 'fair' | 'good' | 'strong'

export function getStrengthTier(score: number): StrengthTier {
  if (score < 30) return 'weak'
  if (score < 60) return 'fair'
  if (score < 80) return 'good'
  return 'strong'
}

export function getTierLabel(tier: StrengthTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function extractErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string; message?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
    if (resp?.data?.message) return resp.data.message
  }
  if (err instanceof Error) return err.message
  return fallback
}

export function validateLoginFields(fields: { identity: string; password: string }): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!fields.identity.trim()) errors.identity = 'Username or email is required'
  if (!fields.password) errors.password = 'Password is required'
  else if (fields.password.length < 8) errors.password = 'Password must be at least 8 characters'
  return errors
}

export function validateRegisterFields(fields: {
  email: string
  username: string
  password: string
  confirmPassword: string
  dateOfBirth: string
}): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!fields.email.trim()) errors.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) errors.email = 'Please enter a valid email address'
  if (!fields.username.trim()) errors.username = 'Username is required'
  else if (fields.username.trim().length < 3) errors.username = 'Username must be at least 3 characters'
  if (!fields.password) errors.password = 'Password is required'
  else if (fields.password.length < 8) errors.password = 'Password must be at least 8 characters'
  else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(fields.password))
    errors.password = 'Password must contain uppercase, lowercase, and a number'
  if (!fields.confirmPassword) errors.confirmPassword = 'Please confirm your password'
  else if (fields.password !== fields.confirmPassword) errors.confirmPassword = 'Passwords do not match'
  if (!fields.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
  else {
    const dob = new Date(fields.dateOfBirth)
    if (isNaN(dob.getTime())) errors.dateOfBirth = 'Please enter a valid date'
    else {
      const today = new Date()
      let age = today.getFullYear() - dob.getFullYear()
      const m = today.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
      if (age < 13) errors.dateOfBirth = 'You must be at least 13 years old'
      else if (age > 120) errors.dateOfBirth = 'Please enter a valid date'
    }
  }
  return errors
}

export function validateRegistrationStep(step: number, data: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  if (step === 1) {
    if (!data.username?.trim()) errors.username = 'Username is required'
    else if (data.username.length < 3) errors.username = 'Username must be at least 3 characters'
    else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) errors.username = 'Only letters, numbers, hyphens, and underscores'
  } else if (step === 2) {
    if (!data.email?.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Please enter a valid email address'
  } else if (step === 3) {
    if (!data.password) errors.password = 'Password is required'
    else if (data.password.length < 8) errors.password = 'Password must be at least 8 characters'
    else if (calculatePasswordStrength(data.password) < 40) errors.password = 'Please choose a stronger password'
    if (data.confirmPassword !== data.password) errors.confirmPassword = 'Passwords do not match'
  } else if (step === 4) {
    if (!data.dateOfBirth) errors.dateOfBirth = 'Date of birth is required'
    else {
      const dob = new Date(data.dateOfBirth)
      if (isNaN(dob.getTime())) errors.dateOfBirth = 'Please enter a valid date'
      else {
        const today = new Date()
        let age = today.getFullYear() - dob.getFullYear()
        const m = today.getMonth() - dob.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
        if (age < 13) errors.dateOfBirth = 'You must be at least 13 years old'
        else if (age > 120) errors.dateOfBirth = 'Please enter a valid date'
      }
    }
  }
  return errors
}

export const CACHED_USER_KEY = 'otix_cached_user'

export const getCachedUser = (): import('@auth/types').User | null => {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as import('@auth/types').User
    if (parsed) {
      if (parsed.avatarUrl) parsed.avatarUrl = sanitizeImageUrl(parsed.avatarUrl) || null
      if (parsed.backgroundUrl) parsed.backgroundUrl = sanitizeImageUrl(parsed.backgroundUrl) || null
    }
    return parsed
  } catch {
    return null
  }
}

export const setCachedUser = (user: import('@auth/types').User | null): void => {
  try {
    if (user) {
      const sanitized = { ...user }
      if (sanitized.avatarUrl) sanitized.avatarUrl = sanitizeImageUrl(sanitized.avatarUrl) || null
      if (sanitized.backgroundUrl) sanitized.backgroundUrl = sanitizeImageUrl(sanitized.backgroundUrl) || null
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(sanitized))
    } else {
      localStorage.removeItem(CACHED_USER_KEY)
    }
  } catch {
    // Storage full or unavailable
  }
}

export const fetchAuthenticatedUser = async (): Promise<import('@auth/types').User | null> => {
  const { apiClient } = await import('@/lib/api/client')
  const { ACCESS_TOKEN_KEY } = await import('@/lib/config')
  try {
    const [meRes, intRes] = await Promise.all([
      apiClient.get('/auth/me'),
      apiClient.get('/auth/me/integrations').catch(() => null),
    ])
    const user = meRes.data as import('@auth/types').User
    if (intRes?.data) Object.assign(user, intRes.data)
    setCachedUser(user)
    return user
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status === 401 || status === 403) {
      setCachedUser(null)
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      window.desktopAPI?.plugin?.setAuthToken(null)
    }
    return null
  }
}
