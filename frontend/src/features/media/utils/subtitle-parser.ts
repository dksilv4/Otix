/**
 * Client-side subtitle conversion and WebVTT utility.
 */

/**
 * Converts standard SubRip (.srt) subtitle text into valid WebVTT (.vtt) format.
 * - Adds "WEBVTT" header
 * - Converts SRT timestamp comma separators (00:01:23,456) to periods (00:01:23.456)
 * - Removes Byte Order Mark (BOM) if present
 */
export function convertSrtToVtt(srtContent: string): string {
  if (!srtContent) return 'WEBVTT\n\n'

  // Strip BOM if present
  let clean = srtContent.replace(/^\uFEFF/, '').trim()

  // If already WebVTT, return directly
  if (clean.startsWith('WEBVTT')) {
    return clean
  }

  // Normalize line endings to \n
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Convert timestamps: 00:01:23,456 --> 00:01:25,789
  const timestampRegex = /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g
  const converted = clean.replace(timestampRegex, '$1.$2 --> $3.$4')

  return `WEBVTT\n\n${converted}`
}

/**
 * Creates an in-memory object URL for WebVTT subtitle text
 * that can be assigned directly to an HTML5 <track src={url}>.
 */
export function createVttBlobUrl(vttContent: string): string {
  const blob = new Blob([vttContent], { type: 'text/vtt' })
  return URL.createObjectURL(blob)
}
