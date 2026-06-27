// ponytail: globalSetup runs in a separate process — real fs, no mocks
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export function setup(): void {
  const tmpBase = path.join(os.tmpdir(), 'otix-test')
  fs.mkdirSync(path.join(tmpBase, 'userData', 'databases'), { recursive: true })
  fs.mkdirSync(path.join(tmpBase, 'userData', 'saves'), { recursive: true })
}
