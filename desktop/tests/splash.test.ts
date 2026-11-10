import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BrowserWindow } from 'electron';
import { createSplashWindow, closeSplashWindow } from '../boot/splash';
import { setSplashWindow, isUpdateDownloading } from '../ipc/updater';

vi.mock('electron', () => {
  const EventEmitter = require('events');
  class MockBrowserWindow extends EventEmitter {
    width: number;
    height: number;
    isDestroyedVal = false;
    visibleVal = false;
    webContents = {
      send: vi.fn(),
    };
    constructor(public options: any) {
      super();
      this.width = options.width;
      this.height = options.height;
    }
    loadFile = vi.fn().mockResolvedValue(undefined);
    show = vi.fn().mockImplementation(() => { this.visibleVal = true; });
    focus = vi.fn();
    close = vi.fn().mockImplementation(() => { this.isDestroyedVal = true; });
    destroy = vi.fn().mockImplementation(() => { this.isDestroyedVal = true; });
    isDestroyed() { return this.isDestroyedVal; }
    isVisible() { return this.visibleVal; }
  }

  return {
    BrowserWindow: MockBrowserWindow,
    app: {
      isPackaged: false,
      getVersion: () => '0.1.0',
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    },
  };
});

describe('Splash Window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates splash window with correct dimensions, frameless style, and non-interactive settings', () => {
    const splash = createSplashWindow();

    expect(splash).toBeDefined();
    expect((splash as any).options.width).toBe(320);
    expect((splash as any).options.height).toBe(360);
    expect((splash as any).options.frame).toBe(false);
    expect((splash as any).options.resizable).toBe(false);
    expect((splash as any).options.maximizable).toBe(false);
    expect((splash as any).options.minimizable).toBe(false);
    expect((splash as any).options.backgroundColor).toBe('#07080a');
    expect((splash as any).options.center).toBe(true);
  });

  it('safely closes splash window without throwing', () => {
    const splash = createSplashWindow();
    expect(() => closeSplashWindow(splash)).not.toThrow();
    expect(splash.close).toHaveBeenCalledTimes(1);

    // Call again on already destroyed window
    expect(() => closeSplashWindow(splash)).not.toThrow();

    // Call on null
    expect(() => closeSplashWindow(null)).not.toThrow();
  });

  it('forwards updater status updates to the splash window', () => {
    const splash = createSplashWindow();
    setSplashWindow(splash);

    expect(splash.webContents.send).toHaveBeenCalledWith('splash:status', expect.any(Object));
  });

  it('isUpdateDownloading returns correct boolean', () => {
    expect(typeof isUpdateDownloading()).toBe('boolean');
  });
});
