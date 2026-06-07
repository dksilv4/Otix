/**
 * Parses percentage and duration from a string like "45% (10 min)" or "80% | 5m"
 * @param text - The status message from the installer.
 * @returns { p: number, m: number | null } where p is 0-100 and m is minutes.
 */
export function parseInstallProgress(text: string) {
  const pct = parseInt(text.match(/(\d+)%/)?.[1]) || 0;
  const minsMatch = text.match(/(\d+)\s*(min|m)/);
  const mins = minsMatch ? parseInt(minsMatch[1]) : null;
  return { p: pct, m: mins };
}
