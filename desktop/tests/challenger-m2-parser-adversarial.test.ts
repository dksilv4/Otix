import { describe, it, expect } from 'vitest';
import { cleanGameTitle, parseReleaseName, extractGroup, parseVersion } from '../game/parser';

// ── Baseline Unoptimized cleanGameTitle for 1:1 Parity Verification ─────────
function cleanGameTitleBaseline(filename: string): string {
  let name = filename;
  if (!name) return '';

  name = name.replace(/^\d+\s*[-_.]\s*/, '');
  name = name.replace(/\(build\s*[^)]+\)/gi, '');
  name = name.replace(/\bbuild\s*[\d.]+\b/gi, '');
  name = name.replace(/\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi, '');
  name = name.replace(/(^|[^a-zA-Z0-9])(?:update\s*[\d\s._-]+(?=[a-zA-Z]|$))/gi, '$1');
  name = name.replace(/(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/(^|[\s._-])(?:v\d+|build\s*\d+)(?=[\s._-]|$)/gi, ' ');
  name = name.replace(/\.(iso|exe|zip|rar|7z|bin|cue|nsp|xci|3ds|nds|rvz|chd|gba|z64|sfc|pkg)$/i, '');
  name = name.replace(/\.part\d+$/i, '');
  name = name.replace(/\[[0-9A-Fa-f]{16}\]/g, '');
  name = name.replace(/\[?[A-Z]{4}\d{5}\]?/g, '');
  name = name.replace(/\[(?:UPD|DLC|v\d+)\]/gi, '');
  name = name.replace(/(?:\[|\()\s*(?:PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))/gi, ' ');
  name = name.replace(/(?:\[|\()\s*(?:19|20)\d{2}\s*(?:\]|\))/gi, ' ');
  name = name.replace(/(?:\[|\()\s*(?:USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\s*(?:\]|\))/gi, ' ');
  name = name.replace(/(?:\[|\()\s*(?:goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?\s*(?:\]|\))/gi, ' ');
  name = name.replace(/(?:\[|\()\s*v?\d+(?:\.\d+)+\s*(?:\]|\))/gi, ' ');
  name = name.replace(/(?:\[|\()\s*(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)\s*(?:\]|\))/gi, ' ');
  name = name.replace(/\+\s*crack /gi, ' ');
  name = name.replace(/ (?:crackfix|crack\.fix|crack-fix|crack\s*only|onlinefix|online\.fix|online-fix|nocd|no-cd) /gi, ' ');

  name = name.replace(/[\._\-]/g, ' ');
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bpart\s*\d+\b/gi, /\bprophet\b/gi, /\bdelusion\b/gi, /\bunleashed\b/gi,
    /\bcrack\s*fix(?:\s*v\d+)?\b/gi, /\bcrackfix(?:\s*v\d+)?\b/gi,
    /\bcrack\s*only\b/gi, /\bcrack\b/gi, /\bproper\b/gi, /\bearlyaccess\b/gi,
    /\bempress\b/gi, /\bcpy\b/gi, /\brune\b/gi, /\bflt\b/gi, /\bplaza\b/gi,
    /\bexe\b/gi, /\bunlocker\b/gi, /\bsmall\b/gi,
    /\bwin(?:dows)?\s*(?:10|11|7|8|xp)?\b/gi,
    /\b(?:2[1-5]h[12]|x64|x86|64bit|32bit)\b/gi,
    /\b(?:ps[1-5]|nsw)\b/gi,
    /\+\s*\d+\s*(?:dlcs?|bonuses|bonus|extras?|addons?)\b/gi,
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  name = name.replace(/\s+(exe|iso)\s*$/gi, '');
  name = name.replace(/[\s\-\+\:\,\&]+$/, '');
  name = name.replace(/^[\s\-\+\:\,\&]+/, '');
  return name.replace(/\s+/g, ' ').trim();
}

describe('Milestone 2 Adversarial Verification: cleanGameTitle & Parser Consolidation', () => {
  describe('1. Release Group Tags Sanitization', () => {
    it('cleans REPACK tag in various positions and casings', () => {
      expect(cleanGameTitle('Cyberpunk 2077 [REPACK]')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('Elden.Ring.REPACK-RUNE')).toBe('Elden Ring');
      expect(cleanGameTitle('[repack] The Witcher 3')).toBe('The Witcher 3');
      expect(cleanGameTitle('Game.Name.DODI.Repack')).toBe('Game Name');
    });

    it('cleans FLT (Fairlight) release tags', () => {
      expect(cleanGameTitle('Hogwarts.Legacy-FLT')).toBe('Hogwarts Legacy');
      expect(cleanGameTitle('Hogwarts.Legacy.MULTI12-FLT')).toBe('Hogwarts Legacy');
      expect(cleanGameTitle('STAR.WARS.Jedi.Survivor-FLT.iso')).toBe('STAR WARS Jedi Survivor');
      expect(cleanGameTitle('Dead.Space-FLT')).toBe('Dead Space');
      const res = cleanGameTitle('Ghostwire.Tokyo-FLT');
      expect(res).not.toContain('FLT');
      expect(res).toBe('Ghostwire Tokyo');
    });

    it('cleans RUNE release tags', () => {
      expect(cleanGameTitle('Elden.Ring.Shadow.of.the.Erdtree-RUNE')).toBe('Elden Ring Shadow of the Erdtree');
      expect(cleanGameTitle('Armored.Core.VI-RUNE')).toBe('Armored Core VI');
      expect(cleanGameTitle('Cyberpunk.2077.Crack.Fix.v2-RUNE')).toBe('Cyberpunk 2077');
      const res = cleanGameTitle('Ghost.of.Tsushima.DIRECTORS.CUT-RUNE');
      expect(res).not.toContain('RUNE');
      expect(res).toContain('Ghost of Tsushima');
    });

    it('cleans MULTI tags (MULTI12, MULTI5, etc.)', () => {
      expect(cleanGameTitle('Spider.Man.[Remastered].MULTI12-FLT')).toBe('Spider Man');
      expect(cleanGameTitle('Final.Fantasy.VII.Remake.MULTI5-CODEX')).toBe('Final Fantasy VII Remake');
      expect(cleanGameTitle('Ratchet.and.Clank.Rift.Apart.MULTI6-TENOKE')).toBe('Ratchet and Clank Rift Apart');
      const res = cleanGameTitle('Cyberpunk.2077.MULTI18-GOG');
      expect(res).not.toContain('MULTI18');
    });

    it('cleans PROPHET release tags', () => {
      expect(cleanGameTitle('Crysis.3-PROPHET')).toBe('Crysis 3');
      expect(cleanGameTitle('Sniper.Elite.V2.Complete-PROPHET')).toBe('Sniper Elite Complete');
      expect(cleanGameTitle('The.Bureau.XCOM.Declassified-PROPHET.iso')).toBe('The Bureau XCOM Declassified');
      const res = cleanGameTitle('Dead.Island.Riptide.Complete.Edition-PROPHET');
      expect(res).not.toContain('PROPHET');
      expect(res).toContain('Dead Island Riptide');
    });

    it('cleans other major scene groups and repackers', () => {
      expect(cleanGameTitle('Resident.Evil.4-EMPRESS')).toBe('Resident Evil 4');
      expect(cleanGameTitle('Grand.Theft.Auto.V-CODEX')).toBe('Grand Theft Auto V');
      expect(cleanGameTitle('Sekiro.Shadows.Die.Twice-SKIDROW')).toBe('Sekiro Shadows Die Twice');
      expect(cleanGameTitle('Hades.II-TENOKE')).toBe('Hades II');
      expect(cleanGameTitle('Monster.Hunter.Rise-DODI')).toBe('Monster Hunter Rise');
      expect(cleanGameTitle('Dark.Souls.III-ElAmigos')).toBe('Dark Souls III');
      expect(cleanGameTitle('Forza.Horizon.5-Razor1911')).toBe('Forza Horizon 5');
      expect(cleanGameTitle('Doom.Eternal-HOODLUM')).toBe('Doom Eternal');
      expect(cleanGameTitle('Persona.5.Royal-CPY')).toBe('Persona 5 Royal');
      expect(cleanGameTitle('Quake.Champions-FAIRLIGHT')).toBe('Quake Champions');
      expect(cleanGameTitle('Kingdom.Come.Deliverance-DELUSION')).toBe('Kingdom Come Deliverance');
      expect(cleanGameTitle('Borderlands.3-GOLDBERG')).toBe('Borderlands 3');
      expect(cleanGameTitle('Sonic-UNLEASHED')).toBe('Sonic');
    });
  });

  describe('2. Version, Build, Update, and Patch Strings Sanitization', () => {
    it('cleans semantic version strings (v1.0.4, v2.12, v1.32.1, etc.)', () => {
      expect(cleanGameTitle('Cyberpunk 2077 v2.12')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('The Witcher 3 Wild Hunt v1.32.1')).toBe('The Witcher 3 Wild Hunt');
      expect(cleanGameTitle('Baldurs Gate 3 v4.1.1.5009956')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('Hollow Knight v1.0.0.6')).toBe('Hollow Knight');
      expect(cleanGameTitle('Indie Game [v1.0.4]')).toBe('Indie Game');
      expect(cleanGameTitle('Retro Game (v2.1)')).toBe('Retro Game');
    });

    it('cleans build numbers and build dates', () => {
      expect(cleanGameTitle('Elden Ring (build 13.06.2024)')).toBe('Elden Ring');
      expect(cleanGameTitle('Starfield build 5849914')).toBe('Starfield');
      expect(cleanGameTitle('Cyberpunk 2077 build.14022025')).toBe('Cyberpunk 2077');
    });

    it('cleans update patterns and date ranges', () => {
      expect(cleanGameTitle('1 - High On Life 2 update 20.02.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('2 - High On Life 2 update 04.03.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('3 - High On Life 2 update 13.03.2026 - 05.05.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('Baldurs Gate 3 update 5849914 6758295 ElAmigos.bin')).toBe('Baldurs Gate 3');
    });

    it('cleans crack, crackfix, and onlinefix tags', () => {
      expect(cleanGameTitle('Cyberpunk 2077 + crack')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Cyberpunk 2077 Crack Only')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Elden Ring Crackfix v2')).toBe('Elden Ring');
      expect(cleanGameTitle('Lethal Company [OnlineFix]')).toBe('Lethal Company');
      expect(cleanGameTitle('Lethal Company (onlinefix)')).toBe('Lethal Company');
      expect(cleanGameTitle('Old Game (NoCD)')).toBe('Old Game');
      expect(cleanGameTitle('Old Game [No CD]')).toBe('Old Game');
      expect(cleanGameTitle('Old Game No-CD 1998')).toBe('Old Game 1998');
    });

    it('cleans DLC and extras tags', () => {
      expect(cleanGameTitle('The Witcher 3 + 16 DLCs')).toBe('The Witcher 3');
      expect(cleanGameTitle('Cyberpunk 2077 + 2 Bonuses')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Baldurs Gate 3 + 1 DLC + Crack')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('Total War Warhammer III + 10 Extras')).toBe('Total War Warhammer III');
    });

    it('cleans console platform tags and Title IDs', () => {
      expect(cleanGameTitle('The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]')).toBe('The Legend of Zelda Tears of the Kingdom');
      expect(cleanGameTitle('The Last of Us [BCUS98174]')).toBe('The Last of Us');
      expect(cleanGameTitle('Bloodborne [CUSA03173]')).toBe('Bloodborne');
      expect(cleanGameTitle('Demon Souls [PPSA01339]')).toBe('Demon Souls');
      expect(cleanGameTitle('Metroid Prime [GameCube] (USA).iso')).toBe('Metroid Prime');
      expect(cleanGameTitle('Super Mario Odyssey [Switch] [Europe].xci')).toBe('Super Mario Odyssey');
    });
  });

  describe('3. Word Boundary & Substring Preservation', () => {
    it('does not strip release group substrings inside legitimate words', () => {
      // "RUNE" in "Runestone"
      expect(cleanGameTitle('Runestone Keeper')).toBe('Runestone Keeper');
      expect(cleanGameTitle('Tales of the Runes')).toBe('Tales of the Runes');

      // "MULTI" in "Multiverse"
      expect(cleanGameTitle('Multiverse Defender')).toBe('Multiverse Defender');

      // "PROPHET" in "Prophecy"
      expect(cleanGameTitle('Prophecy of the Ancients')).toBe('Prophecy of the Ancients');

      // "FLT" in words like "Faltering"
      expect(cleanGameTitle('The Faltering Light')).toBe('The Faltering Light');

      // "SKIDROW" in "Skid" or "Skidmarks"
      expect(cleanGameTitle('Skidmarks Racing')).toBe('Skidmarks Racing');

      // "DODI" in "Dodging"
      expect(cleanGameTitle('Dodging Bullets')).toBe('Dodging Bullets');
    });
  });

  describe('4. 1:1 Parity Between Baseline and Optimized cleanGameTitle', () => {
    it('matches baseline output exactly across diverse release naming patterns', () => {
      const titles = [
        'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS',
        'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE',
        'The.Witcher.3.Wild.Hunt.GOTY-GOG',
        'Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL',
        'The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]',
        'The Last of Us [BCUS98174]',
        'Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS',
        'Elden.Ring.v1.12.Crackfix-RUNE',
        'Cyberpunk.2077.Crack.Fix.v2-RUNE',
        'Elden.Ring.v1.12.Crackfix.V2-RUNE',
        'Hogwarts.Legacy.Crackfix.PROPER-EMPRESS',
        'Red.Dead.Redemption.2.Crackfix.v2-EMPRESS',
        '1 - High On Life 2 update 20.02.2026',
        '2 - High On Life 2 update 04.03.2026',
        '3 - High On Life 2 update 13.03.2026 - 05.05.2026',
        'Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin',
        'Baldurs Gate 3 update 5849914 6758295 ElAmigos.bin',
        '1 - Tainted Grail The Fall of Avalon update 27.05.2025.exe',
        'Hogwarts_Legacy_-_small_DLC_unlocker_+_CrackFix_Win11_24H2',
        'Spider.Man.Remastered.MULTI12-FLT',
        'Dead.Island.Riptide.Complete.Edition-PROPHET',
        'Final.Fantasy.VII.Remake.Intergrade-CODEX',
        'God.of.War.Ragnarok.v1.0.4-TENOKE',
        'Horizon.Forbidden.West.Complete.Edition-DODI',
        'Persona.5.Royal.v1.02-CPY',
        'Hades.II.EarlyAccess-DELUSION',
        'Super.Mario.Odyssey.[0100000000010000].[v0].nsp',
      ];

      for (const t of titles) {
        const base = cleanGameTitleBaseline(t);
        const opt = cleanGameTitle(t);
        expect(opt).toBe(base);
      }
    });
  });

  describe('5. Adversarial Edge Cases & Crash Resistance', () => {
    it('handles empty and whitespace strings gracefully', () => {
      expect(cleanGameTitle('')).toBe('');
      expect(cleanGameTitle('   ')).toBe('');
      expect(cleanGameTitle('\t\n\r')).toBe('');
    });

    it('handles non-string types safely without throwing', () => {
      expect(cleanGameTitle(null as any)).toBe('');
      expect(cleanGameTitle(undefined as any)).toBe('');
      expect(cleanGameTitle(12345 as any)).toBe('12345');
      expect(cleanGameTitle(0 as any)).toBe('0');
      expect(cleanGameTitle(false as any)).toBe('false');
      expect(cleanGameTitle({} as any)).toBe('[object Object]');
    });

    it('handles titles consisting exclusively of tags and punctuation', () => {
      expect(cleanGameTitle('[repack][flt][rune][dodi]')).toBe('');
      expect(cleanGameTitle('--- +++ ... :::')).toBe('');
      expect(cleanGameTitle('[PC](USA)[v1.0.4].iso')).toBe('');
    });

    it('handles deep nesting and unclosed punctuation without hanging (ReDoS guard)', () => {
      const pathological1 = 'Game ' + '('.repeat(500) + 'test' + ')'.repeat(500);
      const start1 = performance.now();
      const res1 = cleanGameTitle(pathological1);
      const duration1 = performance.now() - start1;
      expect(duration1).toBeLessThan(100);
      expect(res1).toContain('Game');

      const pathological2 = 'Game ' + '[repack] '.repeat(500);
      const start2 = performance.now();
      const res2 = cleanGameTitle(pathological2);
      const duration2 = performance.now() - start2;
      expect(duration2).toBeLessThan(100);
      expect(res2).toBe('Game');
    });

    it('handles huge title strings without catastrophic performance drop', () => {
      const hugeTitle = 'A'.repeat(5000) + '.v1.0.4.REPACK-RUNE.iso';
      const start = performance.now();
      const res = cleanGameTitle(hugeTitle);
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50);
      expect(res).toBe('A'.repeat(5000));
    });

    it('handles Unicode, accents, and non-Latin scripts', () => {
      expect(cleanGameTitle('ポケットモンスター スカーレット [Switch].nsp')).toBe('ポケットモンスター スカーレット');
      expect(cleanGameTitle('巫师3：狂猎 v1.32 REPACK-FITGIRL')).toBe('巫师3：狂猎');
      expect(cleanGameTitle('Héroes del Silencio v1.0.4-FLT')).toBe('Héroes del Silencio');
      const res = cleanGameTitle('NieR:Automata™ Game of the YoRHa Edition-CODEX');
      expect(res).not.toContain('CODEX');
    });
  });

  describe('6. Memory Allocation & Heap Stability Check', () => {
    it('executes 100,000 iterations without unbounded heap expansion', () => {
      const sampleTitles = [
        'Cyberpunk.2077.v2.12.REPACK-ELAMIGOS',
        'Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE',
        'The.Witcher.3.Wild.Hunt.GOTY-GOG',
        'Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL',
        'The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]',
        'Hogwarts_Legacy_-_small_DLC_unlocker_+_CrackFix_Win11_24H2',
        'Dead.Island.Riptide.Complete.Edition-PROPHET',
        'Spider.Man.Remastered.MULTI12-FLT',
      ];

      for (let i = 0; i < 10000; i++) {
        cleanGameTitle(sampleTitles[i % sampleTitles.length]);
      }

      if (global.gc) global.gc();
      const heapBefore = process.memoryUsage().heapUsed;

      for (let i = 0; i < 100000; i++) {
        cleanGameTitle(sampleTitles[i % sampleTitles.length]);
      }

      if (global.gc) global.gc();
      const heapAfter = process.memoryUsage().heapUsed;
      const heapDeltaMB = (heapAfter - heapBefore) / (1024 * 1024);

      expect(heapDeltaMB).toBeLessThan(5);
    });
  });
});
