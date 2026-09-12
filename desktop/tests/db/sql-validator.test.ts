import { describe, it, expect } from 'vitest'
import { extractTableNames, isSafeStatement } from '../../db/sql-validator'

describe('extractTableNames', () => {
  const cases: [string, string[]][] = [
    ['SELECT * FROM users', ['users']],
    ['SELECT * FROM main.tbl', ['tbl']],
    ['SELECT a.title FROM games g JOIN reviews r ON g.id = r.game_id', ['games', 'reviews']],
    ['INSERT INTO orders (id) VALUES (1)', ['orders']],
    ['UPDATE accounts SET balance = 0', ['accounts']],
    ['DELETE FROM sessions', ['sessions']],
    ['SELECT * FROM a, b, c', ['a', 'b', 'c']],
    ['SELECT * FROM (SELECT id FROM inner_tbl) x', ['inner_tbl']],
    ['SELECT * FROM (SELECT * FROM (SELECT 1 FROM deep)) d', ['deep']],
    ['SELECT * FROM "my table"', ['my table']],
    ['SELECT * FROM [bracket name]', ['bracket name']],
    ["SELECT * FROM foo WHERE title = 'FROM bar'", ['foo']],
    ["SELECT * FROM foo -- FROM bar\n", ['foo']],
    ['SELECT * FROM foo /* JOIN bar */', ['foo']],
    ['WITH cte AS (SELECT * FROM base) SELECT * FROM cte', ['base', 'cte']],
    ['SELECT * FROM x LEFT JOIN y ON x.id = y.id', ['x', 'y']],
    ['SELECT * FROM tbl_alias AS t', ['tbl_alias']],
    ['SELECT * FROM schema."quoted name"', ['quoted name']],
    ["SELECT * FROM x WHERE a = 'FROM y' AND b = 'JOIN z'", ['x']],
    ['INSERT OR REPLACE INTO settings (k) VALUES (1)', ['settings']],
  ]

  for (const [sql, expected] of cases) {
    it(`extracts ${JSON.stringify(expected)} from ${JSON.stringify(sql)}`, () => {
      expect(extractTableNames(sql)).toEqual(expected)
    })
  }

  it("handles '' escaped quotes inside string literals", () => {
    expect(extractTableNames("SELECT * FROM users WHERE name = 'it''s FROM fake'")).toEqual(['users'])
  })
})

describe('isSafeStatement', () => {
  const unsafe = [
    'PRAGMA table_info(users)',
    'ATTACH DATABASE x AS y',
    'DETACH DATABASE x',
    'DROP TABLE users',
    'ALTER TABLE x ADD y',
    'BEGIN; DELETE FROM users',
    'SELECT 1; DROP TABLE users',
    'VACUUM',
    'REINDEX',
    'CREATE TABLE x (a)',
    'CREATE INDEX idx ON x (a)',
    'ROLLBACK',
    'COMMIT',
  ]

  for (const sql of unsafe) {
    it(`rejects ${JSON.stringify(sql)}`, () => {
      expect(isSafeStatement(sql)).toBe(false)
    })
  }

  const safe = [
    'SELECT * FROM users',
    'INSERT INTO x (a) VALUES (1)',
    'UPDATE x SET a = 1',
    'DELETE FROM x',
    "SELECT * FROM x WHERE title = 'DROP TABLE y'",
  ]

  for (const sql of safe) {
    it(`accepts ${JSON.stringify(sql)}`, () => {
      expect(isSafeStatement(sql)).toBe(true)
    })
  }
})
