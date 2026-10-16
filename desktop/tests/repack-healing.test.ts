import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  analyzeRepackArchiveIntegrity,
  diagnoseArchiveIntegrity,
  healRepackArchive,
} from '../downloads/healing';

describe('desktop/downloads/healing', () => {
  describe('analyzeRepackArchiveIntegrity', () => {
    it('detects missing elamigos prefix and maps canonical names', () => {
      const files = ['setup.exe', 'setup-1.bin', 'data-2.bin', 'elamigos-3.bin'];
      const diag = analyzeRepackArchiveIntegrity(files, 'Elden.Ring.v1.12.REPACK-ELAMIGOS', 'ElAmigos');

      expect(diag.isRepack).toBe(true);
      expect(diag.archiveType).toBe('ElAmigos');
      expect(diag.health).toBe('CORRECTABLE_ANOMALY');
      expect(diag.suggestedRenames['setup-1.bin']).toBe('elamigos-1.bin');
      expect(diag.suggestedRenames['data-2.bin']).toBe('elamigos-2.bin');
    });

    it('detects Windows duplicate download collision (1).bin', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-2 (1).bin'];
      const diag = analyzeRepackArchiveIntegrity(files, 'Cyberpunk.2077.REPACK-ELAMIGOS');

      expect(diag.health).toBe('CORRECTABLE_ANOMALY');
      expect(diag.suggestedRenames['elamigos-2 (1).bin']).toBe('elamigos-2.bin');
    });

    it('detects incomplete download parts', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-2.bin.part'];
      const diag = analyzeRepackArchiveIntegrity(files, 'Cyberpunk.2077.REPACK-ELAMIGOS');

      expect(diag.health).toBe('INCOMPLETE_DOWNLOAD');
      expect(diag.anomalies.some((a) => a.type === 'INCOMPLETE_DOWNLOAD')).toBe(true);
    });

    it('detects sequence gaps in multi-part repack packages', () => {
      const files = ['setup.exe', 'elamigos-1.bin', 'elamigos-3.bin'];
      const diag = analyzeRepackArchiveIntegrity(files, 'Cyberpunk.2077.REPACK-ELAMIGOS');

      const gap = diag.anomalies.find((a) => a.type === 'MISSING_SEQUENCE_CHUNK');
      expect(gap).toBeDefined();
      expect(gap?.missing).toBe('elamigos-2.bin');
    });

    it('detects FitGirl non-prefixed bin files', () => {
      const files = ['setup.exe', 'data-1.bin', 'data-2.bin'];
      const diag = analyzeRepackArchiveIntegrity(files, 'Baldurs.Gate.3.REPACK-FITGIRL', 'FitGirl');

      expect(diag.archiveType).toBe('FitGirl');
      expect(diag.suggestedRenames['data-1.bin']).toBe('setup-fitgirl-1.bin');
    });
  });

  describe('healRepackArchive on filesystem', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'otix-heal-test-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('diagnoses and renames malformed repack files on disk to canonical filenames', async () => {
      // Setup malformed folder structure
      await fs.writeFile(path.join(tmpDir, 'setup.exe'), 'mock-setup');
      await fs.writeFile(path.join(tmpDir, 'setup-1.bin'), 'chunk-1');
      await fs.writeFile(path.join(tmpDir, 'elamigos-2 (1).bin'), 'chunk-2');

      // Diagnose before healing
      const diagBefore = await diagnoseArchiveIntegrity(tmpDir);
      expect(diagBefore.isRepack).toBe(true);
      expect(diagBefore.health).toBe('CORRECTABLE_ANOMALY');
      expect(diagBefore.suggestedRenames['setup-1.bin']).toBe('elamigos-1.bin');
      expect(diagBefore.suggestedRenames['elamigos-2 (1).bin']).toBe('elamigos-2.bin');

      // Execute healing
      const healResult = await healRepackArchive(tmpDir);
      expect(healResult.renamed.length).toBe(2);
      expect(healResult.renamed.every((r) => r.success)).toBe(true);

      // Verify files on disk
      const entries = await fs.readdir(tmpDir);
      expect(entries).toContain('elamigos-1.bin');
      expect(entries).toContain('elamigos-2.bin');
      expect(entries).not.toContain('setup-1.bin');
      expect(entries).not.toContain('elamigos-2 (1).bin');

      // Diagnose after healing
      const diagAfter = await diagnoseArchiveIntegrity(tmpDir);
      expect(diagAfter.health).toBe('HEALTHY');
      expect(Object.keys(diagAfter.suggestedRenames).length).toBe(0);
    });
  });
});
