/**
 * Unified place for frontend configuration variables and environment flags.
 */

// Environment flags
export const IS_DEV = import.meta.env.DEV
export const IS_PROD = import.meta.env.PROD
export const IS_TEST = import.meta.env.TEST

// API Configuration
export const API_BASE_URL = 'https://otix.app/api'

// Re-exports from config submodule
export { ACCESS_TOKEN_KEY } from './config/config'
