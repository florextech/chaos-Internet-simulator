import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type PluginRequestContext = {
  method: string;
  url: string;
  profileId: string;
  chaosEnabled: boolean;
  forceError: (statusCode?: number) => void;
  addDelay: (ms: number) => void;
  skipChaos: () => void;
  setHeader: (name: string, value: string) => void;
  dropConnection: () => void;
};

export type PluginResponseContext = {
  method: string;
  url: string;
  profileId: string;
  statusCode: number;
  setHeader: (name: string, value: string) => void;
};

export type ChaosPlugin = {
  name: string;
  onRequest?: (ctx: PluginRequestContext) => void | Promise<void>;
  onResponse?: (ctx: PluginResponseContext) => void | Promise<void>;
};

const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts']);

export const loadLocalPlugins = async (
  pluginDirectory: string,
): Promise<{ plugins: ChaosPlugin[]; errors: string[] }> => {
  const plugins: ChaosPlugin[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(pluginDirectory)) {
    return { plugins, errors };
  }

  const entries = fs
    .readdirSync(pluginDirectory)
    .filter((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry)))
    .sort();

  for (const entry of entries) {
    const filePath = path.join(pluginDirectory, entry);
    try {
      const module = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
      const candidate = module.default as ChaosPlugin | undefined;
      if (!candidate || typeof candidate.name !== 'string' || candidate.name.trim().length === 0) {
        errors.push(`${entry}: invalid plugin contract`);
        continue;
      }
      plugins.push(candidate);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${entry}: ${message}`);
    }
  }

  return { plugins, errors };
};
