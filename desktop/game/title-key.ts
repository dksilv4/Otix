// Cross-source title comparison keys.
//
// Ported from the backend (otix/services/game_matcher.py) so the launcher can
// self-match offline with the same matching semantics as Otix: trademark
// symbols, edition suffixes, roman-vs-arabic numerals, "40K"-style
// abbreviations, and hyphen-vs-colon subtitles all collapse to one key.

// ── Simple title normalization (unicode-aware) ─────────────────────────

const TRADEMARK_RE = /[™®©]/g;
// Unicode non-spacing marks == Python's unicodedata.category(x) == "Mn"
const COMBINING_MARK_RE = /\p{Mn}/gu;
// Punctuation stripped so "Batman: Arkham" matches "Batman Arkham"
const PUNCT_RE = /[,.;!?()[\]{}]/g;
const WS_RE = /\s+/g;

export function normalizeTitle(raw: string): string {
  // Strip ™®© BEFORE NFKD (NFKD decomposes ™ → TM)
  let clean = raw.replace(TRADEMARK_RE, '');
  // NFKD: decompose accented chars (é → e + combining acute)
  clean = clean.normalize('NFKD');
  // Strip combining diacritical marks (Unicode category Mn)
  clean = clean.replace(COMBINING_MARK_RE, '');
  // Remove punctuation (colons/hyphens kept — game titles use them)
  clean = clean.replace(PUNCT_RE, '');
  // Collapse whitespace
  clean = clean.replace(WS_RE, ' ').trim();
  return clean;
}

// ── Edition markers ────────────────────────────────────────────────────

const EDITION_PHRASE =
  '(?:(?:Game of the Year|GOTY|Complete|Enhanced|Deluxe|Definitive|Ultimate|' +
  "Collector'?s|Anniversary|Special|Standard|Gold|Celebration|Day One|" +
  'Digital Deluxe|Remastered)(?:\\s+Edition)(?:\\s+Pack)?)';
const EDITION_MARKERS_RE = new RegExp(
  '\\s*(?:[-–—:]?\\s*)?(?:The\\s+)?' + EDITION_PHRASE + '\\s*$',
  'i',
);
const RELEASE_MARKERS_RE =
  /\s*(?:[-–—:]?\s*)?(?:The Final Cut|Legacy Mode|Re-Elected|Afterlife|Starter Access)\s*$/i;

export function stripEditionMarkers(raw: string): string {
  let t = raw.replace(EDITION_MARKERS_RE, '');
  t = t.replace(RELEASE_MARKERS_RE, '');
  return t.trim();
}

// ── Numeral canonicalization ───────────────────────────────────────────

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7,
  viii: 8, ix: 9, x: 10, xi: 11, xii: 12, xiii: 13, xiv: 14,
  xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
};

export function canonicalNumeralToken(token: string): string | null {
  const low = token.toLowerCase().replace(/,/g, '');
  if (!low) return null;
  if (low.endsWith('k') && /^\d+$/.test(low.slice(0, -1))) {
    return 'N' + String(parseInt(low.slice(0, -1), 10) * 1000);
  }
  if (/^\d+$/.test(low)) return 'N' + String(parseInt(low, 10));
  if (low in ROMAN_NUMERALS) return 'N' + String(ROMAN_NUMERALS[low]);
  return null;
}

const NUM_RANGE_RE = /^(.*)\s*[-–—]\s*(.*)$/;

/** Canonicalize a numeral, numeral-list, or numeral-range token. */
export function canonicalNumeralSeq(token: string): string | null {
  const low = token.toLowerCase().trim();
  if (!low) return null;

  const parts = low.split(/[•·*]/).filter((p) => p.length > 0);
  const out: string[] = [];
  for (const part of parts) {
    const m = NUM_RANGE_RE.exec(part);
    if (m) {
      const a = m[1].trim();
      const b = m[2].trim();
      const av = canonicalNumeralToken(a);
      const bv = canonicalNumeralToken(b);
      if (av !== null && bv !== null) {
        const start = parseInt(av.slice(1), 10);
        const end = parseInt(bv.slice(1), 10);
        const step = end >= start ? 1 : -1;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          out.push(`N${i}`);
        }
        continue;
      }
    }
    const cv = canonicalNumeralToken(part);
    if (cv !== null) {
      out.push(cv);
    } else {
      return null;
    }
  }
  return out.length > 0 ? out.join(' ') : null;
}

/** Replace numeral tokens so arabic, roman, range, and K-abbreviation forms collide. */
export function canonicalNumerals(raw: string): string {
  const out: string[] = [];
  for (const word of raw.split(/\s+/)) {
    const stripped = word.replace(/^[:;,.!?(){}[\]'"]+|[:;,.!?(){}[\]'"]+$/g, '');
    const marker = canonicalNumeralSeq(stripped);
    out.push(marker !== null ? marker : word);
  }
  return out.join(' ');
}

// ── Comparison key ─────────────────────────────────────────────────────

const STAR_CLAUSE_RE = /\s+(?:Starring|Featuring)\s+.*$/i;
const BULLET_RE = /[•·*]/g;
const SEP_HYPHEN_RE = /\s*[-–—]\s*/g;

/**
 * Aggressive cross-source title key for comparing titles.
 *
 * Extends normalizeTitle with edition-marker stripping, numeral
 * canonicalization, and hyphen/colon subtitle collapsing.
 */
export function comparisonKey(raw: string): string {
  let t = stripEditionMarkers(raw);
  // Descriptive subtitle clauses stores omit ("Tomb Raider I-III Remastered
  // Starring Lara Croft") — drop so both sides compare on the base title.
  t = t.replace(STAR_CLAUSE_RE, '');
  t = canonicalNumerals(t);
  t = normalizeTitle(t);
  // Bullet/star separators ("I•II•III") delimit words where other stores use
  // hyphens/commas; collapse them the same way as separator hyphens below.
  t = t.replace(BULLET_RE, ' ');
  // Separator hyphens ("Brothers - A Tale") delimit subtitle words where
  // other stores use ":". Collapsing them is symmetric on both sides.
  t = t.replace(SEP_HYPHEN_RE, ' ');
  // Colons delimit subtitles across stores; strip for key equality.
  t = t.replace(/:/g, '');
  return t.replace(WS_RE, ' ').trim().toLowerCase();
}
