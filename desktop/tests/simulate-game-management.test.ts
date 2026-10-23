import { describe, it, expect } from 'vitest';
import * as path from 'path';

// Require the simulation engine from scripts
const simModule = require('../../scripts/simulate-game-management.js');
const {
  runSimulation,
  parseReleaseName,
  classifyArtifact,
  cleanGameTitle,
  extractGroup,
  applyTemplate,
  analyzeRepackArchiveIntegrity,
  PRESETS,
  SAMPLE_RELEASES,
} = simModule;

describe('simulate-game-management', () => {
  describe('cleanGameTitle', () => {
    it('cleans scene release tags, versions, and repackers', () => {
      expect(cleanGameTitle('Cyberpunk.2077.v2.12.REPACK-ELAMIGOS')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE')).toBe('Elden Ring Shadow of the Erdtree');
      expect(cleanGameTitle('The.Witcher.3.Wild.Hunt.GOTY-GOG')).toBe('The Witcher 3 Wild Hunt GOTY');
      expect(cleanGameTitle('Baldurs.Gate.3.v4.1.1.REPACK-FITGIRL')).toBe('Baldurs Gate 3');
    });

    it('cleans title IDs and update tags from ROM filenames', () => {
      expect(cleanGameTitle('The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0]')).toBe('The Legend of Zelda Tears of the Kingdom');
      expect(cleanGameTitle('The Last of Us [BCUS98174]')).toBe('The Last of Us');
    });

    it('cleans crack tags and supplemental release suffixes', () => {
      expect(cleanGameTitle('Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Elden.Ring.v1.12.Crackfix-RUNE')).toBe('Elden Ring');
      expect(cleanGameTitle('Cyberpunk.2077.Crack.Fix.v2-RUNE')).toBe('Cyberpunk 2077');
      expect(cleanGameTitle('Elden.Ring.v1.12.Crackfix.V2-RUNE')).toBe('Elden Ring');
      expect(cleanGameTitle('Hogwarts.Legacy.Crackfix.PROPER-EMPRESS')).toBe('Hogwarts Legacy');
      expect(cleanGameTitle('Red.Dead.Redemption.2.Crackfix.v2-EMPRESS')).toBe('Red Dead Redemption 2');
    });

    it('cleans sequence prefixes, space-separated update versions, and OS/arch flags', () => {
      expect(cleanGameTitle('1 - High On Life 2 update 20.02.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('2 - High On Life 2 update 04.03.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('3 - High On Life 2 update 13.03.2026 - 05.05.2026')).toBe('High On Life 2');
      expect(cleanGameTitle('Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('Baldurs Gate 3 update 5849914 6758295 ElAmigos.bin')).toBe('Baldurs Gate 3');
      expect(cleanGameTitle('1 - Tainted Grail The Fall of Avalon update 27.05.2025.exe')).toBe('Tainted Grail The Fall of Avalon');
      expect(cleanGameTitle('Hogwarts_Legacy_-_small_DLC_unlocker_+_CrackFix_Win11_24H2')).toBe('Hogwarts Legacy');
    });
  });

  describe('extractGroup', () => {
    it('detects common release groups', () => {
      expect(extractGroup('Cyberpunk.2077.REPACK-ELAMIGOS')).toBe('Elamigos');
      expect(extractGroup('Elden.Ring.Shadow.of.the.Erdtree.REPACK-RUNE')).toBe('Rune');
      expect(extractGroup('Baldurs.Gate.3.REPACK-FITGIRL')).toBe('Fitgirl');
      expect(extractGroup('Ghost.of.Tsushima-TENOKE')).toBe('Tenoke');
    });
  });

  describe('parseReleaseName', () => {
    it('parses platform, clean title, and group', () => {
      const parsed = parseReleaseName('The Legend of Zelda Tears of the Kingdom [0100F2C0115B6000][v0].nsp', '.nsp');
      expect(parsed.platform).toBe('Switch');
      expect(parsed.titleId).toBe('0100F2C0115B6000');
      expect(parsed.cleanTitle).toBe('The Legend of Zelda Tears of the Kingdom');
    });

    it('extracts editions', () => {
      const parsed = parseReleaseName('The.Witcher.3.Wild.Hunt.GOTY-GOG.iso', '.iso');
      expect(parsed.edition).toBe('GOTY');
    });

    it('does not confuse update dates or sequence prefixes with release years', () => {
      const parsed = parseReleaseName('2 - High On Life 2 update 04.03.2026');
      expect(parsed.cleanTitle).toBe('High On Life 2');
      expect(parsed.year).toBeFalsy();
    });

    it('identifies PS5 platform from title IDs or name tags', () => {
      const parsed = parseReleaseName('Dead.Cells.PS5-DUPLEX');
      expect(parsed.platform).toBe('PS5');
      expect(parsed.cleanTitle).toBe('Dead Cells');
    });
  });

  describe('classifyArtifact', () => {
    it('identifies noise executables and directories', () => {
      expect(classifyArtifact('UnityCrashHandler64.exe', '/Games/HollowKnight/UnityCrashHandler64.exe').skip).toBe(true);
      expect(classifyArtifact('dxsetup.exe', '/Redist/DirectX/dxsetup.exe').skip).toBe(true);
      expect(classifyArtifact('vcredist_x64.exe', '/Redist/vcredist_x64.exe').skip).toBe(true);
    });

    it('identifies container folder packages for repacks and games', () => {
      const repack = classifyArtifact('Baldurs Gate 3 Repack', '/Downloads/BG3', true, ['setup.exe', 'setup-1.bin']);
      expect(repack.isPackage).toBe(true);
      expect(repack.category).toBe('folder_repack');

      const installed = classifyArtifact('Hollow Knight', '/Games/Hollow Knight', true, ['HollowKnight.exe', 'Data']);
      expect(installed.isPackage).toBe(true);
      expect(installed.category).toBe('folder_game');
    });

    it('classifies updates and DLCs', () => {
      expect(classifyArtifact('update 2.12 - 2.13.exe', '/Cyberpunk/Updates/update.exe').category).toBe('update');
      expect(classifyArtifact('Blood and Wine DLC.exe', '/Witcher/DLC/dlc.exe').category).toBe('dlc');
    });

    it('identifies standalone crack supplement folders', () => {
      const crack = classifyArtifact('Cyberpunk.2077.v2.12.Crack.Only-ELAMIGOS', '/Downloads/Crack', true, [
        'apply_crack.exe',
        'steam_api64.dll',
        'steam_emu.ini',
      ]);
      expect(crack.isPackage).toBe(true);
      expect(crack.category).toBe('folder_crack');

      const crackfix = classifyArtifact('Elden.Ring.v1.12.Crackfix.V2-RUNE', '/Downloads/Crackfix', true, [
        'eldenring.exe',
        'steam_api64.dll',
        'steam_emu.ini',
      ]);
      expect(crackfix.isPackage).toBe(true);
      expect(crackfix.category).toBe('folder_crack');
    });

    it('identifies standalone crackfix executables and archive patches', () => {
      const exePatch = classifyArtifact('Cyberpunk.2077.v2.12.Crackfix-RUNE.exe', '/Downloads/Patch.exe');
      expect(exePatch.category).toBe('crack');
      expect(exePatch.isCrack).toBe(true);

      const zipPatch = classifyArtifact('Elden.Ring.Crackfix.v2.rar', '/Downloads/Crackfix.rar');
      expect(zipPatch.category).toBe('crack');
      expect(zipPatch.isCrack).toBe(true);
    });

    it('identifies game archives and distinguishes primary from secondary multi-part archives', () => {
      const singleRar = classifyArtifact('Celeste.v1.4.0.0.rar', '/Downloads/Celeste.v1.4.0.0.rar');
      expect(singleRar.category).toBe('archive');
      expect(singleRar.isPrimary).toBe(true);

      const single7z = classifyArtifact('IndieGame.Collection.2024-PROPHET.7z', '/Downloads/IndieGame.Collection.2024-PROPHET.7z');
      expect(single7z.category).toBe('archive');
      expect(single7z.isPrimary).toBe(true);

      const part1 = classifyArtifact('Call.Of.Duty.Black.Ops.2-SKIDROW.part01.rar', '/Downloads/Call.Of.Duty.Black.Ops.2-SKIDROW.part01.rar');
      expect(part1.category).toBe('archive');
      expect(part1.isPrimary).toBe(true);

      const part2 = classifyArtifact('Call.Of.Duty.Black.Ops.2-SKIDROW.part02.rar', '/Downloads/Call.Of.Duty.Black.Ops.2-SKIDROW.part02.rar');
      expect(part2.category).toBe('archive_part');
      expect(part2.isPrimary).toBe(false);
    });

    it('identifies console disc packages for PS3, PS4, and PS5', () => {
      const ps3Package = classifyArtifact('The Last of Us [BCUS98174]', '/ROMs/PS3/The Last of Us', true, [
        'PS3_GAME',
        'PS3_DISC.SFB',
      ]);
      expect(ps3Package.isPackage).toBe(true);
      expect(ps3Package.category).toBe('folder_console');
      expect(ps3Package.platform).toBe('PS3');

      const ps4Package = classifyArtifact('CUSA00411 - Bloodborne', '/ROMs/PS4/Bloodborne', true, [
        'eboot.bin',
        'sce_sys',
      ]);
      expect(ps4Package.isPackage).toBe(true);
      expect(ps4Package.category).toBe('folder_console');
      expect(ps4Package.platform).toBe('PS4');

      const ps5Package = classifyArtifact('Dead.Cells.PS5-DUPLEX', '/TODO/Dead.Cells.PS5-DUPLEX', true, [
        'duplex-dead.cells.ps5.sfv',
        'duplex.nfo',
        'PPSA15552-app0',
      ]);
      expect(ps5Package.isPackage).toBe(true);
      expect(ps5Package.category).toBe('folder_console');
      expect(ps5Package.platform).toBe('PS5');
    });

    it('identifies GOG multi-bin offline installers as folder packages', () => {
      const gogPackage = classifyArtifact('Cyberpunk 2077', '/GOG/Cyberpunk 2077', true, [
        'setup_cyberpunk_2077_2.12_(64bit)_(71844).exe',
        'setup_cyberpunk_2077_2.12_(64bit)_(71844)-1.bin',
        'setup_cyberpunk_2077_2.12_(64bit)_(71844)-2.bin',
      ]);
      expect(gogPackage.isPackage).toBe(true);
      expect(gogPackage.category).toBe('folder_repack');
    });
  });

  describe('analyzeRepackArchiveIntegrity', () => {
    it('detects missing elamigos prefix and suggests canonical rename', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'data-2.bin', 'elamigos-3.bin'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Elden.Ring.v1.12.REPACK-ELAMIGOS', 'ElAmigos');

      expect(analysis.isRepack).toBe(true);
      expect(analysis.archiveType).toBe('ElAmigos');
      expect(analysis.health).toBe('CORRECTABLE_ANOMALY');
      expect(analysis.suggestedRenames['data-2.bin']).toBe('elamigos-2.bin');

      const anomaly = analysis.anomalies.find((a: any) => a.type === 'MISSING_ELAMIGOS_PREFIX');
      expect(anomaly).toBeDefined();
      expect(anomaly.file).toBe('data-2.bin');
      expect(anomaly.suggested).toBe('elamigos-2.bin');
    });

    it('detects duplicate collisions such as Windows duplicate naming', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-2 (1).bin'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Elden.Ring.v1.12.REPACK-ELAMIGOS', 'ElAmigos');

      expect(analysis.health).toBe('CORRECTABLE_ANOMALY');
      expect(analysis.suggestedRenames['elamigos-2 (1).bin']).toBe('elamigos-2.bin');
      expect(analysis.anomalies.some((a: any) => a.type === 'DUPLICATE_NAME_COLLISION')).toBe(true);
    });

    it('detects incomplete download parts and flags package health', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-2.bin.part'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Cyberpunk.REPACK-ELAMIGOS', 'ElAmigos');

      expect(analysis.health).toBe('INCOMPLETE_DOWNLOAD');
      expect(analysis.anomalies.some((a: any) => a.type === 'INCOMPLETE_DOWNLOAD')).toBe(true);
    });

    it('detects sequence gaps in multi-part repack packages', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-3.bin'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Elden.Ring.REPACK-ELAMIGOS', 'ElAmigos');

      const gap = analysis.anomalies.find((a: any) => a.type === 'MISSING_SEQUENCE_CHUNK');
      expect(gap).toBeDefined();
      expect(gap.missing).toBe('elamigos-2.bin');
    });

    it('detects FitGirl naming anomalies', () => {
      const files = ['setup.exe', 'data-1.bin', 'data-2.bin'];
      const analysis = analyzeRepackArchiveIntegrity(files, 'Baldurs.Gate.3.REPACK-FITGIRL', 'FitGirl');

      expect(analysis.archiveType).toBe('FitGirl');
      expect(analysis.suggestedRenames['data-1.bin']).toBe('setup-fitgirl-1.bin');
    });
  });

  describe('runSimulation', () => {
    it('runs sample simulation and produces structured metrics and actionable items', () => {
      const sim = runSimulation('', { sample: true, preset: 'standard' });
      expect(sim.isSample).toBe(true);
      expect(sim.totalScanned).toBeGreaterThan(15);
      expect(sim.noiseFiltered).toBeGreaterThan(0);
      expect(sim.actionableItems.length).toBeGreaterThan(10);
      expect(sim.metrics.healedPackages).toBeGreaterThanOrEqual(1);
      expect(sim.metrics.cracks).toBeGreaterThanOrEqual(1);

      // Verify secondary updates are properly routed
      const updateItem = sim.actionableItems.find((i: any) => i.status === 'SECONDARY_UPDATE');
      expect(updateItem).toBeDefined();
      expect(updateItem.targetRelative).toContain('/Updates/');

      // Verify secondary DLCs are properly routed
      const dlcItem = sim.actionableItems.find((i: any) => i.status === 'SECONDARY_DLC');
      expect(dlcItem).toBeDefined();
      expect(dlcItem.targetRelative).toContain('/DLC/');

      // Verify secondary cracks are properly routed
      const crackItem = sim.actionableItems.find((i: any) => i.status === 'SECONDARY_CRACK');
      expect(crackItem).toBeDefined();
      expect(crackItem.targetRelative).toContain('/Crack/');

      // Verify container packages stay intact
      const packageItem = sim.actionableItems.find((i: any) => i.status === 'CONTAINER_PACKAGE');
      expect(packageItem).toBeDefined();
      expect(packageItem.isPackage).toBe(true);
    });

    it('resolves conflicts when auto disambiguation is enabled', () => {
      const sim = runSimulation('', { sample: true, resolveConflicts: 'auto' });
      expect(sim.metrics.conflicts).toBe(0);
    });

    it('executes scale simulation across thousands of items with high throughput', () => {
      const sim = runSimulation('', { scale: 1000, resolveConflicts: 'auto' });
      expect(sim.totalScanned).toBe(1000);
      expect(sim.actionableItems.length).toBeGreaterThan(900);
      expect(sim.noiseFiltered).toBeGreaterThan(0);
      expect(sim.metrics.packages).toBeGreaterThan(100);
      expect(sim.elapsedMs).toBeLessThan(1000);
      expect(sim.metrics.conflicts).toBe(0);
    });
  });
});
