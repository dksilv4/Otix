import { describe, it, expect } from 'vitest'
import { formatScanError } from '../scan-errors'

describe('formatScanError', () => {
  it('formats 502 network unreachable error with detail', () => {
    const err = {
      response: {
        status: 502,
        data: {
          detail: 'Failed to contact game server node: Network is unreachable. Ensure the node is online.',
        },
      },
    }
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe(
      'Failed to contact game server node: Network is unreachable. Ensure the node is online.',
    )
  })

  it('formats 502 network unreachable without detail', () => {
    const err = {
      response: {
        status: 502,
        data: {},
      },
    }
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe(
      'Game server node is unreachable or offline. Check network connection.',
    )
  })

  it('formats connection refused error message', () => {
    const err = new Error('Connection refused')
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Connection refused')
  })

  it('formats timeout error', () => {
    const err = new Error('Request timed out')
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Request timed out')
  })

  it('formats generic non-network error', () => {
    const err = new Error('Database disk full')
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(false)
    expect(result.message).toBe('Database disk full')
  })

  it('handles undefined or empty error', () => {
    const result = formatScanError(null)
    expect(result.isUnreachable).toBe(false)
    expect(result.message).toBe('Failed to scan paths.')
  })

  it('strips raw OS errno strings from error message if leaked', () => {
    const err = new Error('[Errno 101] Network is unreachable')
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Network is unreachable')
    expect(result.message).not.toContain('[Errno 101]')
  })

  it('detects Axios ERR_NETWORK code as unreachable', () => {
    const err = {
      code: 'ERR_NETWORK',
      message: 'Network Error',
    }
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Network Error')
  })

  it('detects structured node_unreachable code from server response', () => {
    const err = {
      response: {
        status: 502,
        data: {
          code: 'node_unreachable',
          detail: 'Failed to contact game server node: Network is unreachable.',
        },
      },
    }
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Failed to contact game server node: Network is unreachable.')
  })

  it('converts generic Axios status code 502 error to user-friendly offline message when data is empty', () => {
    const err = {
      message: 'Request failed with status code 502',
      response: {
        status: 502,
        data: {},
      },
    }
    const result = formatScanError(err)
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe(
      'Game server node is unreachable or offline. Check network connection.',
    )
  })

  it('handles raw string error input and strips [Errno 101]', () => {
    const result = formatScanError('[Errno 101] Network is unreachable')
    expect(result.isUnreachable).toBe(true)
    expect(result.message).toBe('Network is unreachable')
    expect(result.message).not.toContain('[Errno 101]')
  })

  it('replaces HTML response error bodies with user-friendly offline message', () => {
    const errHtmlString = {
      response: {
        status: 502,
        data: '<html><head><title>502 Bad Gateway</title></head><body><h1>Bad Gateway</h1></body></html>',
      },
    }
    const res1 = formatScanError(errHtmlString)
    expect(res1.isUnreachable).toBe(true)
    expect(res1.message).toBe(
      'Game server node is unreachable or offline. Check network connection.',
    )
    expect(res1.message).not.toContain('<html')

    const errHtmlDetail = {
      response: {
        status: 502,
        data: {
          detail: '<!DOCTYPE html><html><body>Upstream gateway error</body></html>',
        },
      },
    }
    const res2 = formatScanError(errHtmlDetail)
    expect(res2.isUnreachable).toBe(true)
    expect(res2.message).toBe(
      'Game server node is unreachable or offline. Check network connection.',
    )
  })

  it('detects backend diagnostic error codes as unreachable', () => {
    const codes = ['network_unreachable', 'connection_refused', 'timeout', 'dns_error', 'ssl_error']
    for (const c of codes) {
      const err = {
        response: {
          status: 500,
          data: {
            error: c,
            detail: `Failed: ${c}`,
          },
        },
      }
      const res = formatScanError(err)
      expect(res.isUnreachable).toBe(true)
    }
  })
})
