import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveUncPath,
  unresolveUncPath,
  registerMachineMapping,
  syncMachineMappings,
  getRegisteredMachineMappings,
} from '../unc-resolver';

describe('UNC Resolver', () => {
  beforeEach(() => {
    registerMachineMapping('SERVER', '192.168.1.58');
  });

  it('resolves machine hostname in Windows UNC path to machine IP address', () => {
    const raw = '\\\\SERVER\\Games\\';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\Games\\');
  });

  it('resolves subdirectories and game folders with correct backslashes', () => {
    const raw = '\\\\SERVER\\Games\\God of War [PC]\\Updates\\patch.exe';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\Games\\God of War [PC]\\Updates\\patch.exe');
  });

  it('resolves case-insensitively', () => {
    const raw = '\\\\server\\downloads\\setup.exe';
    const resolved = resolveUncPath(raw);
    expect(resolved).toBe('\\\\192.168.1.58\\downloads\\setup.exe');
  });

  it('unresolves IP-based UNC path back to display machine name', () => {
    const ipPath = '\\\\192.168.1.58\\Games\\Kingdom Hearts III';
    const displayPath = unresolveUncPath(ipPath);
    expect(displayPath).toBe('\\\\SERVER\\Games\\Kingdom Hearts III');
  });

  it('leaves local drive paths unmodified', () => {
    expect(resolveUncPath('C:\\Games\\Steam')).toBe('C:\\Games\\Steam');
    expect(unresolveUncPath('C:\\Games\\Steam')).toBe('C:\\Games\\Steam');
    expect(resolveUncPath('D:/ISOs/file.iso')).toBe('D:/ISOs/file.iso');
  });

  it('leaves already-IP paths unmodified when resolving', () => {
    expect(resolveUncPath('\\\\192.168.1.58\\Games')).toBe('\\\\192.168.1.58\\Games');
  });

  it('supports registering new machines dynamically from nodes', () => {
    syncMachineMappings([
      { name: 'NAS-UNRAID', host: '10.0.0.15' },
      { name: 'TrueNAS-Core', smbHost: '192.168.1.99' },
      { name: 'RemoteNode', localUrl: 'http://192.168.1.200:8090' },
    ]);

    expect(resolveUncPath('\\\\NAS-UNRAID\\storage\\roms')).toBe('\\\\10.0.0.15\\storage\\roms');
    expect(resolveUncPath('\\\\TrueNAS-Core\\media\\games')).toBe('\\\\192.168.1.99\\media\\games');
    expect(resolveUncPath('\\\\RemoteNode\\library')).toBe('\\\\192.168.1.200\\library');

    expect(unresolveUncPath('\\\\10.0.0.15\\storage\\roms')).toBe('\\\\NAS-UNRAID\\storage\\roms');
    expect(unresolveUncPath('\\\\192.168.1.99\\media\\games')).toBe('\\\\TrueNAS-Core\\media\\games');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(resolveUncPath('')).toBe('');
    expect(unresolveUncPath('')).toBe('');
    expect(resolveUncPath(null as any)).toBe(null);
  });
});
