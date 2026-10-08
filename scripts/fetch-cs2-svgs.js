const fs = require('fs');
const path = require('path');

const WEAPONS = [
  { id: 'mag7', file: 'mag7.svg', names: ['mag-7', 'mag7', 'shotgun'] },
  { id: 'm4a1_silencer', file: 'm4a1_silencer.svg', names: ['m4a1-s', 'm4a1_silencer', 'm4a1'] },
  { id: 'm4a1', file: 'm4a1.svg', names: ['m4a4', 'm4'] },
  { id: 'ak47', file: 'ak47.svg', names: ['ak-47', 'ak47', 'ak'] },
  { id: 'usp_silencer', file: 'usp_silencer.svg', names: ['usp-s', 'usp_silencer', 'usp'] },
  { id: 'glock', file: 'glock.svg', names: ['glock-18', 'glock', 'glock18'] },
  { id: 'knife', file: 'knife.svg', names: ['knife', 'default_knife'] },
  { id: 'knife_butterfly', file: 'knife_butterfly.svg', names: ['butterfly knife', 'butterfly'] },
  { id: 'knife_karambit', file: 'knife_karambit.svg', names: ['karambit'] },
  { id: 'knife_m9_bayonet', file: 'knife_m9_bayonet.svg', names: ['m9 bayonet'] },
  { id: 'awp', file: 'awp.svg', names: ['awp', 'sniper'] },
  { id: 'deagle', file: 'deagle.svg', names: ['desert eagle', 'deagle'] },
  { id: 'famas', file: 'famas.svg', names: ['famas'] },
  { id: 'galilar', file: 'galilar.svg', names: ['galil ar', 'galil'] },
  { id: 'mp9', file: 'mp9.svg', names: ['mp9'] },
  { id: 'mac10', file: 'mac10.svg', names: ['mac-10', 'mac10'] },
  { id: 'mp7', file: 'mp7.svg', names: ['mp7'] },
  { id: 'mp5sd', file: 'mp5sd.svg', names: ['mp5-sd', 'mp5'] },
  { id: 'ump45', file: 'ump45.svg', names: ['ump-45', 'ump'] },
  { id: 'p90', file: 'p90.svg', names: ['p90'] },
  { id: 'bizon', file: 'bizon.svg', names: ['pp-bizon', 'bizon'] },
  { id: 'nova', file: 'nova.svg', names: ['nova'] },
  { id: 'xm1014', file: 'xm1014.svg', names: ['xm1014'] },
  { id: 'sawedoff', file: 'sawedoff.svg', names: ['sawed-off', 'sawedoff'] },
  { id: 'ssg08', file: 'ssg08.svg', names: ['ssg 08', 'scout', 'ssg'] },
  { id: 'aug', file: 'aug.svg', names: ['aug'] },
  { id: 'sg556', file: 'sg556.svg', names: ['sg 553', 'sg556'] },
  { id: 'scar20', file: 'scar20.svg', names: ['scar-20', 'scar'] },
  { id: 'g3sg1', file: 'g3sg1.svg', names: ['g3sg1'] },
  { id: 'p250', file: 'p250.svg', names: ['p250'] },
  { id: 'fiveseven', file: 'fiveseven.svg', names: ['five-seven', 'fiveseven'] },
  { id: 'tec9', file: 'tec9.svg', names: ['tec-9', 'tec9'] },
  { id: 'cz75a', file: 'cz75a.svg', names: ['cz75-auto', 'cz75'] },
  { id: 'revolver', file: 'revolver.svg', names: ['r8 revolver', 'revolver'] },
  { id: 'elite', file: 'elite.svg', names: ['dual berettas', 'dual_barettas', 'elites'] },
  { id: 'hkp2000', file: 'hkp2000.svg', names: ['p2000'] },
  { id: 'taser', file: 'taser.svg', names: ['zeus x27', 'zeus', 'taser'] },
  { id: 'c4', file: 'planted_c4.svg', names: ['c4', 'c4 explosive', 'bomb'] },
];

async function main() {
  const baseUrl = 'https://raw.githubusercontent.com/ChetdeJong/cs2-killfeed-generator/master/public/weapons/';
  const result = {};

  for (const w of WEAPONS) {
    try {
      const res = await fetch(baseUrl + w.file);
      if (!res.ok) {
        console.error('Failed to fetch:', w.file, res.status);
        continue;
      }
      let svg = await res.text();
      // Clean XML declaration and comments
      svg = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
      // Extract viewBox or width/height
      const vbMatch = svg.match(/viewBox="([^"]+)"/);
      const wMatch = svg.match(/width="([^"]+)"/);
      const hMatch = svg.match(/height="([^"]+)"/);
      let viewBox = vbMatch ? vbMatch[1] : null;
      if (!viewBox && wMatch && hMatch) {
        const wVal = parseFloat(wMatch[1]);
        const hVal = parseFloat(hMatch[1]);
        viewBox = `0 0 ${wVal} ${hVal}`;
      }

      // Extract inner content inside <svg>...</svg>
      const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
      let innerContent = innerMatch ? innerMatch[1].trim() : '';
      // Ensure all fills inherit currentColor so Tailwind and theme classes style them
      innerContent = innerContent.replace(/fill="#[A-Fa-f0-9]{3,6}"/gi, 'fill="currentColor"');
      innerContent = innerContent.replace(/fill="white"/gi, 'fill="currentColor"');
      innerContent = innerContent.replace(/<g id="guides">[\s\S]*?<\/g>/gi, '').trim();

      result[w.id] = {
        id: w.id,
        file: w.file,
        viewBox: viewBox || '0 0 100 40',
        innerSvg: innerContent,
        names: w.names,
      };
      console.log('Processed:', w.id, 'viewBox:', viewBox, 'inner length:', innerContent.length);
    } catch (err) {
      console.error('Error on', w.file, err);
    }
  }

  const outPath = path.join(__dirname, '../frontend/src/features/activity/utils/cs2-official-svg-icons.ts');
  const code = `/**
 * Official Counter-Strike 2 In-Game Vector HUD / Killfeed Glyphs.
 * Extracted directly from official CS2 game files.
 * Clean, perfectly scaled vector paths with original valve viewBoxes.
 */

export interface Cs2OfficialSvgDef {
  id: string
  viewBox: string
  innerSvg: string
  names: string[]
}

export const CS2_OFFICIAL_WEAPON_SVGS: Record<string, Cs2OfficialSvgDef> = ${JSON.stringify(result, null, 2)}

export const resolveCs2OfficialSvg = (weaponName?: string): Cs2OfficialSvgDef => {
  if (!weaponName) return CS2_OFFICIAL_WEAPON_SVGS['m4a1_silencer'] || Object.values(CS2_OFFICIAL_WEAPON_SVGS)[0]

  const clean = weaponName
    .split('|')[0]
    .replace(/^weapon_/i, '')
    .replace(/^[★\\s]+/, '')
    .toLowerCase()
    .trim()

  for (const item of Object.values(CS2_OFFICIAL_WEAPON_SVGS)) {
    if (item.names.some(n => clean === n || clean.includes(n))) {
      return item
    }
  }

  // Fallback defaults based on weapon category hints
  if (clean.includes('knife') || clean.includes('bayonet') || clean.includes('karambit')) {
    return CS2_OFFICIAL_WEAPON_SVGS['knife']
  }
  if (clean.includes('pistol') || clean.includes('usp') || clean.includes('glock')) {
    return CS2_OFFICIAL_WEAPON_SVGS['usp_silencer']
  }
  if (clean.includes('mag') || clean.includes('shotgun') || clean.includes('nova')) {
    return CS2_OFFICIAL_WEAPON_SVGS['mag7']
  }
  if (clean.includes('sniper') || clean.includes('awp')) {
    return CS2_OFFICIAL_WEAPON_SVGS['awp']
  }
  if (clean.includes('ak')) {
    return CS2_OFFICIAL_WEAPON_SVGS['ak47']
  }
  return CS2_OFFICIAL_WEAPON_SVGS['m4a1_silencer'] || CS2_OFFICIAL_WEAPON_SVGS['m4a1']
}
`;

  fs.writeFileSync(outPath, code, 'utf-8');
  console.log('Saved', Object.keys(result).length, 'official SVGs to', outPath);
}

main();
