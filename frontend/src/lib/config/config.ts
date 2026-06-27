
/**
 * Unified place for frontend configuration variables and environment flags.
 */

// Environment flags
export const IS_DEV = import.meta.env.DEV
export const IS_PROD = import.meta.env.PROD
export const IS_TEST = import.meta.env.TEST

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:8000/api/v1' : 'https://otix.app/api/v1')

// Local Storage Keys
export const ACCESS_TOKEN_KEY = 'otix-access-token'
