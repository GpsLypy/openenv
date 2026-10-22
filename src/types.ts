export type Category = 'languages' | 'toolchain' | 'managers' | 'shells';
export type View = 'all' | Category | 'environment' | 'path' | 'settings';
export interface Installation {
  path: string; realPath: string; aliases: string[]; pathIndex: number | null;
  command: string; isDefaultCommand: boolean;
  source: string; active: boolean; version: string | null;
  flavor: string | null; status: 'verified' | 'unverified'; error: string | null;
}
export interface Tool {
  id: string; name: string; command: string; args: string[]; category: Category;
  mark: string; color: string; description: string; installed: boolean;
  installations: Installation[]; version: string | null; activePath: string | null;
  conflict: boolean; truncated: boolean;
}
export interface PathEntry { index: number; path: string; resolved: string; exists: boolean; duplicateOf: number | null; relative: boolean }
export interface EnvEntry { name: string; value: string | null; redacted: boolean; group: 'development' | 'system' }
export interface Inventory {
  schemaVersion: number; scannedAt: string; durationMs: number;
  machine: { hostname: string; platform: string; arch: string; release: string; home: string; osName: string };
  shell: { path: string; version: string | null; source: string; warning: string | null; cwd: string; configs: { name: string; path: string; exists: boolean }[] };
  tools: Tool[]; path: PathEntry[]; environment: EnvEntry[];
  summary: { installed: number; installations: number; conflicts: number; missingPaths: number; duplicatePaths: number; pathIssues: number; redacted: number };
  scope: string;
}
export interface Settings { platform: string; packaged: boolean; startup: boolean; startupSupported: boolean; closeToTray: boolean; trayAvailable: boolean; version: string }
export interface Progress { phase: string; message: string; completed?: number; total?: number }
export interface OpenEnvAPI {
  scan(): Promise<Inventory>; cached(): Promise<Inventory | null>; settings(): Promise<Settings>;
  setStartup(enabled: boolean): Promise<Settings>; setCloseToTray(enabled: boolean): Promise<Settings>;
  reveal(file: string): Promise<boolean>; copy(text: string): Promise<boolean>;
  exportReport(): Promise<{ canceled: boolean }>;
  onProgress(callback: (p: Progress) => void): () => void;
  onInventory(callback: (inventory: Inventory) => void): () => void;
}
declare global { interface Window { openenv?: OpenEnvAPI } }
