import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { PluginEntry, PluginManifest, PluginContext } from './types';

const _require = createRequire(__filename);

export function loadPluginMain(
  pluginPath: string,
  manifest: PluginManifest
): Promise<PluginEntry> {
  const mainPath = path.join(pluginPath, manifest.entry.main);

  if (!fs.existsSync(mainPath)) {
    return Promise.reject(
      new Error(`Plugin entry not found: ${mainPath}`)
    );
  }

  // Bust the Node.js require cache so re-enabled plugins pick up code changes
  try {
    const resolvedPath = _require.resolve(mainPath);
    delete _require.cache[resolvedPath];
  } catch {
    // Module not yet cached — first load, nothing to bust
  }

  try {
    const mod = _require(mainPath);
    const entry: unknown = mod.default ?? mod.plugin ?? mod;

    if (typeof entry !== 'function') {
      return Promise.reject(
        new Error(
          `Plugin entry must be a function (found ${typeof entry}). ` +
          'Export a default function or a named "plugin" export.'
        )
      );
    }

    return Promise.resolve(entry as PluginEntry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Promise.reject(
      new Error(`Failed to load plugin module: ${message}`)
    );
  }
}

export function loadPluginTest(
  pluginPath: string,
  manifest: PluginManifest
): Promise<((ctx: PluginContext, config: Record<string, unknown>) => Promise<{ success: boolean; message: string }>) | null> {
  const mainPath = path.join(pluginPath, manifest.entry.main);

  if (!fs.existsSync(mainPath)) {
    return Promise.resolve(null);
  }

  // Bust the Node.js require cache so the latest code is used
  try {
    const resolvedPath = _require.resolve(mainPath);
    delete _require.cache[resolvedPath];
  } catch {
    // Module not yet cached — first load, nothing to bust
  }

  try {
    const mod = _require(mainPath);
    const testFn = (mod as Record<string, unknown>).test;

    if (typeof testFn !== 'function') {
      return Promise.resolve(null);
    }

    return Promise.resolve(testFn as (ctx: PluginContext, config: Record<string, unknown>) => Promise<{ success: boolean; message: string }>);
  } catch {
    return Promise.resolve(null);
  }
}

export function loadPluginData(
  pluginPath: string,
  manifest: PluginManifest
): Record<string, (ctx: PluginContext, ...args: unknown[]) => Promise<unknown>> {
  const mainPath = path.join(pluginPath, manifest.entry.main);
  let resolvedPath: string;
  try {
    resolvedPath = _require.resolve(mainPath);
  } catch {
    return {};
  }
  delete _require.cache[resolvedPath];

  try {
    const mod = _require(mainPath);
    if (mod.data && typeof mod.data === 'object') {
      return mod.data;
    }
  } catch {}
  return {};
}

export function loadPluginStatus(
  pluginPath: string,
  manifest: PluginManifest
): Promise<((ctx: PluginContext) => Promise<Record<string, unknown>>) | null> {
  const mainPath = path.join(pluginPath, manifest.entry.main);

  // Bust the Node.js require cache so the latest code is used
  try {
    const resolvedPath = _require.resolve(mainPath);
    delete _require.cache[resolvedPath];
  } catch {
    // Module not yet cached — first load, nothing to bust
  }

  try {
    const mod = _require(mainPath);
    const statusFn = (mod as Record<string, unknown>).status;

    if (typeof statusFn !== 'function') {
      return Promise.resolve(null);
    }

    return Promise.resolve(statusFn as (ctx: PluginContext) => Promise<Record<string, unknown>>);
  } catch {
    return Promise.resolve(null);
  }
}
