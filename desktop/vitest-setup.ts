// ponytail: create temp dir before tests so better-sqlite3 (native) can create DB files
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const tmpBase = path.join(os.tmpdir(), 'otix-test')
fs.mkdirSync(path.join(tmpBase, 'userData', 'databases'), { recursive: true })
fs.mkdirSync(path.join(tmpBase, 'userData', 'saves'), { recursive: true })
