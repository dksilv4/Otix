// desktop/scripts/create-plugin.ts
//
// Scaffold a new plugin package + optional marketplace registry entry:
//
//   cd desktop
//   npm run build && node dist/scripts/create-plugin.js steam-sync \
//       --name "Steam Sync" --description "Sync Steam to Otix" --author "You"
//
// Creates:
//   <target>/<id>/manifest.json   (valid, schema-checked before write)
//   <target>/<id>/main.js         (entry stub exporting entry(ctx))
// and, unless --no-registry, appends a matching entry to extensions/registry.json.
//
// Target defaults to the repo's extensions/plugins dir (found by climbing).

import fs from 'fs'
import path from 'path'
import { validateManifestSchema } from '../plugins/manifest-validation'

const color = {
  red: (s: string) => s,
  yellow: (s: string) => s,
  green: (s: string) => s,
}
if (process.stdout.isTTY) {
  const c = (n: number) => (s: string) => `[${n}m${s}[0m`
  color.red = c(31)
  color.yellow = c(33)
  color.green = c(32)
}

interface CliArgs {
  id: string
  name?: string
  description?: string
  author?: string
  version: string
  minAppVersion: string
  repository: string
  target?: string
  registry: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    id: '',
    version: '0.1.0',
    minAppVersion: '0.1.0',
    repository: 'https://github.com/dksilv4/otix-plugins',
    registry: true,
  }
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    switch (a) {
      case '--name':
        args.name = next()
        break
      case '--description':
        args.description = next()
        break
      case '--author':
        args.author = next()
        break
      case '--version':
        args.version = next()
        break
      case '--min-app-version':
        args.minAppVersion = next()
        break
      case '--repository':
        args.repository = next()
        break
      case '--target':
        args.target = next()
        break
      case '--no-registry':
        args.registry = false
        break
      default:
        if (a.startsWith('-')) {
          console.error(`unknown option: ${a}`)
          process.exit(2)
        }
        positional.push(a)
    }
  }
  if (positional.length !== 1) {
    console.error(`usage: create-plugin.js <plugin-id> [--name ..] [--description ..] [--author ..] [--target dir] [--no-registry]`)
    process.exit(2)
  }
  args.id = positional[0]
  return args
}

/** Climb to the repo root that contains both `desktop` and `extensions`. */
function findExtensionsPluginsDir(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 6; i++) {
    const pluginsDir = path.join(dir, 'extensions', 'plugins')
    if (fs.existsSync(path.join(dir, 'desktop')) && fs.existsSync(pluginsDir)) {
      return pluginsDir
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function titleCase(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function templateManifest(args: CliArgs): Record<string, unknown> {
  return {
    name: args.name ?? titleCase(args.id),
    version: args.version,
    description: args.description ?? `Otix plugin "${args.id}".`,
    author: args.author ?? '',
    repository: args.repository,
    min_app_version: args.minAppVersion,
    permissions: ['ui:settings'],
    entry: { main: 'main.js' },
  }
}

function templateMain(id: string): string {
  return `// ${id} — entry stub.
//
// The host boots this file in a fresh worker and calls entry(ctx) once. ctx
// exposes config, events, fetch, db, downloads, notifications, activity and
// inter-plugin call/handle/discover. Return a cleanup function if you hold
// timers/subscriptions that must stop when the plugin is disabled or reloaded.

module.exports = {
  async entry(ctx) {
    const { logger, config } = ctx
    logger.info('[${id}] plugin started', config.getAll())
  },
}
`
}

function registryEntry(args: CliArgs): Record<string, unknown> {
  return {
    id: args.id,
    name: args.name ?? titleCase(args.id),
    version: args.version,
    description: args.description ?? `Otix plugin "${args.id}".`,
    author: args.author ?? '',
    repository: args.repository,
    path: `plugins/${args.id}`,
    icon: 'puzzle',
    category: 'other',
    tags: [args.id],
    permissions: ['ui:settings'],
  }
}

function appendToRegistry(pluginDir: string, args: CliArgs): void {
  // plugins/<id>/.. = plugins dir, /../.. = extensions dir holding registry.json
  const registryPath = path.resolve(pluginDir, '..', '..', 'registry.json')
  if (!fs.existsSync(registryPath)) {
    console.log(color.yellow(`registry.json not found at ${registryPath} — skipping registry entry`))
    return
  }
  let registry: { plugins?: unknown[]; [key: string]: unknown }
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  } catch {
    console.log(color.yellow(`registry.json is not valid JSON — skipping registry entry`))
    return
  }
  if (!Array.isArray(registry.plugins)) {
    console.log(color.yellow(`registry.json has no plugins array — skipping registry entry`))
    return
  }
  if (registry.plugins.some((p) => (p as { id?: string }).id === args.id)) {
    console.log(color.yellow(`registry already lists "${args.id}" — not re-adding`))
    return
  }
  registry.plugins.push(registryEntry(args))
  registry.updated_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
  console.log(color.green(`registered ${args.id} in ${path.relative(process.cwd(), registryPath)}`))
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const pluginsDir =
    (args.target && path.resolve(process.cwd(), args.target)) ??
    findExtensionsPluginsDir(process.cwd())
  if (!pluginsDir || !fs.existsSync(pluginsDir)) {
    console.error(color.red(`Cannot resolve target plugins dir (pass --target or run from the repo)`))
    process.exit(1)
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(args.id)) {
    console.error(color.red(`plugin id must be lowercase alphanumeric + dashes (got "${args.id}")`))
    process.exit(2)
  }

  const pluginDir = path.join(pluginsDir, args.id)
  if (fs.existsSync(pluginDir)) {
    console.error(color.red(`${pluginDir} already exists`))
    process.exit(1)
  }

  fs.mkdirSync(pluginDir, { recursive: true })

  const manifest = templateManifest(args)
  const manifestPath = path.join(pluginDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  fs.writeFileSync(path.join(pluginDir, 'main.js'), templateMain(args.id))

  // Validate what we just wrote against the same gate the manager enforces.
  const result = validateManifestSchema(manifest)
  const errors = result.issues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    console.error(color.red(`generated manifest failed validation (should not happen):`))
    for (const issue of errors) console.error(color.red(`  - ${issue.path}: ${issue.message}`))
    process.exit(1)
  }

  console.log(color.green(`Created ${pluginDir}`))
  console.log(`  - manifest.json (valid, no schema errors)`)
  console.log(`  - main.js      (entry stub)`)

  if (args.registry) appendToRegistry(pluginDir, args)
}

main()
