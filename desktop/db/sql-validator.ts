// desktop/db/sql-validator.ts
// Security boundary for plugin SQL access. Extracts the table names a query
// references and rejects statements a plugin should never run (PRAGMA, ATTACH,
// DDL, multi-statement injection). This is deliberately a conservative
// tokenizer, not a full SQL parser: false positives (an extra permission
// prompt) are harmless, while false negatives (a missed table reference) are
// the security risk we are guarding against.

const TABLE_KEYWORDS = new Set(['from', 'join', 'into', 'update', 'table'])

// Clause keywords that terminate a table list after a table keyword — they are
// never table names.
const CLAUSE_BOUNDARIES = new Set([
  'where', 'on', 'set', 'values', 'select', 'group', 'order', 'having',
  'limit', 'returning', 'union', 'intersect', 'except', 'when', 'then',
  'else', 'end', 'and', 'or', 'by', 'collate', 'case',
])

// Words that can appear between a table keyword and the actual table name
// (e.g. CREATE TABLE IF NOT EXISTS, INSERT OR REPLACE INTO).
const NOISE_WORDS = new Set([
  'as', 'if', 'not', 'exists', 'or', 'temporary', 'temp', 'using',
])

const UNSAFE_KEYWORDS = new Set([
  'pragma', 'attach', 'detach', 'drop', 'alter', 'begin', 'commit',
  'rollback', 'savepoint', 'release', 'vacuum', 'reindex', 'create',
])

/**
 * Remove `--` line comments, `/* *​/` block comments, and single-quoted string
 * literals from a query, replacing their content with spaces so tokenization
 * below cannot be confused by them. Double-quoted identifiers are preserved
 * (they are table names in SQLite, not strings).
 */
function stripCommentsAndLiterals(sql: string): string {
  const n = sql.length
  let out = ''
  let i = 0
  while (i < n) {
    const c = sql[i]
    if (c === "'") {
      i++
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { i += 2; continue } // escaped '' inside literal
          i++
          break
        }
        i++
      }
      out += ' '
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++
      out += ' '
    } else if (c === '/' && sql[i + 1] === '*') {
      i += 2
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++
      i += 2
      out += ' '
    } else {
      out += c
      i++
    }
  }
  return out
}

/**
 * Extract the names of every table the query references. Skips string
 * literals and comments, follows FROM/JOIN/INTO/UPDATE/TABLE keywords, handles
 * quoted identifiers, comma-separated table lists, and subqueries (which are
 * scanned recursively because they carry their own FROM clauses).
 */
export function extractTableNames(sql: string): string[] {
  const clean = stripCommentsAndLiterals(sql)
  const n = clean.length
  const tables: string[] = []
  const seen = new Set<string>()
  const add = (name: string) => {
    if (name && !seen.has(name)) {
      seen.add(name)
      tables.push(name)
    }
  }

  let expectingTable = false
  let tableListActive = false // a comma after a collected table continues the list

  let i = 0
  while (i < n) {
    const c = clean[i]

    if (c === '"' || c === '`') {
      const quote = c
      i++
      let id = ''
      while (i < n && clean[i] !== quote) { id += clean[i]; i++ }
      i++
      if (expectingTable) { add(id); expectingTable = false; tableListActive = true }
      continue
    }
    if (c === '[') {
      i++
      let id = ''
      while (i < n && clean[i] !== ']') { id += clean[i]; i++ }
      i++
      if (expectingTable) { add(id); expectingTable = false; tableListActive = true }
      continue
    }

    if (/[A-Za-z0-9_$]/.test(c)) {
      let w = ''
      while (i < n && /[A-Za-z0-9_$]/.test(clean[i])) { w += clean[i]; i++ }
      const lower = w.toLowerCase()
      if (expectingTable) {
        if (TABLE_KEYWORDS.has(lower)) {
          // e.g. FROM JOIN — keep looking
        } else if (NOISE_WORDS.has(lower)) {
          // e.g. IF NOT EXISTS — keep looking
        } else if (CLAUSE_BOUNDARIES.has(lower)) {
          expectingTable = false
          tableListActive = false
        } else {
          // Schema-qualified names (e.g. main.tbl, main."tbl name") — keep
          // only the final segment, which is the actual table. ATTACH is
          // rejected so the only database in play is main. Quoted segments
          // after a dot are consumed whole because they can contain spaces.
          let name = w
          let j = i
          while (clean[j] === '.') {
            j++
            const q = clean[j]
            if (q === '"' || q === '`') {
              j++
              let part = ''
              while (j < n && clean[j] !== q) { part += clean[j]; j++ }
              j++
              name = part
              break
            }
            let part = ''
            while (j < n && /[A-Za-z0-9_$]/.test(clean[j])) { part += clean[j]; j++ }
            if (!part) break
            name = part
          }
          add(name)
          i = j
          expectingTable = false
          tableListActive = true
        }
      } else if (TABLE_KEYWORDS.has(lower)) {
        expectingTable = true
      } else if (tableListActive && c !== ',') {
        // no comma separated tables here — the list ended
        tableListActive = false
      }
      continue
    }

    if (c === ',') {
      if (tableListActive) {
        expectingTable = true
        tableListActive = false
      }
      i++
      continue
    }
    if (c === '(') {
      // FROM (subquery) — not a table name; the subquery's own FROM is scanned
      // independently as we continue through the string.
      expectingTable = false
      tableListActive = false
      i++
      continue
    }

    i++
  }
  return tables
}

/**
 * Whether a statement is safe for a plugin to run. Rejects DDL and
 * connection/transaction control (PRAGMA, ATTACH, DETACH, DROP, ALTER,
 * BEGIN/COMMIT, VACUUM, CREATE) and multi-statement injection via `;`.
 */
export function isSafeStatement(sql: string): boolean {
  const clean = stripCommentsAndLiterals(sql)
  if (clean.includes(';')) return false

  const words = clean.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []
  for (const w of words) {
    if (UNSAFE_KEYWORDS.has(w)) return false
  }
  return true
}
