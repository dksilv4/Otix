import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import type { WebContents } from 'electron';

export interface NodeDaemonStatus {
  running: boolean;
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
}

export class NodeDaemonManager {
  private childProcess: ChildProcess | null = null;
  private isEmbeddedProcess = false;
  private currentPort = 8090;
  private webContents: WebContents | null = null;
  private lastError: string | null = null;
  private cachedVersion: string | null = null;

  constructor(
    private readonly userDataPath: string,
    private readonly resourcesPath?: string,
  ) {}

  /** Set webContents to forward status updates to renderer */
  public setWebContents(wc: WebContents | null): void {
    this.webContents = wc;
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
    const port = options?.port || this.currentPort;
    this.currentPort = port;
    this.lastError = null;

    // Check if a node is already active at this port
    const isAlreadyRunning = await this.probeNode(port);
    if (isAlreadyRunning) {
      console.log(`[node-daemon] Detected active Otix Node on port ${port}`);
      this.isEmbeddedProcess = Boolean(this.childProcess);
      this.notifyStatus();
      return this.getStatus();
    }

    // Resolve binary
    const binary = this.resolveBinaryPath();
    if (!binary) {
      this.lastError = 'Otix Node companion binary not found';
      console.warn(`[node-daemon] ${this.lastError}`);
      this.notifyStatus();
      return this.getStatus();
    }

    // Ensure config file exists in userData
    const configPath = options?.configPath || path.join(this.userDataPath, 'node-config.yaml');
    this.ensureConfigFile(configPath, port);

    console.log(`[node-daemon] Launching embedded Otix Node: ${binary} (port: ${port})`);

    try {
      const proc = spawn(
        binary,
        ['-headless', '-config', configPath, '-port', String(port), '-open=false'],
        {
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            OTIX_HEADLESS: '1',
            PORT: String(port),
          },
        },
      );

      this.childProcess = proc;
      this.isEmbeddedProcess = true;

      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (line) console.log(`[otix-node] ${line}`);
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
        this.childProcess = null;
        this.isEmbeddedProcess = false;
        this.notifyStatus();
      });

      proc.on('exit', (code, signal) => {
        console.log(`[node-daemon] Process exited with code ${code}, signal ${signal}`);
        this.childProcess = null;
        this.isEmbeddedProcess = false;
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
      } else if (!this.lastError) {
        this.lastError = 'Node started but did not respond within timeout';
      }
    } catch (err: any) {
      this.lastError = err.message;
      console.error('[node-daemon] Failed to spawn node process:', err);
      this.childProcess = null;
      this.isEmbeddedProcess = false;
    }

    this.notifyStatus();
    return this.getStatus();
  }

  /** Stop the embedded node process */
  public async stop(): Promise<NodeDaemonStatus> {
    if (!this.childProcess) {
      return this.getStatus();
    }

    console.log('[node-daemon] Stopping embedded Otix Node...');
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
    this.notifyStatus();
    return this.getStatus();
  }

  /** Restart the embedded node */
  public async restart(options?: NodeDaemonOptions): Promise<NodeDaemonStatus> {
    await this.stop();
    return await this.start(options);
  }

  /** Return current daemon status */
  public getStatus(): NodeDaemonStatus {
    const isRunning = Boolean(this.childProcess);
    return {
      running: isRunning,
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

  private notifyStatus(): void {
    if (this.webContents && !this.webContents.isDestroyed()) {
      this.webContents.send('node-daemon:status-changed', this.getStatus());
    }
  }

  private ensureConfigFile(configPath: string, port: number): void {
    if (fs.existsSync(configPath)) return;

    try {
      const parentDir = path.dirname(configPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const minimalConfig = `server:
  name: "Local Otix Node"
  port: ${port}
  host: "127.0.0.1"
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
