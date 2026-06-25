// extensions/otix-plugins/plugins/factorio-blueprints/main.js
// Factorio Blueprint vault and community sharing plugin for Otix

const zlib = require('zlib')

/**
 * Decode a Factorio blueprint string.
 * Format chain: base64 -> zlib inflate -> UTF-8 JSON
 *
 * @param {string} raw - The blueprint string (starts with '0' for blueprint, '1' for book)
 * @returns {ParsedBlueprint}
 */
function decodeBlueprint(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Invalid blueprint string: must be a non-empty string')
  }

  const versionByte = raw[0]
  if (versionByte !== '0' && versionByte !== '1') {
    throw new Error('Invalid blueprint string: must start with 0 or 1')
  }

  // Strip version byte and decode base64
  const encoded = raw.slice(1)
  let buffer
  try {
    buffer = Buffer.from(encoded, 'base64')
  } catch {
    throw new Error('Invalid blueprint string: base64 decode failed')
  }

  // Zlib inflate
  let jsonStr
  try {
    jsonStr = zlib.inflateSync(buffer).toString('utf8')
  } catch {
    throw new Error('Invalid blueprint string: zlib decompression failed')
  }

  // Parse JSON
  let data
  try {
    data = JSON.parse(jsonStr)
  } catch {
    throw new Error('Invalid blueprint string: JSON parse failed')
  }

  const bp = data.blueprint || data.blueprint_book
  if (!bp) {
    throw new Error('Invalid blueprint string: missing blueprint or blueprint_book key')
  }

  const entities = bp.entities || []
  const tiles = bp.tiles || []

  // Group entities by type and count
  const entityCounts = {}
  for (const entity of entities) {
    entityCounts[entity.name] = (entityCounts[entity.name] || 0) + 1
  }

  // Group tiles by type and count
  const tileCounts = {}
  for (const tile of tiles) {
    tileCounts[tile.name] = (tileCounts[tile.name] || 0) + 1
  }

  // Calculate dimensions
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const entity of entities) {
    const x = entity.position?.x
    const y = entity.position?.y
    if (x != null) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (y != null) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  for (const tile of tiles) {
    const x = tile.position?.x
    const y = tile.position?.y
    if (x != null) { minX = Math.min(minX, x); maxX = Math.max(maxX, x) }
    if (y != null) { minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  }
  const dimensions = (minX === Infinity)
    ? { width: 0, height: 0 }
    : { width: maxX - minX + 1, height: maxY - minY + 1 }

  // Extract icons
  const icons = (bp.icons || []).map(icon => icon.signal?.name).filter(Boolean)

  return {
    type: data.blueprint_book ? 'blueprint-book' : 'blueprint',
    label: bp.label || 'Unnamed Blueprint',
    description: bp.description || '',
    icons,
    entities: entityCounts,
    entityCount: entities.length,
    tiles: tileCounts,
    tileCount: tiles.length,
    dimensions,
    version: bp.version ? String(bp.version) : 'unknown',
    raw,
    // For blueprint books, extract child info (children are already parsed JSON, not encoded strings)
    children: data.blueprint_book
      ? (bp.blueprints || []).map(child => ({
          type: 'blueprint',
          label: child.label || child.blueprint?.label || 'Unnamed Blueprint',
          icons: (child.blueprint?.icons || []).map((icon) => icon.signal?.name).filter(Boolean),
          entityCount: (child.blueprint?.entities || []).length,
        }))
      : undefined,
  }
}

module.exports = {
  plugin: function(ctx) {
    ctx.logger.info('Factorio Blueprints loaded')

    ctx.handle('importBlueprint', async (args) => {
      const { rawString } = args
      if (!rawString) {
        return { success: false, error: 'rawString required' }
      }
      try {
        const parsed = decodeBlueprint(rawString)
        return { success: true, blueprint: parsed }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })

    ctx.onDestroy(() => {
      ctx.logger.info('Factorio Blueprints unloaded')
    })
  },

  slotRender: async function(ctx, location) {
    return {
      widgets: [{
        type: 'game-tab',
        props: {
          tabId: 'blueprints',
          label: 'Blueprints',
          gameIds: ['427520'],
        }
      }]
    }
  },

  status: async function(ctx) {
    return { loaded: true }
  },

  test: async function(ctx, configDraft) {
    return { success: true, message: 'Plugin ready' }
  }
}
