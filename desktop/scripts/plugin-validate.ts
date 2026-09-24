// desktop/scripts/plugin-validate.ts
//
// Offline validation for a plugin package, no Electron needed:
//
//   cd desktop
//   npm run build && node dist/scripts/plugin-validate.js <plugin-dir> [<dir>...]
//   npm run build && node dist/scripts/plugin-validate.js --all
//
// Checks, for each package:
//   - manifest.json parses
//   - the manifest's config schema + permission tokens are structurally valid
//     (the same gate the manager enforces at enable time)
//   - the declared entry.main file exists next to the manifest
//
// Exit code is 1 when any package has an error. Warnings are informational.

import fs from 'fs'
import path from 'path'
import { validateManifestSchema } from '../plugin-runtime/manifest-validation'

interface CheckedPlugin {
  dir: string
  manifestPath: string
  ok: boolean
  messages: Array<{ kind: 'error' | 'warning' | 'info'; text: string }>
}

const color = {
  red: (s: string) => s,
  yellow: (s: string) => s,
  green: (s: string) => s,
  dim: (s: string) => s,
}
if (process.stdout.isTTY) {
  const c = (n: number) => (s: string) => `[${n}m${s}[0m`
  color.red = c(31)
  color.yellow = c(33)
  color.green = c(32)
  color.dim = c(2)
}

/** Climb from the desktop package to the repo root that holds `extensions`. */
function findExtensionsDir(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'extensions', 'plugins')
    if (fs.existsSync(path.join(dir, 'extensions')) && fs.existsSync(candidate)) {
      return path.join(dir, 'extensions', 'plugins')
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function resolvePackage(arg: string, cwd: string): string {
  const target = path.resolve(cwd, arg)
  return fs.statSync(target).isFile() ? path.dirname(target) : target
}

function checkPlugin(dir: string): CheckedPlugin {
  const manifestPath = path.join(dir, 'manifest.json')
  const messages: CheckedPlugin['messages'] = []
  const plugin: CheckedPlugin = { dir, manifestPath, ok: true, messages }

  if (!fs.existsSync(manifestPath)) {
    messages.push({ kind: 'error', text: `no manifest.json found in ${dir}` })
    plugin.ok = false
    return plugin
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    messages.push({ kind: 'error', text: `manifest.json is not valid JSON: ${(err as Error).message}` })
    plugin.ok = false
    return plugin
  }

  const result = validateManifestSchema(raw)
  for (const issue of result.issues) {
    messages.push({
      kind: issue.severity,
      text: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
    })
    if (issue.severity === 'error') plugin.ok = false
  }

  // Warn about a missing entry file early — it would fail the app at boot.
  const entryMain = (raw as { entry?: { main?: unknown } }).entry?.main
  if (typeof entryMain === 'string' && entryMain) {
    const entryPath = path.join(dir, entryMain)
    if (!fs.existsSync(entryPath)) {
      messages.push({ kind: 'error', text: `declared entry "${entryMain}" does not exist` })
      plugin.ok = false
    }
  } else {
    // validateManifestSchema already reported entry.main when it is malformed.
  }

  return plugin
}

function printPlugin(plugin: CheckedPlugin): void {
  const name = path.basename(plugin.dir)
  const warnings = plugin.messages.filter((m) => m.kind === 'warning')
  if (plugin.ok) {
    const suffix = warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''
    console.log(`${color.green('ok')}   ${name}${suffix}`)
  } else {
    console.log(`${color.red('FAIL')} ${name}`)
  }
  for (const m of plugin.messages) {
    const label = m.kind === 'error' ? color.red('  error') : m.kind === 'warning' ? color.yellow('  warn ') : color.dim('  info ')
    console.log(`${label} ${m.text}`)
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const cwd = process.cwd()

  let targets = args.filter((a) => a !== '--all')
  const all = args.includes('--all')

  if (all) {
    const extensionsDir = findExtensionsDir(cwd)
    if (!extensionsDir || !fs.existsSync(extensionsDir)) {
      console.error(color.red(`Cannot locate extensions/plugins from ${cwd}. Pass plugin dirs explicitly.`))
      process.exit(1)
    }
    // A plugin package is a directory with a manifest.json. Non-plugin dirs
    // (e.g. `shared/` helpers) are skipped rather than reported as failures.
    targets = fs
      .readdirSync(extensionsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(extensionsDir, e.name, 'manifest.json')))
      .map((e) => path.join(extensionsDir, e.name))
  }

  if (targets.length === 0) {
    console.error(`usage: plugin-validate.js <plugin-dir> [<dir>...] | --all`)
    process.exit(2)
  }

  const resolved: string[] = []
  for (const t of targets) {
    try {
      resolved.push(resolvePackage(t, cwd))
    } catch {
      console.error(color.red(`not found: ${t}`))
      process.exitCode = 1
    }
  }

  let failed = 0
  const seen = new Set<string>()
  for (const dir of resolved) {
    if (seen.has(dir)) continue
    seen.add(dir)
    const plugin = checkPlugin(dir)
    printPlugin(plugin)
    if (!plugin.ok) failed++
  }

  console.log('')
  if (failed === 0) {
    console.log(color.green(`All ${seen.size} plugin package${seen.size === 1 ? '' : 's'} valid.`))
  } else {
    console.log(color.red(`${failed} plugin package${failed === 1 ? '' : 's'} failed validation.`))
    process.exitCode = 1
  }
}

main()
