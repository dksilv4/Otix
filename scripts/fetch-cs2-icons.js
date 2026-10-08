/**
 * Utility script to fetch CS2 base weapons and iconic skins from ByMykel's CSGO-API
 * and generate frontend/src/features/activity/utils/cs2-real-items-data.ts.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Fetching ByMykel CSGO-API base weapons & skins...');
  const [baseRes, skinsRes] = await Promise.all([
    fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/base_weapons.json'),
    fetch('https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json'),
  ]);

  const baseWeapons = await baseRes.json();
  const allSkins = await skinsRes.json();

  console.log(`Fetched ${baseWeapons.length} base weapons and ${allSkins.length} skins.`);

  const popularKeywords = [
    'Printstream', 'Asiimov', 'Redline', 'Hyper Beast', 'Kill Confirmed',
    'Water Elemental', 'Dragon Lore', 'Howl', 'Doppler', 'Fade',
    'Insomnia', 'Monster Call', 'Heat', 'Vulcan', 'Neo-Noir',
    'The Emperor', 'Case Hardened', 'Fire Serpent', 'Cortex', 'Vogue',
    'Code Red', 'Kumicho Dragon', 'Decimator', 'Cyrex', 'SWAG-7',
    'Bulldozer', 'Justice', 'BIFF', 'Cobalt Core', 'Prismatic',
    'Slate', 'Nightwish', 'Head Shot', 'Ice Coiled', 'Inheritance',
    'Black Lotus', 'Chrome Cannon', 'Jawbreaker', 'Olympus', 'In Living Color'
  ];

  const matchedSkins = allSkins.filter(s =>
    popularKeywords.some(kw => s.name && s.name.includes(kw))
  );

  const registry = {};

  // Add all base weapons
  for (const bw of baseWeapons) {
    const key = bw.name.toLowerCase().trim();
    registry[key] = {
      name: bw.name,
      image: bw.image,
      category: bw.category?.name || 'Weapon',
    };
  }

  // Add popular skins with rarity colors
  for (const sk of matchedSkins) {
    const key = sk.name.toLowerCase().trim();
    registry[key] = {
      name: sk.name,
      image: sk.image,
      category: sk.category?.name || 'Weapon Skin',
      rarityColor: sk.rarity?.color,
    };
  }

  // Common aliases
  const aliases = {
    'm4a1': 'm4a1-s',
    'm4': 'm4a1-s',
    'm4a4': 'm4a4',
    'ak47': 'ak-47',
    'ak': 'ak-47',
    'mag7': 'mag-7',
    'shotgun': 'mag-7',
    'usp': 'usp-s',
    'glock': 'glock-18',
    'deagle': 'desert eagle',
    'c4': 'c4 explosive',
    'bomb': 'c4 explosive',
    'zeus': 'zeus x27',
    'taser': 'zeus x27',
    'defuser': 'defuse kit',
    'kit': 'defuse kit',
    'knife': 'knife',
  };

  const fileContent = `/**
 * Official Counter-Strike 2 Weapon, Equipment & Skin Imagery Registry.
 * Source: ByMykel CSGO-API (parsed from official CS2 game files and Steam Economy CDN).
 * Endpoint: https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/
 */

export interface Cs2ItemMetadata {
  name: string
  image: string
  category?: string
  rarityColor?: string
}

export const CS2_ITEMS_REGISTRY: Record<string, Cs2ItemMetadata> = ${JSON.stringify(registry, null, 2)}

export const CS2_WEAPON_ALIASES: Record<string, string> = ${JSON.stringify(aliases, null, 2)}

/**
 * Resolves real CS2 item metadata (image URL, skin details, category)
 * from weapon name or skin string.
 */
export const resolveCs2Item = (
  rawWeaponOrSkin?: string,
  skinName?: string
): Cs2ItemMetadata | null => {
  if (!rawWeaponOrSkin) return null

  const cleaned = rawWeaponOrSkin
    .replace(/^weapon_/i, '')
    .replace(/_silencer$/i, '-s')
    .toLowerCase()
    .trim()

  // 1. Direct compound match: e.g. "mag-7 | insomnia"
  if (CS2_ITEMS_REGISTRY[cleaned]) {
    return CS2_ITEMS_REGISTRY[cleaned]
  }

  // 2. If separate skinName is provided, test compound
  if (skinName) {
    const compound = \`\${cleaned} | \${skinName.toLowerCase().trim()}\`
    if (CS2_ITEMS_REGISTRY[compound]) {
      return CS2_ITEMS_REGISTRY[compound]
    }
  }

  // 3. Check alias table
  const aliased = CS2_WEAPON_ALIASES[cleaned] || cleaned
  if (CS2_ITEMS_REGISTRY[aliased]) {
    return CS2_ITEMS_REGISTRY[aliased]
  }

  // 4. Prefix search (e.g. "m4a1-s" matching registry base)
  for (const [key, val] of Object.entries(CS2_ITEMS_REGISTRY)) {
    if (key === aliased || key.startsWith(aliased + ' |')) {
      return val
    }
  }

  return null
}
`;

  const outputPath = path.resolve(__dirname, '../frontend/src/features/activity/utils/cs2-real-items-data.ts');
  fs.writeFileSync(outputPath, fileContent, 'utf-8');
  console.log(`Generated registry at ${outputPath} with ${Object.keys(registry).length} items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
