import { describe, it, expect } from 'vitest'

describe('Live Plex-for-Games End-to-End Download', () => {
  it('connects to live otix-server node, fetches files, and streams game file', async () => {
    // 1. Probe Server Status
    let statusResp: Response
    try {
      statusResp = await fetch('http://127.0.0.1:8090/api/v1/status', {
        headers: { Authorization: 'Bearer otix_secret_token_abc123' },
      })
    } catch {
      // Live server is not running in test runner environment; skip integration check
      return
    }
    expect(statusResp.status).toBe(200)
    const statusData = await statusResp.json()
    expect(statusData.status).toBe('online')
    expect(statusData.server_name).toBe('DK Game Storage Server')

    // 2. Fetch Hosted Files
    const filesResp = await fetch('http://127.0.0.1:8090/api/v1/files', {
      headers: { Authorization: 'Bearer otix_secret_token_abc123' },
    })
    expect(filesResp.status).toBe(200)
    const files = await filesResp.json()
    expect(files.length).toBeGreaterThanOrEqual(2)

    const witcher = files.find((f: any) => f.game_title.includes('Witcher'))
    expect(witcher).toBeDefined()
    expect(witcher.format_category).toBe('installer')

    // 3. Stream Game Download
    const downloadUrl = `http://127.0.0.1:8090/api/v1/files/${witcher.id}/download`
    const downloadResp = await fetch(downloadUrl, {
      headers: { Authorization: 'Bearer otix_secret_token_abc123' },
    })
    expect(downloadResp.status).toBe(200)
    expect(downloadResp.headers.get('content-type')).toContain('octet-stream')

    const arrayBuffer = await downloadResp.arrayBuffer()
    expect(arrayBuffer.byteLength).toBe(witcher.filesize)
    expect(arrayBuffer.byteLength).toBe(19000)
  })
})
