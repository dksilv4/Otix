import { execSync } from 'child_process';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';

export interface CurrentNetworkInfo {
  ssid: string;
  bssid: string;
  gatewayIp: string;
  gatewayMac: string;
  localIp: string;
  isWifi: boolean;
}

export interface HomeNetworkProfile {
  wifiSsid?: string;
  gatewayMac?: string;
  bssid?: string;
  localServerUrl?: string;
}

export type HomeVerificationStatus =
  | 'verified_home'
  | 'duplicate_ssid_foreign'
  | 'roaming_away'
  | 'offline';

export interface HomeVerificationResult {
  status: HomeVerificationStatus;
  details: {
    currentSsid?: string;
    currentBssid?: string;
    currentGatewayMac?: string;
    hardwareMatched: boolean;
    serverPingOk: boolean;
    reason: string;
  };
}

/** Standardize MAC address to lowercase colon-delimited format (aa:bb:cc:dd:ee:ff) */
export function normalizeMac(mac: string | undefined | null): string {
  if (!mac) return '';
  const cleaned = mac.trim().toLowerCase().replace(/[^0-9a-f]/g, '');
  if (cleaned.length !== 12) return '';
  return cleaned.match(/.{1,2}/g)?.join(':') || '';
}

/** Get primary local IPv4 address */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '';
}

/**
 * Parses default gateway IP and MAC address across platforms.
 */
export function detectDefaultGateway(): { gatewayIp: string; gatewayMac: string } {
  const platform = process.platform;
  let gatewayIp = '';
  let gatewayMac = '';

  try {
    if (platform === 'darwin') {
      // route -n get default
      try {
        const routeOut = execSync('route -n get default', { encoding: 'utf8', timeout: 1500 });
        const m = routeOut.match(/gateway:\s+([0-9.]+)/i);
        if (m) gatewayIp = m[1].trim();
      } catch {
        // Fallback or ignore
      }

      if (gatewayIp) {
        try {
          const arpOut = execSync(`arp -n ${gatewayIp}`, { encoding: 'utf8', timeout: 1500 });
          const mMac = arpOut.match(/at\s+([0-9a-f:]+)\s+on/i);
          if (mMac) gatewayMac = normalizeMac(mMac[1]);
        } catch {
          // Ignore
        }
      }
    } else if (platform === 'win32') {
      // route print 0.0.0.0
      try {
        const routeOut = execSync('route print 0.0.0.0', { encoding: 'utf8', timeout: 1500 });
        const lines = routeOut.split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 4 && parts[0] === '0.0.0.0' && parts[1] === '0.0.0.0') {
            gatewayIp = parts[2];
            break;
          }
        }
      } catch {
        // Fallback
      }

      if (gatewayIp) {
        try {
          const arpOut = execSync(`arp -a ${gatewayIp}`, { encoding: 'utf8', timeout: 1500 });
          const mMac = arpOut.match(/([0-9a-f]{2}(?:-[0-9a-f]{2}){5})/i);
          if (mMac) gatewayMac = normalizeMac(mMac[1]);
        } catch {
          // Ignore
        }
      }
    } else if (platform === 'linux') {
      // ip route show default
      try {
        const routeOut = execSync('ip route show default', { encoding: 'utf8', timeout: 1500 });
        const m = routeOut.match(/default\s+via\s+([0-9.]+)/i);
        if (m) gatewayIp = m[1].trim();
      } catch {
        // Fallback
      }

      if (gatewayIp) {
        try {
          const arpOut = execSync(`ip neigh show ${gatewayIp}`, { encoding: 'utf8', timeout: 1500 });
          const mMac = arpOut.match(/lladdr\s+([0-9a-f:]+)/i);
          if (mMac) gatewayMac = normalizeMac(mMac[1]);
        } catch {
          // Fallback to arp -n
          try {
            const arpFallback = execSync(`arp -n ${gatewayIp}`, { encoding: 'utf8', timeout: 1500 });
            const mFallback = arpFallback.match(/([0-9a-f:]+)\s+[a-z0-9]+\s+[a-z0-9]+/i);
            if (mFallback) gatewayMac = normalizeMac(mFallback[1]);
          } catch {
            // Ignore
          }
        }
      }
    }
  } catch {
    // Top-level catch to ensure safe operation
  }

  return { gatewayIp, gatewayMac };
}

/**
 * Detect current Wi-Fi SSID and BSSID across platforms.
 */
export function detectWifiDetails(): { ssid: string; bssid: string } {
  const platform = process.platform;
  let ssid = '';
  let bssid = '';

  try {
    if (platform === 'darwin') {
      // macOS airport command
      const airportPath =
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
      try {
        const out = execSync(`${airportPath} -I`, { encoding: 'utf8', timeout: 1500 });
        const mSsid = out.match(/^\s*SSID:\s*(.+)$/im);
        if (mSsid) ssid = mSsid[1].trim();
        const mBssid = out.match(/^\s*BSSID:\s*([0-9a-f:]+)$/im);
        if (mBssid) bssid = normalizeMac(mBssid[1]);
      } catch {
        // Fallback: networksetup -getairportnetwork
        try {
          const out = execSync('networksetup -getairportnetwork en0', {
            encoding: 'utf8',
            timeout: 1500,
          });
          const m = out.match(/Current Wi-Fi Network:\s*(.+)$/i);
          if (m) ssid = m[1].trim();
        } catch {
          // Ignore
        }
      }
    } else if (platform === 'win32') {
      // Windows netsh wlan show interfaces
      try {
        const out = execSync('netsh wlan show interfaces', { encoding: 'utf8', timeout: 1500 });
        const lines = out.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('SSID') && !trimmed.startsWith('SSID name') && !trimmed.startsWith('BSSID')) {
            const parts = trimmed.split(':');
            if (parts.length >= 2) ssid = parts.slice(1).join(':').trim();
          } else if (trimmed.startsWith('BSSID')) {
            const parts = trimmed.split(':');
            if (parts.length >= 2) bssid = normalizeMac(parts.slice(1).join(':').trim());
          }
        }
      } catch {
        // Ignore
      }
    } else if (platform === 'linux') {
      // Linux nmcli or iwgetid
      try {
        const out = execSync('nmcli -t -f active,ssid,bssid dev wifi', {
          encoding: 'utf8',
          timeout: 1500,
        });
        const lines = out.split('\n');
        for (const line of lines) {
          const parts = line.split(':');
          if (parts[0] === 'yes') {
            ssid = parts[1] || '';
            // BSSID is parts[2..] rejoined
            bssid = normalizeMac(parts.slice(2).join(':'));
            break;
          }
        }
      } catch {
        try {
          const outSsid = execSync('iwgetid -r', { encoding: 'utf8', timeout: 1500 });
          ssid = outSsid.trim();
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore error
  }

  return { ssid, bssid };
}

/**
 * Aggregates all current network properties.
 */
export function detectCurrentNetwork(): CurrentNetworkInfo {
  const wifi = detectWifiDetails();
  const gateway = detectDefaultGateway();
  const localIp = getLocalIp();

  return {
    ssid: wifi.ssid,
    bssid: wifi.bssid,
    gatewayIp: gateway.gatewayIp,
    gatewayMac: gateway.gatewayMac,
    localIp,
    isWifi: Boolean(wifi.ssid),
  };
}

/**
 * Probes the local server endpoint to verify identity and presence on the LAN.
 */
export async function probeLocalServer(targetUrl: string, timeoutMs = 2000): Promise<boolean> {
  if (!targetUrl) return false;

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(targetUrl);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      // Probe /api/v1/ping or root
      const pingPath = urlObj.pathname.endsWith('/')
        ? `${urlObj.pathname}api/v1/ping`
        : `${urlObj.pathname}/api/v1/ping`;
      const fullUrl = `${urlObj.protocol}//${urlObj.host}${pingPath}`;

      const req = client.get(
        fullUrl,
        {
          timeout: timeoutMs,
          headers: { Accept: 'application/json, text/plain, */*' },
        },
        (res) => {
          // Drain body
          res.on('data', () => {});
          res.on('end', () => {
            // Any response from 200 to 404 indicates machine is physically present and serving HTTP
            if (res.statusCode && res.statusCode < 500) {
              resolve(true);
            } else {
              resolve(false);
            }
          });
        }
      );

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

export interface VerifyHomeOptions {
  currentNet?: CurrentNetworkInfo;
  serverProber?: (url: string, timeoutMs?: number) => Promise<boolean>;
}

/**
 * Multi-layer Home Network Verification Logic.
 */
export async function verifyHomeNetwork(
  profile: HomeNetworkProfile,
  optionsOrNet?: CurrentNetworkInfo | VerifyHomeOptions
): Promise<HomeVerificationResult> {
  let current: CurrentNetworkInfo;
  let prober = probeLocalServer;

  if (optionsOrNet && 'localIp' in optionsOrNet) {
    current = optionsOrNet;
  } else if (optionsOrNet) {
    current = optionsOrNet.currentNet || detectCurrentNetwork();
    if (optionsOrNet.serverProber) {
      prober = optionsOrNet.serverProber;
    }
  } else {
    current = detectCurrentNetwork();
  }

  // If no IP at all, we are offline
  if (!current.localIp) {
    return {
      status: 'offline',
      details: {
        hardwareMatched: false,
        serverPingOk: false,
        reason: 'No local network interface or IP address available.',
      },
    };
  }

  const profileSsid = (profile.wifiSsid || '').trim().toLowerCase();
  const profileGatewayMac = normalizeMac(profile.gatewayMac);
  const profileBssid = normalizeMac(profile.bssid);
  const currentSsid = (current.ssid || '').trim().toLowerCase();
  const currentBssid = normalizeMac(current.bssid);
  const currentGatewayMac = normalizeMac(current.gatewayMac);

  // If a Home Wi-Fi profile is set:
  if (profileSsid) {
    // 1. Check SSID
    if (!currentSsid || currentSsid !== profileSsid) {
      return {
        status: 'roaming_away',
        details: {
          currentSsid: current.ssid,
          currentBssid: current.bssid,
          currentGatewayMac: current.gatewayMac,
          hardwareMatched: false,
          serverPingOk: false,
          reason: `Current Wi-Fi (${current.ssid || 'None/Ethernet'}) does not match home Wi-Fi (${profile.wifiSsid}).`,
        },
      };
    }

    // 2. SSID matches! Now verify physical hardware (BSSID or Gateway MAC)
    const hasHardwareProfile = Boolean(profileGatewayMac || profileBssid);
    let hardwareMatched = false;

    if (hasHardwareProfile) {
      if (profileBssid && currentBssid && profileBssid === currentBssid) {
        hardwareMatched = true;
      }
      if (profileGatewayMac && currentGatewayMac && profileGatewayMac === currentGatewayMac) {
        hardwareMatched = true;
      }

      if (!hardwareMatched) {
        // Crucial Case: Same Wi-Fi SSID, but completely different router/AP hardware!
        return {
          status: 'duplicate_ssid_foreign',
          details: {
            currentSsid: current.ssid,
            currentBssid: current.bssid,
            currentGatewayMac: current.gatewayMac,
            hardwareMatched: false,
            serverPingOk: false,
            reason: `Wi-Fi name matches “${profile.wifiSsid}”, but router hardware MAC does not match home profile (Foreign Network).`,
          },
        };
      }
    } else {
      hardwareMatched = true;
    }

    // 3. Hardware verified (or no hardware profile specified). Now probe local server if configured
    let serverPingOk = true;
    if (profile.localServerUrl) {
      serverPingOk = await prober(profile.localServerUrl);
      if (!serverPingOk) {
        return {
          status: 'duplicate_ssid_foreign',
          details: {
            currentSsid: current.ssid,
            currentBssid: current.bssid,
            currentGatewayMac: current.gatewayMac,
            hardwareMatched,
            serverPingOk: false,
            reason: `Wi-Fi matches, but home server at ${profile.localServerUrl} is unreachable on this LAN.`,
          },
        };
      }
    }

    return {
      status: 'verified_home',
      details: {
        currentSsid: current.ssid,
        currentBssid: current.bssid,
        currentGatewayMac: current.gatewayMac,
        hardwareMatched,
        serverPingOk,
        reason: 'Successfully verified home Wi-Fi, hardware MAC, and local server presence.',
      },
    };
  }

  // If no SSID was configured on Home profile, check if localServerUrl is reachable on this network
  if (profile.localServerUrl) {
    const serverPingOk = await prober(profile.localServerUrl);
    if (serverPingOk) {
      return {
        status: 'verified_home',
        details: {
          currentSsid: current.ssid,
          currentBssid: current.bssid,
          currentGatewayMac: current.gatewayMac,
          hardwareMatched: true,
          serverPingOk: true,
          reason: `Local server at ${profile.localServerUrl} responded successfully on this network.`,
        },
      };
    }
  }

  return {
    status: 'roaming_away',
    details: {
      currentSsid: current.ssid,
      currentBssid: current.bssid,
      currentGatewayMac: current.gatewayMac,
      hardwareMatched: false,
      serverPingOk: false,
      reason: 'No matching home network profile or local server found.',
    },
  };
}
