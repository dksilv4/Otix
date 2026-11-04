// desktop/game/achievements/vdf-parser.ts
/**
 * Binary Valve KeyValues (VDF) parser for UserGameStatsSchema_<AppID>.bin
 *
 * Valve stores game schemas in binary VDF format with the following types:
 * 0x00 = Child object / block (followed by null-terminated string key)
 * 0x01 = String (key, value)
 * 0x02 = Int32 (key, 4 bytes LE)
 * 0x03 = Float32 (key, 4 bytes LE)
 * 0x07 = Int64 (key, 8 bytes LE)
 * 0x08 = End of object / block
 */

export interface ParsedVdfAchievement {
  name: string
  displayName: string
  description: string
  icon: string
  iconGray: string
  hidden: boolean
}

export function parseBinaryVdf(buffer: Buffer): Record<string, any> {
  let offset = 0

  function readCString(): string {
    const start = offset
    while (offset < buffer.length && buffer[offset] !== 0) {
      offset++
    }
    const str = buffer.toString('utf8', start, offset)
    offset++ // Skip null byte
    return str
  }

  function parseBlock(): Record<string, any> {
    const obj: Record<string, any> = {}
    while (offset < buffer.length) {
      const type = buffer[offset++]
      if (type === 0x08) {
        break
      }
      const key = readCString()
      if (type === 0x00) {
        obj[key] = parseBlock()
      } else if (type === 0x01) {
        obj[key] = readCString()
      } else if (type === 0x02) {
        if (offset + 4 <= buffer.length) {
          obj[key] = buffer.readInt32LE(offset)
          offset += 4
        }
      } else if (type === 0x03) {
        if (offset + 4 <= buffer.length) {
          obj[key] = buffer.readFloatLE(offset)
          offset += 4
        }
      } else if (type === 0x07) {
        if (offset + 8 <= buffer.length) {
          obj[key] = buffer.readBigInt64LE(offset)
          offset += 8
        }
      } else {
        // Unknown or unexpected type — stop parsing current block
        break
      }
    }
    return obj
  }

  return parseBlock()
}

export function extractAchievementsFromSchema(vdfObject: Record<string, any>, appId: string): ParsedVdfAchievement[] {
  const achievements: ParsedVdfAchievement[] = []
  const appData = vdfObject[appId] || Object.values(vdfObject)[0]
  if (!appData || typeof appData !== 'object') return achievements

  const stats = appData.stats
  if (!stats || typeof stats !== 'object') return achievements

  for (const statGroup of Object.values(stats)) {
    if (!statGroup || typeof statGroup !== 'object') continue
    const group = statGroup as Record<string, any>
    if (group.type !== 'ACHIEVEMENTS' && !group.bits) continue

    const bits = group.bits
    if (!bits || typeof bits !== 'object') continue

    for (const achData of Object.values(bits)) {
      if (!achData || typeof achData !== 'object') continue
      const ach = achData as Record<string, any>
      const name = ach.name
      if (!name || typeof name !== 'string') continue

      const display = ach.display || {}
      const nameObj = display.name || {}
      const descObj = display.desc || {}

      const displayName =
        typeof nameObj === 'string'
          ? nameObj
          : nameObj.english || Object.values(nameObj)[0] || name

      const description =
        typeof descObj === 'string'
          ? descObj
          : descObj.english || Object.values(descObj)[0] || ''

      const icon = display.icon ? String(display.icon) : ''
      const iconGray = display.icon_gray ? String(display.icon_gray) : ''
      const hidden = Boolean(display.hidden)

      achievements.push({
        name,
        displayName: String(displayName),
        description: String(description),
        icon,
        iconGray,
        hidden,
      })
    }
  }

  return achievements
}
