import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import { loadDesktopSettings, saveDesktopSettings, getSettings } from '../desktop-settings';

vi.mock('fs');

describe('desktop-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads default settings including hardwareAcceleration enabled by default', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    const settings = loadDesktopSettings();
    expect(settings).toBeDefined();
    expect(settings.hardwareAcceleration).toBe(true);
    expect(settings.launchOnStartup).toBe(false);
    expect(settings.closeToTray).toBe(false);
  });

  it('preserves hardwareAcceleration=false when loaded from disk', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        hardwareAcceleration: false,
        closeToTray: true,
      })
    );

    const settings = loadDesktopSettings();
    expect(settings.hardwareAcceleration).toBe(false);
    expect(settings.closeToTray).toBe(true);
  });

  it('saves settings to disk correctly', () => {
    const current = getSettings();
    saveDesktopSettings({ ...current, hardwareAcceleration: false });

    expect(fs.writeFileSync).toHaveBeenCalled();
    const [savedPath, savedContent] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(String(savedPath)).toContain('desktop-settings.json');
    expect(String(savedContent)).toContain('"hardwareAcceleration": false');
  });
});
