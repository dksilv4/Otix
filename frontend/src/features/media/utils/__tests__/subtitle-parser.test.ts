import { describe, it, expect } from 'vitest'
import { convertSrtToVtt } from '../subtitle-parser'

describe('subtitle-parser', () => {
  it('converts SRT timestamp commas to WebVTT periods', () => {
    const srt = `1
00:01:23,456 --> 00:01:25,789
Hello world!

2
00:01:26,000 --> 00:01:28,500
This is a test subtitle.`

    const vtt = convertSrtToVtt(srt)
    expect(vtt).toContain('WEBVTT')
    expect(vtt).toContain('00:01:23.456 --> 00:01:25.789')
    expect(vtt).toContain('00:01:26.000 --> 00:01:28.500')
    expect(vtt).toContain('Hello world!')
  })

  it('preserves existing WebVTT content', () => {
    const existingVtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Already VTT`

    expect(convertSrtToVtt(existingVtt)).toBe(existingVtt)
  })

  it('strips UTF-8 BOM if present', () => {
    const bomSrt = '\uFEFF1\n00:00:01,000 --> 00:00:02,000\nBOM test'
    const vtt = convertSrtToVtt(bomSrt)
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000')
  })

  it('handles empty input gracefully', () => {
    expect(convertSrtToVtt('')).toBe('WEBVTT\n\n')
  })
})
