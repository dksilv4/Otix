import { app, ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Readable } from 'stream';
import { getSettings, saveDesktopSettings } from '../desktop-settings';
import type { AiModelStatus } from '../desktop-settings';

// ── Configuration ──────────────────────────────────────────────

const MODEL_OWNER = 'lmstudio-community';
const MODEL_REPO = 'gemma-3-4b-it-GGUF';
const MODEL_FILENAME = 'gemma-3-4b-it-Q4_K_M.gguf';

const MODEL_URL = `https://huggingface.co/${MODEL_OWNER}/${MODEL_REPO}/resolve/main/${MODEL_FILENAME}`;

function modelDir(): string {
  return path.join(app.getPath('userData'), 'models');
}

function modelPath(): string {
  return path.join(modelDir(), MODEL_FILENAME);
}

// ── State ──────────────────────────────────────────────────────

let downloadPromise: Promise<void> | null = null;
let downloadProgress: number | null = null;
let loadingProgress: number | null = null;
let mainWindowRef: BrowserWindow | null = null;
let sessionHandle: any = null;
let modelHandle: { model: any; context: any } | null = null;
let loadPromise: Promise<boolean> | null = null;
let LlamaChatSessionClass: any = null;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;
const UNLOAD_IDLE_MS = 5 * 60 * 1000; // 5 minutes

function resetUnloadTimer() {
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = setTimeout(() => {
    if (!sessionHandle) return;
    console.log('[classifier] idle — unloading model');
    unloadModel();
    updateModelStatus('not_available');
  }, UNLOAD_IDLE_MS);
}

function sendDownloadProgress(pct: number) {
  downloadProgress = pct;
  mainWindowRef?.webContents.send('ai:download-progress', pct);
}

function sendLoadingProgress(pct: number) {
  loadingProgress = pct;
  mainWindowRef?.webContents.send('ai:loading-progress', pct);
}

function updateModelStatus(status: AiModelStatus) {
  const current = getSettings();
  saveDesktopSettings({ ...current, aiModelStatus: status });
  mainWindowRef?.webContents.send('ai:status-changed', status);
}

// ── Model file helpers ─────────────────────────────────────────

const MIN_MODEL_BYTES = 100_000;

function modelFileExists(): boolean {
  try {
    return fs.existsSync(modelPath()) && fs.statSync(modelPath()).size >= MIN_MODEL_BYTES;
  } catch {
    return false;
  }
}

// ── Download ───────────────────────────────────────────────────

async function downloadModel(): Promise<void> {
  if (downloadPromise) return downloadPromise;

  downloadPromise = (async () => {
    const dir = modelDir();
    fs.mkdirSync(dir, { recursive: true });
    const tmpPath = modelPath() + '.tmp';

    downloadProgress = 0;
    sendDownloadProgress(0);

    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(new Error('Download timed out after 5 minutes')),
      300_000,
    );

    try {
      const response = await fetch(MODEL_URL, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const total = parseInt(response.headers.get('content-length') ?? '0', 10);
      if (!response.body) throw new Error('No response body');

      const file = fs.createWriteStream(tmpPath);
      let received = 0;
      let lastLogged = 0;

      try {
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            if (pct - lastLogged >= 1 || received >= total) {
              lastLogged = pct;
              sendDownloadProgress(pct);
            }
          }
        });

        await new Promise<void>((resolve, reject) => {
          file.on('finish', resolve);
          file.on('error', reject);
          nodeStream.pipe(file);
        });

        sendDownloadProgress(100);
        fs.renameSync(tmpPath, modelPath());
        updateModelStatus('loading'); // file downloaded, now loading into memory
      } catch (err) {
        file.close();
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[classifier] Download failed:', msg);
        try { fs.writeFileSync(path.join(app.getPath('userData'), 'model-error.log'), 'DOWNLOAD:' + msg); } catch {}
        updateModelStatus('error');
        downloadPromise = null;
        downloadProgress = null;
        throw err;
      }
    } finally {
      clearTimeout(timeout);
    }
  })();

  return downloadPromise;
}

// ── Model loading ──────────────────────────────────────────────

async function ensureModelLoaded(): Promise<boolean> {
  if (sessionHandle) return true;
  if (!modelFileExists()) return false;

  // Return existing load promise if loading already in progress
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    updateModelStatus('loading');
    loadingProgress = 0;
    sendLoadingProgress(0);

    try {
      const mod = await (Function('return import("node-llama-cpp")')() as Promise<any>);
      const { getLlama } = mod;
      const { LlamaChatSession } = mod;
      LlamaChatSessionClass = LlamaChatSession;

      const llama = await getLlama();

      const model = await llama.loadModel({
        modelPath: modelPath(),
        onLoadProgress: (pct: number) => {
          const p = Math.round(pct * 100);
          loadingProgress = p;
          sendLoadingProgress(p);
        },
      });

      const context = await model.createContext();
      const contextSequence = context.getSequence();
      const settings = getSettings();
      sessionHandle = new LlamaChatSession({
        contextSequence,
        systemPrompt: settings?.aiSystemPrompt,
      });
      modelHandle = { model, context };

      updateModelStatus('ready');
      resetUnloadTimer();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message + '\n' + (err.stack || '') : String(err);
      console.error('[classifier] Failed to load model:', msg);
      try { fs.writeFileSync(path.join(app.getPath('userData'), 'model-error.log'), msg); } catch {}
      updateModelStatus('error');
      return false;
    } finally {
      loadPromise = null; // allow retry on next call after failure
    }
  })();

  return loadPromise;
}

function unloadModel() {
  if (unloadTimer) { clearTimeout(unloadTimer); unloadTimer = null; }
  sessionHandle = null;
  loadPromise = null;
  if (modelHandle) {
    try { modelHandle.context?.dispose?.(); } catch { /* ignore */ }
    try { modelHandle.model?.dispose?.(); } catch { /* ignore */ }
    modelHandle = null;
  }
}

// ── Chat ───────────────────────────────────────────────────────

async function chat(messages: { role: 'user' | 'model'; content: string }[]): Promise<string | null> {
  const loaded = await ensureModelLoaded();
  if (!loaded || !sessionHandle) return null;
  resetUnloadTimer(); // bump timer — model in use

  try {
    // Convert messages to LlamaChatSession format
    const history = messages.slice(0, -1).map((m) => ({
      type: m.role === 'user' ? 'user' as const : 'model' as const,
      text: m.content,
    }));

    const lastMsg = messages[messages.length - 1];

    const response = await sessionHandle.prompt(lastMsg.content, {
      history,
      maxTokens: 1024,
      temperature: 0.7,
    });

    return response?.trim() ?? null;
  } catch (err) {
    console.error('[classifier] Chat failed:', err);
    return null;
  }
}

// ── IPC Registration ───────────────────────────────────────────

export function registerClassifierIPC(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;

  // Eagerly load model on startup if file exists
  if (modelFileExists()) {
    updateModelStatus('loading');
    ensureModelLoaded().catch(() => {});
  }

  ipcMain.handle('ai:get-status', (): AiModelStatus => {
    const saved = getSettings()?.aiModelStatus;
    if (sessionHandle) return 'ready';
    if (saved === 'downloading') return 'downloading';
    if (saved === 'loading') return 'loading';
    // Model file exists on disk but not loaded — app restarted. Go to loading to trigger reload.
    if (modelFileExists()) {
      if (saved === 'ready' || saved === 'not_available' || saved === 'error') {
        updateModelStatus('loading');
      }
      return 'loading';
    }
    updateModelStatus('not_available');
    return 'not_available';
  });

  ipcMain.handle('ai:get-download-progress', (): number | null => {
    return downloadProgress;
  });

  ipcMain.handle('ai:get-loading-progress', (): number | null => {
    return loadingProgress;
  });

  ipcMain.handle('ai:download-model', async (): Promise<void> => {
    updateModelStatus('downloading');
    downloadProgress = 0;
    sendDownloadProgress(0);
    try {
      await downloadModel();
    } catch (err) {
      console.error('[classifier] Download failed:', err);
      updateModelStatus('error');
      throw err;
    }
  });

  ipcMain.handle('ai:delete-model', async (): Promise<void> => {
    unloadModel();
    try {
      if (modelFileExists()) fs.unlinkSync(modelPath());
    } catch { /* ignore */ }
    downloadPromise = null;
    downloadProgress = null;
    loadingProgress = null;
    updateModelStatus('not_available');
  });

  ipcMain.handle('ai:get-system-prompt', (): string => {
    return getSettings()?.aiSystemPrompt ?? '';
  });

  ipcMain.handle('ai:set-system-prompt', async (_event, prompt: string): Promise<void> => {
    const current = getSettings();
    saveDesktopSettings({ ...current, aiSystemPrompt: prompt });
    if (sessionHandle && modelHandle && LlamaChatSessionClass) {
      try { sessionHandle.dispose?.(); } catch {}
      const context = await modelHandle.model.createContext();
      const contextSequence = context.getSequence();
      sessionHandle = new LlamaChatSessionClass({ contextSequence, systemPrompt: prompt });
      modelHandle.context.dispose?.();
      modelHandle.context = context;
    }
  });

  ipcMain.handle('ai:chat', async (_event, messages: { role: 'user' | 'model'; content: string }[]): Promise<string | null> => {
    return chat(messages);
  });
}
