import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import * as netSocket from 'net';
import { net, type WebContents } from 'electron';
import { getApiBaseUrl } from './config';

export type DaemonLifecycleState = 'stopped' | 'starting' | 'running' | 'error' | 'stopping';

export interface NodeDaemonStatus {
  state: DaemonLifecycleState;
  running: boolean;
  starting: boolean;
  embedded: boolean;
  port: number;
  url: string;
  pid: number | null;
  error?: string | null;
  version?: string | null;
}

export interface NodeDaemonOptions {
  port?: number;
  configPath?: string;
  authToken?: string;
}

/** Check if a TCP port is available on the specified host */
export async function isPortAvailable(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = netSocket.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, host);
  });
}

/** Search sequentially for the next available TCP port starting from startPort */
export async function findAvailablePort(startPort = 8090, maxAttempts = 50, host = '127.0.0.1'): Promise<number> {
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    if (await isPortAvailable(port, host)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port in range ${startPort}-${startPort + maxAttempts - 1}`);
}

export class NodeDaemonManager {
  private childProcess: ChildProcess | null = null;
  private isEmbeddedProcess = false;
  private currentPort = 8090;
  private webContents: WebContents | null = null;
  private lastError: string | null = null;
  private cachedVersion: string | null = null;
  private currentAuthToken = '';
  private currentState: DaemonLifecycleState = 'stopped';

  constructor(
    private readonly userDataPath: string,
    private readonly resourcesPath?: string,
  ) {}

  /** Set webContents to forward status updates to renderer */
  public setWebContents(wc: WebContents | null): void {
    this.webContents = wc;
    if (wc && !wc.isDestroyed()) {
      this.notifyStatus(false);
    }
  }

  /** Set user auth token to auto-claim companion node on launch */
  public setAuthToken(token: string): void {
    this.currentAuthToken = token;
    if (token && (this.currentState === 'running' || this.childProcess || this.isEmbeddedProcess)) {
      void this.ensureClaimed(token);
    } else if (!token && this.currentState === 'running') {
      void this.unclaim();
    }
  }

  /** Resolve the absolute path to the otix-node binary */
  public resolveBinaryPath(): string | null {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'otix-node.exe' : 'otix-node';

    const candidates: string[] = [];

    // 1. Packaged Electron resources directory
    if (this.resourcesPath) {
      candidates.push(path.join(this.resourcesPath, 'bin', binaryName));
    }

    // 2. Local desktop/bin directory (repo or dev)
    candidates.push(path.join(__dirname, '..', 'bin', binaryName));

    // 3. Built node/dist output directory
    const repoDist = path.join(__dirname, '..', '..', 'node', 'dist');
    candidates.push(path.join(repoDist, binaryName));

    if (process.platform === 'darwin') {
      candidates.push(path.join(repoDist, 'otix-node-darwin-universal'));
      candidates.push(path.join(repoDist, `otix-node-darwin-${process.arch}`));
      candidates.push(path.join(repoDist, 'Otix Node.app', 'Contents', 'MacOS', 'otix-node'));
    } else if (process.platform === 'win32') {
      candidates.push(path.join(repoDist, 'otix-node-windows-amd64.exe'));
    } else {
      candidates.push(path.join(repoDist, `otix-node-linux-${process.arch}`));
      candidates.push(path.join(repoDist, 'otix-node-linux-amd64'));
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          // Verify file is executable or at least accessible
          fs.accessSync(candidate, fs.constants.R_OK);
          return candidate;
        } catch {
          // continue checking
        }
      }
    }

    return null;
  }

  /** Check if an Otix Node service is responding on the specified port */
  public async probeNode(port = this.currentPort, timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/v1/status`, { timeout: timeoutMs }, (res) => {
        const isOk = res.statusCode === 200;
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (isOk) {
            try {
              const parsed = JSON.parse(body);
              if (parsed.version) {
                this.cachedVersion = parsed.version;
              }
            } catch {
              // ignore json parse error
            }
          }
          resolve(isOk);
        });
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  /** Start the embedded node daemon if not already running */
  public async start(options?: NodeDaemonOptions): Promise<NodeDaemonStatus> {
    const requestedPort = options?.port || this.currentPort;
    this.currentPort = requestedPort;
    this.lastError = null;
    this.currentState = 'starting';
    this.notifyStatus();

    if (options?.authToken) {
      this.currentAuthToken = options.authToken;
    }

    const registryUrl = `${getApiBaseUrl().replace(/\/$/, '')}/api`;

    // Check if an Otix Node is already active at this port
    const isAlreadyRunning = await this.probeNode(requestedPort);
    if (isAlreadyRunning) {
      console.log(`[node-daemon] Detected active Otix Node on port ${requestedPort}`);
      this.currentState = 'running';
      this.isEmbeddedProcess = Boolean(this.childProcess);
      this.notifyStatus();
      if (this.currentAuthToken) {
        void this.ensureClaimed(this.currentAuthToken);
      }
      return this.getStatus();
    }

    // Check port availability: if requestedPort is in use by another process, hunt for the next free port
    let port = requestedPort;
    const isAvailable = await isPortAvailable(port);
    if (!isAvailable) {
      console.log(`[node-daemon] Port ${port} is occupied by another process, hunting for next available port...`);
      try {
        port = await findAvailablePort(port + 1, 50);
        this.currentPort = port;
        console.log(`[node-daemon] Automatically allocated port ${port}`);
      } catch (err: unknown) {
        this.lastError = err instanceof Error ? err.message : String(err);
        this.currentState = 'error';
        this.notifyStatus();
        return this.getStatus();
      }
    }

    // Resolve binary
    const binary = this.resolveBinaryPath();
    if (!binary) {
      this.lastError = 'Otix Node companion binary not found';
      this.currentState = 'error';
      console.warn(`[node-daemon] ${this.lastError}`);
      this.notifyStatus();
      return this.getStatus();
    }

    // Ensure config file exists in userData
    const configPath = options?.configPath || path.join(this.userDataPath, 'node-config.yaml');
    this.ensureConfigFile(configPath, port);

    console.log(`[node-daemon] Launching embedded Otix Node: ${binary} (port: ${port}, registry: ${registryUrl})`);

    try {
      const proc = spawn(
        binary,
        ['-headless', '-no-tray', '-config', configPath, '-port', String(port), '-open=false'],
        {
          detached: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            OTIX_HEADLESS: '1',
            OTIX_NO_TRAY: '1',
            PORT: String(port),
            OTIX_REGISTRY_URL: registryUrl,
          },
        },
      );

      this.childProcess = proc;
      this.isEmbeddedProcess = true;

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const lines = text.trim().split('\n');
        for (const line of lines) {
          if (line) console.log(`[otix-node] ${line}`);
        }
        if (this.currentState === 'starting' && (text.includes('Listening') || text.includes('started') || text.includes('Server running'))) {
          this.currentState = 'running';
          this.notifyStatus();
          if (this.currentAuthToken) {
            void this.ensureClaimed(this.currentAuthToken);
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line) console.warn(`[otix-node:stderr] ${line}`);
        }
      });

      proc.on('error', (err) => {
        console.error('[node-daemon] Process error:', err);
        this.lastError = err.message;
        this.currentState = 'error';
        this.childProcess = null;
        this.isEmbeddedProcess = false;
        this.notifyStatus();
      });

      proc.on('exit', (code, signal) => {
        console.log(`[node-daemon] Process exited with code ${code}, signal ${signal}`);
        this.childProcess = null;
        this.isEmbeddedProcess = false;
        if (this.currentState === 'stopping') {
          this.currentState = 'stopped';
        } else if (code !== 0 && code !== null) {
          this.currentState = 'error';
          if (!this.lastError) {
            this.lastError = `Process exited with code ${code}`;
          }
        } else {
          this.currentState = 'stopped';
        }
        this.notifyStatus();
      });

      // Poll up to 4 seconds for HTTP service readiness
      const startTime = Date.now();
      let ready = false;
      while (Date.now() - startTime < 4000) {
        await new Promise((r) => setTimeout(r, 200));
        if (await this.probeNode(port, 400)) {
          ready = true;
          break;
        }
        if (!this.childProcess) {
          // Process died during startup
          break;
        }
      }

      if (ready) {
        console.log(`[node-daemon] Embedded Otix Node is live on http://127.0.0.1:${port}`);
        this.currentState = 'running';
        this.lastError = null;
        this.notifyStatus();
        if (this.currentAuthToken) {
          void this.ensureClaimed(this.currentAuthToken);
        }
      } else if (!this.lastError && this.childProcess) {
        this.lastError = 'Node started but did not respond within timeout';
        this.currentState = 'error';
        this.notifyStatus();
      }
    } catch (err: any) {
      this.lastError = err.message;
      this.currentState = 'error';
      console.error('[node-daemon] Failed to spawn node process:', err);
      this.childProcess = null;
      this.isEmbeddedProcess = false;
      this.notifyStatus();
    }

    return this.getStatus();
  }

  /** Stop the embedded node process */
  public async stop(): Promise<NodeDaemonStatus> {
    if (!this.childProcess) {
      this.currentState = 'stopped';
      this.isEmbeddedProcess = false;
      this.notifyStatus();
      return this.getStatus();
    }

    console.log('[node-daemon] Stopping embedded Otix Node...');
    this.currentState = 'stopping';
    this.notifyStatus();

    const proc = this.childProcess;
    this.childProcess = null;
    this.isEmbeddedProcess = false;

    await new Promise<void>((resolve) => {
      const pid = proc.pid;
      let resolved = false;

      const finish = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      proc.once('exit', finish);

      // Attempt graceful termination
      if (process.platform === 'win32' && pid) {
        try {
          execSync(`taskkill /pid ${pid} /T /F`);
          finish();
        } catch {
          proc.kill();
          finish();
        }
      } else {
        proc.kill('SIGTERM');
        // Force kill after 2.5 seconds if still hanging
        setTimeout(() => {
          if (!resolved) {
            try { proc.kill('SIGKILL'); } catch {}
            finish();
          }
        }, 2500);
      }
    });

    console.log('[node-daemon] Embedded Otix Node stopped.');
    this.currentState = 'stopped';
    this.notifyStatus();
    return this.getStatus();
  }

  /** Restart the embedded node */
  public async restart(options?: NodeDaemonOptions): Promise<NodeDaemonStatus> {
    await this.stop();
    return await this.start(options);
  }

  /** Ensure the local companion node is claimed and linked to the authenticated user */
  public async ensureClaimed(authToken?: string): Promise<boolean> {
    const token = authToken || this.currentAuthToken;
    if (!token) return false;

    const port = this.currentPort;
    const statusRes = await new Promise<{ claimed?: boolean; claim_code?: string; username?: string } | null>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/v1/claim/status`, { timeout: 1500 }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });

    if (!statusRes) return false;
    if (statusRes.claimed) {
      // Node is already claimed locally. Ensure the backend database also has the current auth_token.
      try {
        const configPath = path.join(this.userDataPath, 'node-config.yaml');
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf-8');
          const tokenMatch = /auth_token:\s*["']?([a-zA-Z0-9_-]+)["']?/.exec(content);
          const existingToken = tokenMatch ? tokenMatch[1] : '';
          if (existingToken) {
            const serverName = `${os.hostname()} OTIX NODE`;
            const apiBase = getApiBaseUrl().replace(/\/$/, '');
            const backendClaimUrl = `${apiBase}/api/v1/library/servers/claim-direct`;
            await net.fetch(backendClaimUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                server_name: serverName,
                auth_token: existingToken,
                port,
                local_endpoints: [`http://127.0.0.1:${port}`],
                is_local: true,
                is_local_desktop: true,
              }),
            });
          }
        }
      } catch (err) {
        console.warn('[node-daemon] Failed to sync existing node claim with backend:', err);
      }
      return true;
    }

    const claimCode = statusRes.claim_code;
    if (!claimCode) return false;

    const serverName = `${os.hostname()} OTIX NODE`;
    const nodeAuthToken = crypto.randomBytes(24).toString('hex');
    const apiBase = getApiBaseUrl().replace(/\/$/, '');

    try {
      // 1. Outbound claim with Otix backend (registers node directly in user's account)
      const backendClaimUrl = `${apiBase}/api/v1/library/servers/claim-direct`;
      const backendResp = await net.fetch(backendClaimUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          server_name: serverName,
          auth_token: nodeAuthToken,
          port,
          local_endpoints: [`http://127.0.0.1:${port}`],
          claim_code: claimCode,
          is_local: true,
          is_local_desktop: true,
        }),
      });

      if (!backendResp.ok) {
        const errText = await backendResp.text().catch(() => '');
        console.warn(`[node-daemon] Backend claim-direct returned HTTP ${backendResp.status}:`, errText);
        return false;
      }

      // 2. Confirm claim locally on the Go daemon
      const confirmUrl = `http://127.0.0.1:${port}/api/v1/claim/confirm`;
      const confirmResp = await net.fetch(confirmUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_code: claimCode,
          auth_token: nodeAuthToken,
          server_name: serverName,
          username: 'me',
          registry_url: `${apiBase}/api`,
        }),
      });

      if (!confirmResp.ok) {
        const confirmErr = await confirmResp.text().catch(() => '');
        console.warn(`[node-daemon] Local daemon claim confirm returned HTTP ${confirmResp.status}:`, confirmErr);
        return false;
      }

      console.log(`[node-daemon] Successfully claimed embedded Otix Node for user account (${serverName})`);
      this.notifyStatus();
      return true;
    } catch (err) {
      console.warn('[node-daemon] Failed to auto-claim embedded node:', err);
      return false;
    }
  }

  /** Unclaim and reset local companion node */
  public async unclaim(): Promise<boolean> {
    const isLive = await this.probeNode(this.currentPort, 400);
    if (!isLive) return false;
    try {
      const resp = await net.fetch(`http://127.0.0.1:${this.currentPort}/api/v1/claim/unclaim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (resp.ok) {
        console.log('[node-daemon] Embedded node daemon cleanly unclaimed and reset.');
        this.currentAuthToken = '';
        this.notifyStatus();
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[node-daemon] Failed to unclaim embedded node:', err);
      return false;
    }
  }

  /** Returns the local node auth token from node-config.yaml or memory */
  public getNodeAuthToken(): string {
    if (this.currentAuthToken) return this.currentAuthToken;
    try {
      const configPath = path.join(this.userDataPath, 'node-config.yaml');
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const tokenMatch = /auth_token:\s*["']?([a-zA-Z0-9_-]+)["']?/.exec(content);
        if (tokenMatch && tokenMatch[1]) {
          this.currentAuthToken = tokenMatch[1];
          return tokenMatch[1];
        }
      }
    } catch {
      // ignore
    }
    return '';
  }

  /** Synchronize local library paths to the running embedded node */
  public async syncLibraries(paths: { path: string; type: 'game' | 'iso' }[]): Promise<boolean> {
    const isLive = await this.probeNode(this.currentPort, 400);
    if (!isLive) return false;
    try {
      const token = this.getNodeAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const resp = await net.fetch(`http://127.0.0.1:${this.currentPort}/api/v1/libraries`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          libraries: paths.map((item) => ({
            name: path.basename(item.path) || item.type,
            path: item.path,
            kind: item.type,
          })),
        }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Return current daemon status */
  public getStatus(): NodeDaemonStatus {
    const isRunning = this.currentState === 'running' || Boolean(this.childProcess);
    const isStarting = this.currentState === 'starting';
    return {
      state: this.currentState,
      running: isRunning,
      starting: isStarting,
      embedded: this.isEmbeddedProcess,
      port: this.currentPort,
      url: `http://127.0.0.1:${this.currentPort}`,
      pid: this.childProcess?.pid || null,
      error: this.lastError,
      version: this.cachedVersion,
    };
  }

  /** Clean up on application quit */
  public async dispose(): Promise<void> {
    await this.stop();
  }

  private notifyStatus(suppressErrors = true): void {
    if (this.webContents && !this.webContents.isDestroyed()) {
      try {
        this.webContents.send('node-daemon:status-changed', this.getStatus());
      } catch (err) {
        if (!suppressErrors) {
          throw err;
        }
        console.warn('[node-daemon] Failed to send status-changed event to webContents:', err);
      }
    }
  }

  private ensureConfigFile(configPath: string, port: number): void {
    const apiRegistry = `${getApiBaseUrl().replace(/\/$/, '')}/api`;

    if (fs.existsSync(configPath)) {
      try {
        let content = fs.readFileSync(configPath, 'utf-8');
        let modified = false;

        const indentMatch = /server:\s*\r?\n(\s+)/.exec(content);
        const indent = indentMatch ? indentMatch[1] : '  ';

        const hasRegistry = /registry_url:\s*["']?([^"'\r\n]+)["']?/.test(content);
        if (!hasRegistry) {
          content = content.replace(/(server:\s*\r?\n)/i, `$1${indent}registry_url: "${apiRegistry}"\n`);
          modified = true;
          console.log(`[node-daemon] Added missing registry_url to ${configPath}`);
        } else if (apiRegistry !== 'http://127.0.0.1:8000/api' && content.includes('http://127.0.0.1:8000/api')) {
          content = content.replace(/registry_url:\s*["']?http:\/\/127\.0\.0\.1:8000\/api["']?/g, `registry_url: "${apiRegistry}"`);
          modified = true;
          console.log(`[node-daemon] Migrated registry_url to ${apiRegistry} in ${configPath}`);
        }

        const hasDisableTray = /disable_tray:\s*(true|false)/i.test(content);
        if (!hasDisableTray) {
          content = content.replace(/(server:\s*\r?\n)/i, `$1${indent}disable_tray: true\n`);
          modified = true;
          console.log(`[node-daemon] Added disable_tray: true to ${configPath}`);
        }

        if (modified) {
          fs.writeFileSync(configPath, content, 'utf-8');
        }
      } catch (err) {
        console.warn('[node-daemon] Failed to inspect/update existing config file:', err);
      }
      return;
    }

    try {
      const parentDir = path.dirname(configPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const minimalConfig = `server:
  name: "Local Otix Node"
  port: ${port}
  host: "127.0.0.1"
  registry_url: "${apiRegistry}"
  disable_tray: true
  enable_upnp: false
  enable_heartbeat: true
`;
      fs.writeFileSync(configPath, minimalConfig, 'utf-8');
      console.log(`[node-daemon] Generated initial config at ${configPath}`);
    } catch (err) {
      console.warn('[node-daemon] Failed to write initial config file:', err);
    }
  }
}
