/**
 * Diagnostic and error presentation utilities for library scan triggers.
 */

export interface FormattedScanError {
  isUnreachable: boolean
  title: string
  message: string
}

const isRecord = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null

const isHtmlString = (val: string): boolean =>
  /<(!doctype|html|head|body)[\s>]/i.test(val)

export const formatScanError = (err: unknown): FormattedScanError => {
  const errObj = isRecord(err) ? err : null
  const stringErr = typeof err === 'string' ? err : ''
  const response = isRecord(errObj?.response) ? errObj.response : null
  const status = typeof response?.status === 'number' ? response.status : undefined
  const responseData = response?.data
  const data = isRecord(responseData) ? responseData : null

  let detail = ''
  if (data) {
    if (typeof data.detail === 'string') {
      detail = data.detail
    } else if (typeof data.error === 'string') {
      detail = data.error
    }
  } else if (typeof responseData === 'string' && !isHtmlString(responseData)) {
    detail = responseData
  }

  const errMessage = typeof errObj?.message === 'string' ? errObj.message : stringErr
  const code = typeof errObj?.code === 'string' ? errObj.code : ''
  const errorCode = typeof data?.code === 'string' ? data.code : typeof data?.error === 'string' ? data.error : ''
  const combined = `${detail} ${errMessage} ${code} ${errorCode}`.toLowerCase()

  const isUnreachable =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === 'ERR_NETWORK' ||
    code === 'ECONNABORTED' ||
    errorCode === 'node_unreachable' ||
    errorCode === 'network_unreachable' ||
    errorCode === 'connection_refused' ||
    errorCode === 'timeout' ||
    errorCode === 'dns_error' ||
    errorCode === 'ssl_error' ||
    combined.includes('unreachable') ||
    combined.includes('offline') ||
    combined.includes('failed to contact') ||
    combined.includes('connection refused') ||
    combined.includes('network is unreachable') ||
    combined.includes('network error') ||
    combined.includes('timed out') ||
    combined.includes('timeout')

  let message = detail || errMessage
  if (message) {
    message = message.replace(/\[Errno\s+\d+\]\s*/gi, '').trim()
    if (/^Request failed with status code 50[234]$/i.test(message) || isHtmlString(message)) {
      message = 'Game server node is unreachable or offline. Check network connection.'
    }
  } else {
    message = isUnreachable
      ? 'Game server node is unreachable or offline. Check network connection.'
      : 'Failed to scan paths.'
  }

  return {
    isUnreachable,
    title: 'Scan Failed',
    message,
  }
}
