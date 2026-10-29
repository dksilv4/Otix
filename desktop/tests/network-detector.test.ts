import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeMac,
  verifyHomeNetwork,
  HomeNetworkProfile,
  CurrentNetworkInfo,
} from '../network-detector';
import * as networkDetector from '../network-detector';

describe('network-detector', () => {
  describe('normalizeMac', () => {
    it('normalizes colons, hyphens, and mixed case MAC addresses', () => {
      expect(normalizeMac('AA:BB:CC:DD:EE:FF')).toBe('aa:bb:cc:dd:ee:ff');
      expect(normalizeMac('aa-bb-cc-dd-ee-ff')).toBe('aa:bb:cc:dd:ee:ff');
      expect(normalizeMac('aabb.ccdd.eeff')).toBe('aa:bb:cc:dd:ee:ff');
      expect(normalizeMac('AABBCCDDEEFF')).toBe('aa:bb:cc:dd:ee:ff');
    });

    it('returns empty string for invalid or missing MAC addresses', () => {
      expect(normalizeMac('')).toBe('');
      expect(normalizeMac(undefined)).toBe('');
      expect(normalizeMac(null)).toBe('');
      expect(normalizeMac('12:34')).toBe('');
      expect(normalizeMac('not-a-mac')).toBe('');
    });
  });

  describe('verifyHomeNetwork', () => {
    const mockHomeProfile: HomeNetworkProfile = {
      wifiSsid: 'MySweetHome',
      gatewayMac: 'aa:bb:cc:11:22:33',
      bssid: 'aa:bb:cc:dd:ee:01',
      localServerUrl: 'http://192.168.1.100:8090',
    };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('detects verified_home when SSID, BSSID, and local server match', async () => {
      const currentNet: CurrentNetworkInfo = {
        ssid: 'MySweetHome',
        bssid: 'aa:bb:cc:dd:ee:01',
        gatewayIp: '192.168.1.1',
        gatewayMac: 'aa:bb:cc:11:22:33',
        localIp: '192.168.1.50',
        isWifi: true,
      };

      const result = await verifyHomeNetwork(mockHomeProfile, {
        currentNet,
        serverProber: async () => true,
      });
      expect(result.status).toBe('verified_home');
      expect(result.details.hardwareMatched).toBe(true);
      expect(result.details.serverPingOk).toBe(true);
    });

    it('detects verified_home on mesh Wi-Fi when BSSID differs but Gateway MAC matches', async () => {
      const currentNet: CurrentNetworkInfo = {
        ssid: 'MySweetHome',
        bssid: 'aa:bb:cc:dd:ee:99', // Different satellite AP BSSID
        gatewayIp: '192.168.1.1',
        gatewayMac: 'aa:bb:cc:11:22:33', // Same router Gateway MAC!
        localIp: '192.168.1.55',
        isWifi: true,
      };

      const result = await verifyHomeNetwork(mockHomeProfile, {
        currentNet,
        serverProber: async () => true,
      });
      expect(result.status).toBe('verified_home');
      expect(result.details.hardwareMatched).toBe(true);
      expect(result.details.serverPingOk).toBe(true);
    });

    it('detects duplicate_ssid_foreign when Wi-Fi name matches but router hardware MAC is completely different', async () => {
      // User is at a friend's house or cafe with the exact same SSID "MySweetHome"
      const currentNet: CurrentNetworkInfo = {
        ssid: 'MySweetHome',
        bssid: 'ff:ee:dd:cc:bb:aa', // Unknown foreign AP
        gatewayIp: '192.168.1.1',
        gatewayMac: '00:11:22:33:44:55', // Unknown foreign router
        localIp: '192.168.1.22',
        isWifi: true,
      };

      const result = await verifyHomeNetwork(mockHomeProfile, currentNet);
      expect(result.status).toBe('duplicate_ssid_foreign');
      expect(result.details.hardwareMatched).toBe(false);
      expect(result.details.reason).toContain('Foreign Network');
    });

    it('detects duplicate_ssid_foreign when SSID matches but local server fails to respond', async () => {
      const currentNet: CurrentNetworkInfo = {
        ssid: 'MySweetHome',
        bssid: 'aa:bb:cc:dd:ee:01',
        gatewayIp: '192.168.1.1',
        gatewayMac: 'aa:bb:cc:11:22:33',
        localIp: '192.168.1.50',
        isWifi: true,
      };

      // Server cannot be reached on this LAN
      const result = await verifyHomeNetwork(mockHomeProfile, {
        currentNet,
        serverProber: async () => false,
      });
      expect(result.status).toBe('duplicate_ssid_foreign');
      expect(result.details.serverPingOk).toBe(false);
      expect(result.details.reason).toContain('unreachable on this LAN');
    });

    it('detects roaming_away when connected to a different Wi-Fi', async () => {
      const currentNet: CurrentNetworkInfo = {
        ssid: 'Starbucks_WiFi',
        bssid: '99:88:77:66:55:44',
        gatewayIp: '10.0.0.1',
        gatewayMac: '99:88:77:00:11:22',
        localIp: '10.0.0.12',
        isWifi: true,
      };

      const result = await verifyHomeNetwork(mockHomeProfile, currentNet);
      expect(result.status).toBe('roaming_away');
      expect(result.details.hardwareMatched).toBe(false);
    });

    it('detects offline when no local IP is assigned', async () => {
      const currentNet: CurrentNetworkInfo = {
        ssid: '',
        bssid: '',
        gatewayIp: '',
        gatewayMac: '',
        localIp: '',
        isWifi: false,
      };

      const result = await verifyHomeNetwork(mockHomeProfile, currentNet);
      expect(result.status).toBe('offline');
    });
  });
});
