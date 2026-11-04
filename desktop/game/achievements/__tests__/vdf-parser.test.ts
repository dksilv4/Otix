// desktop/game/achievements/__tests__/vdf-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseBinaryVdf, extractAchievementsFromSchema } from '../vdf-parser'

describe('vdf-parser', () => {
  it('parses binary VDF with strings, ints, floats, and child blocks', () => {
    // Construct a synthetic binary VDF buffer
    // 0x00: root child block "1295660"
    //   0x00: "stats"
    //     0x00: "1"
    //       0x01: "type" = "ACHIEVEMENTS"
    //       0x00: "bits"
    //         0x00: "0"
    //           0x01: "name" = "ACH_WIN_GAME"
    //           0x00: "display"
    //             0x00: "name"
    //               0x01: "english" = "Victorious"
    //             0x08
    //             0x00: "desc"
    //               0x01: "english" = "Win your first game"
    //             0x08
    //             0x02: "hidden" = 0
    //             0x01: "icon" = "win_icon.jpg"
    //             0x01: "icon_gray" = "win_icon_gray.jpg"
    //           0x08
    //         0x08
    //       0x08
    //     0x08
    //   0x08
    // 0x08

    const chunks: Buffer[] = []

    function writeCString(str: string) {
      chunks.push(Buffer.from(str, 'utf8'), Buffer.from([0x00]))
    }

    chunks.push(Buffer.from([0x00]))
    writeCString('1295660')

    chunks.push(Buffer.from([0x00]))
    writeCString('stats')

    chunks.push(Buffer.from([0x00]))
    writeCString('1')

    chunks.push(Buffer.from([0x01]))
    writeCString('type')
    writeCString('ACHIEVEMENTS')

    chunks.push(Buffer.from([0x00]))
    writeCString('bits')

    chunks.push(Buffer.from([0x00]))
    writeCString('0')

    chunks.push(Buffer.from([0x01]))
    writeCString('name')
    writeCString('ACH_WIN_GAME')

    chunks.push(Buffer.from([0x00]))
    writeCString('display')

    chunks.push(Buffer.from([0x00]))
    writeCString('name')
    chunks.push(Buffer.from([0x01]))
    writeCString('english')
    writeCString('Victorious')
    chunks.push(Buffer.from([0x08]))

    chunks.push(Buffer.from([0x00]))
    writeCString('desc')
    chunks.push(Buffer.from([0x01]))
    writeCString('english')
    writeCString('Win your first game')
    chunks.push(Buffer.from([0x08]))

    chunks.push(Buffer.from([0x02]))
    writeCString('hidden')
    const intBuf = Buffer.alloc(4)
    intBuf.writeInt32LE(0)
    chunks.push(intBuf)

    chunks.push(Buffer.from([0x01]))
    writeCString('icon')
    writeCString('win_icon.jpg')

    chunks.push(Buffer.from([0x01]))
    writeCString('icon_gray')
    writeCString('win_icon_gray.jpg')

    chunks.push(Buffer.from([0x08])) // end display
    chunks.push(Buffer.from([0x08])) // end 0
    chunks.push(Buffer.from([0x08])) // end bits
    chunks.push(Buffer.from([0x08])) // end 1
    chunks.push(Buffer.from([0x08])) // end stats
    chunks.push(Buffer.from([0x08])) // end 1295660

    const buffer = Buffer.concat(chunks)
    const parsed = parseBinaryVdf(buffer)

    expect(parsed['1295660']).toBeDefined()
    expect(parsed['1295660'].stats['1'].type).toBe('ACHIEVEMENTS')

    const achievements = extractAchievementsFromSchema(parsed, '1295660')
    expect(achievements).toHaveLength(1)
    expect(achievements[0]).toEqual({
      name: 'ACH_WIN_GAME',
      displayName: 'Victorious',
      description: 'Win your first game',
      icon: 'win_icon.jpg',
      iconGray: 'win_icon_gray.jpg',
      hidden: false,
    })
  })
})
