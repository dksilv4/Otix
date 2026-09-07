// desktop/fetch/sse.ts
// Incremental parser for text/event-stream payloads. The backend fetch stream
// emits frames as a single `data: <json>` line followed by a blank line, with
// `:keepalive` comment frames between events (core/sse.py format_sse). This
// parser tolerates chunks arriving at arbitrary boundaries and returns whole
// messages; comment-only frames (keepalives) are dropped.

export interface SseMessage {
  event?: string
  id?: string
  data?: string
}

/** Collects SSE field lines across an unbounded stream of string chunks. */
export class IncrementalSseParser {
  private buffer = ''

  /** Feed a chunk; returns every message completed by it. */
  push(chunk: string): SseMessage[] {
    this.buffer += chunk
    const messages: SseMessage[] = []
    for (;;) {
      const sep = this.findTerminator()
      if (sep === -1) break
      const raw = this.buffer.slice(0, sep.index)
      this.buffer = this.buffer.slice(sep.end)
      const message = this.parseBlock(raw)
      if (message) messages.push(message)
    }
    return messages
  }

  /** Earliest CRLF or LF blank-line separator (a frame terminator). */
  private findTerminator(): { index: number; end: number } | -1 {
    const lf = this.buffer.indexOf('\n\n')
    const crlf = this.buffer.indexOf('\r\n\r\n')
    if (lf === -1 && crlf === -1) return -1
    if (crlf === -1) return { index: lf, end: lf + 2 }
    if (lf === -1) return { index: crlf, end: crlf + 4 }
    // Both present: whichever ends first — but a '\n\n' can also appear just
    // after '\r' of a CRLF terminator (…\n\r\n\n), so take the smaller end.
    return lf <= crlf ? { index: lf, end: lf + 2 } : { index: crlf, end: crlf + 4 }
  }

  /** Parse one CR/LF-tolerant block into a message; null for comment-only blocks. */
  private parseBlock(raw: string): SseMessage | null {
    const lines = raw.replace(/\r\n/g, '\n').split('\n')
    const message: SseMessage = {}
    let sawField = false
    let data: string[] = []
    for (const line of lines) {
      if (line === '' || line.startsWith(':')) continue // comment / blank
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      // SSE field value: a single leading space after the colon is stripped.
      const value = colon === -1 ? '' : line[colon + 1] === ' ' ? line.slice(colon + 2) : line.slice(colon + 1)
      sawField = true
      if (field === 'event') message.event = value
      else if (field === 'id') message.id = value
      else if (field === 'data') data.push(value)
    }
    if (!sawField && data.length === 0) return null
    if (data.length > 0) message.data = data.join('\n')
    return message
  }
}
