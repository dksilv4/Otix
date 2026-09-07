import { describe, it, expect } from 'vitest'
import { IncrementalSseParser } from '../sse'

describe('IncrementalSseParser', () => {
  it('parses a single data frame terminated by a blank line', () => {
    const parser = new IncrementalSseParser()
    const out = parser.push('data: {"a":1}\n\n')
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('{"a":1}')
  })

  it('tolerates chunks split at arbitrary byte boundaries', () => {
    const raw = 'data: {"task_id":"1","provider":"tmdb"}\n\n' + 'data: {"task_id":"2"}\n\n'
    const parser = new IncrementalSseParser()
    const all: string[] = []
    for (let i = 0; i < raw.length; i += 7) {
      for (const m of parser.push(raw.slice(i, i + 7))) {
        if (m.data) all.push(m.data)
      }
    }
    expect(all).toEqual(['{"task_id":"1","provider":"tmdb"}', '{"task_id":"2"}'])
  })

  it('drops comment/keepalive frames and CRLF blank separators', () => {
    const parser = new IncrementalSseParser()
    const out = parser.push(':keepalive\r\n\r\ndata: {"x":1}\r\n\r\n')
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('{"x":1}')
  })

  it('joins multi-line data fields', () => {
    const parser = new IncrementalSseParser()
    const out = parser.push('data: line one\ndata: line two\n\n')
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('line one\nline two')
  })

  it('captures the event name when present but leaves it off data-only frames', () => {
    const parser = new IncrementalSseParser()
    const [evt] = parser.push('event: fetch_request\ndata: {"task_id":"9"}\n\n')
    expect(evt.event).toBe('fetch_request')
    expect(evt.data).toBe('{"task_id":"9"}')
    const plain = new IncrementalSseParser()
    const [msg] = plain.push('data: {"task_id":"9"}\n\n')
    expect(msg.event).toBeUndefined()
    expect(msg.data).toBe('{"task_id":"9"}')
  })

  it('buffers a partial frame until its terminator arrives', () => {
    const parser = new IncrementalSseParser()
    expect(parser.push('data: {"task_id":"5"')).toHaveLength(0)
    const out = parser.push(',"provider":"igdb"}\n\n')
    expect(out).toHaveLength(1)
    expect(out[0].data).toBe('{"task_id":"5","provider":"igdb"}')
  })

  it('strips the single leading space from field values per the SSE spec', () => {
    const parser = new IncrementalSseParser()
    const out = parser.push('data: {"a":1}\n\n')
    expect(out[0].data).toBe('{"a":1}')
  })
})
