/**
 * Unified error message extraction utility.
 * Safely extracts human-readable error messages from Error instances,
 * Axios/DRF response objects, and string error values.
 */

export const extractErrorMessage = (
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string => {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (typeof err === 'object') {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail && typeof resp.data.detail === 'string') {
      return resp.data.detail
    }
    if (err instanceof Error && err.message) {
      return err.message
    }
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string') {
      return msg
    }
  }
  return fallback
}

export const getErrorMessage = extractErrorMessage
export const extractAccountErrorMessage = extractErrorMessage
export const extractIntegrationMessage = extractErrorMessage
export const extractModalMessage = extractErrorMessage
