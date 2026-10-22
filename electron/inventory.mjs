import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { tools } from './registry.mjs';
import { run, mapLimit } from './process.mjs';

const BEGIN = '__OPENENV_ENV_BEGIN_9F21__';
const END = '__OPENENV_ENV_END_9F21__';
const sensitiveName = /(?:token|secret|passw|credential|private|auth|cookie|key|dsn|database|connection|session)/i;
const safeName = /^(?:PATH|SHELL|HOME|USER|LOGNAME|LANG|LANGUAGE|LC_[A-Z_]+|TERM|TERM_PROGRAM|TERM_PROGRAM_VERSION|COLORTERM|EDITOR|VISUAL|PAGER|TMPDIR|TMP|TEMP|PWD|OLDPWD|SHLVL|COMMAND_MODE|DISPLAY|XDG_[A-Z_]+|GOROOT|GOPATH|GOBIN|GOPROXY|GOVERSION|GOARCH|GOOS|CGO_ENABLED|JAVA_HOME|JDK_HOME|NODE_PATH|NODE_ENV|NVM_DIR|NVM_BIN|FNM_DIR|FNM_MULTISHELL_PATH|VOLTA_HOME|PYENV_ROOT|PYENV_VERSION|PYTHONPATH|VIRTUAL_ENV|CONDA_PREFIX|CONDA_DEFAULT_ENV|CONDA_SHLVL|CARGO_HOME|RUSTUP_HOME|RUSTUP_TOOLCHAIN|HOMEBREW_PREFIX|HOMEBREW_CELLAR|HOMEBREW_REPOSITORY|ASDF_DIR|ASDF_DATA_DIR|MISE_DATA_DIR|SDKROOT|DEVELOPER_DIR|ProgramFiles|ProgramFiles\(x86\)|SystemRoot|windir|OS|COMSPEC|PATHEXT|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|USERPROFILE|APPDATA|LOCALAPPDATA)$/i;
const secretValue = /(?:[a-z][a-z0-9+.-]*:\/\/[^/\s]*:[^/\s]*@|[?&](?:key|token|password|secret)=|(?:sk-|ghp_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY|eyJ[A-Za-z0-9_-]{15,}\.)/i;

export function redactEnvironment(env) {
  return Object.entries(env).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => {
    const redacted = sensitiveName.test(name) || !safeName.test(name) || secretValue.test(String(value));
    return { name, value: redacted ? null : String(value), redacted,
      group: /^(GO|JAVA|JDK|NODE|NVM|FNM|VOLTA|PY|VIRTUAL|CONDA|CARGO|RUSTUP|HOMEBREW|ASDF|MISE|SDK|DEVELOPER)/.test(name) ? 'development' : 'system' };
  });
}

export function parseShellEnvironment(stdout) {
  const start = stdout.indexOf(BEGIN);
  const end = stdout.indexOf(END, start + BEGIN.length);
  if (start < 0 || end < 0) return null;
  const entries = stdout.slice(start + BEGIN.length, end).split('\0');
  const result = {};
  for (const entry of entries) {
    const equal = entry.indexOf('=');
    if (equal > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.slice(0, equal))) result[entry.slice(0, equal)] = entry.slice(equal + 1);
  }
  return result.PATH ? result : null;
}

export async function captureEnvironment({ baseEnv = process.env, platform = process.platform, runner = run, home = os.homedir() } = {}) {
  if (platform === 'win32') return { env: { ...baseEnv }, shell: baseEnv.COMSPEC || 'cmd.exe', source: 'process', warning: null };
  const shell = baseEnv.SHELL || '/bin/zsh';
  if (!path.isAbsolute(shell) || !/^(?:zsh|bash|fish|sh|ksh|dash)$/.test(path.basename(shell))) {
    return { env: { ...baseEnv }, shell, source: 'fallback', warning: '当前 Shell 暂不支持读取，使用应用进程的环境。' };
  }
  const command = `printf '${BEGIN}'; /usr/bin/env -0; printf '${END}'`;
  // A fresh macOS login must not inherit PATH injected by an IDE/npm launcher.
  // The system profile/path_helper and the user's profiles build the login PATH.
  const shellEnv = platform === 'darwin' ? { ...baseEnv, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } : baseEnv;
  const result = await runner(shell, ['-ilc', command], { env: shellEnv, cwd: home, timeout: 10000, maxBytes: 2 * 1024 * 1024 });
  const env = !result.error && parseShellEnvironment(result.stdout);
  if (!env) return { env: { ...baseEnv }, shell, source: 'fallback', warning: result.error ? `登录 Shell ${result.error}，已使用应用环境。` : '无法读取登录 Shell 环境，已使用应用环境。' };
  return { env, shell, source: 'login-shell', warning: null };
}

export async function inspectPath(raw = '', { platform = process.platform, cwd = os.homedir(), io = fs } = {}) {
  const separator = platform === 'win32' ? ';' : ':';
  const pathAPI = platform === 'win32' ? path.win32 : path;
  const seen = new Map();
  return mapLimit(raw.split(separator).slice(0, 512), 16, async (entry, index) => {
    // Empty and relative entries really do resolve against the process working directory.
    const resolved = pathAPI.resolve(cwd, entry || '.');
    const key = platform === 'win32' ? resolved.toLowerCase() : resolved;
    const duplicateOf = seen.has(key) ? seen.get(key) : null;
    if (!seen.has(key)) seen.set(key, index);
    let exists = false;
    try { exists = (await io.stat(resolved)).isDirectory(); } catch { /* Missing. */ }
    return { index, path: entry || '(当前目录)', resolved, exists, duplicateOf, relative: !entry || !pathAPI.isAbsolute(entry) };
  });
}

async function children(directory, io = fs) {
  try { return (await io.readdir(directory, { withFileTypes: true })).filter(x => x.isDirectory() || x.isSymbolicLink()).map(x => x.name).sort().slice(0, 80); }
  catch { return []; }
}

export async function discoverDirectories({ home = os.homedir(), platform = process.platform, env = process.env, io = fs } = {}) {
  const dirs = new Set();
  const add = p => { if (p) dirs.add(p); };
  if (platform === 'win32') {
    const p = path.win32;
    [p.join(home, '.cargo', 'bin'), p.join(home, '.bun', 'bin'), p.join(home, 'scoop', 'shims'),
      env.ProgramFiles && p.join(env.ProgramFiles, 'nodejs'), env.ProgramFiles && p.join(env.ProgramFiles, 'Go', 'bin'),
      env.LOCALAPPDATA && p.join(env.LOCALAPPDATA, 'Volta', 'bin'), env.APPDATA && p.join(env.APPDATA, 'npm'),
      env.NVM_HOME, env.NVM_SYMLINK, env.GOROOT && p.join(env.GOROOT, 'bin')].forEach(add);
    const windowsRoots = [env.NVM_HOME, env.LOCALAPPDATA && p.join(env.LOCALAPPDATA, 'Programs', 'Python'), env.ProgramFiles && p.join(env.ProgramFiles, 'Java')].filter(Boolean);
    for (const root of windowsRoots) for (const child of await children(root, io)) { add(p.join(root, child)); add(p.join(root, child, 'bin')); }
    return [...dirs];
  }
  ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/local/go/bin', '/opt/local/bin',
    path.join(home, '.local/bin'), path.join(home, 'go/bin'), path.join(home, '.cargo/bin'),
    path.join(home, '.bun/bin'), path.join(home, '.deno/bin'), path.join(home, '.volta/bin'),
    path.join(home, '.pyenv/shims'), path.join(home, '.asdf/shims'), path.join(home, '.local/share/mise/shims'),
    path.join(home, 'miniconda3/bin'), path.join(home, 'anaconda3/bin'), path.join(home, 'miniforge3/bin'),
    path.join(home, '.local/share/fnm'), '/opt/anaconda3/bin', '/opt/miniconda3/bin', '/home/linuxbrew/.linuxbrew/bin',
    env.GOROOT && path.join(env.GOROOT, 'bin'), env.JAVA_HOME && path.join(env.JAVA_HOME, 'bin')].forEach(add);
  const patterns = [
    [env.NVM_DIR || path.join(home, '.nvm'), 'versions/node', 'bin'],
    [path.join(home, 'Library/Application Support/fnm'), 'node-versions', 'installation/bin'],
    [env.FNM_DIR || path.join(home, '.local/share/fnm'), 'node-versions', 'installation/bin'],
    [path.join(home, '.volta'), 'tools/image/node', 'bin'],
    [env.PYENV_ROOT || path.join(home, '.pyenv'), 'versions', 'bin'],
    [path.join(home, '.rbenv'), 'versions', 'bin'],
    [path.join(home, '.rustup'), 'toolchains', 'bin'],
    [home, 'sdk', 'bin'],
    ['/Library/Java', 'JavaVirtualMachines', 'Contents/Home/bin'],
    ['/usr/lib', 'jvm', 'bin'],
    [path.join(home, '.local/share/uv'), 'python', 'bin']
  ];
  for (const [root, sub, suffix] of patterns) {
    const parent = path.join(root, sub);
    for (const name of await children(parent, io)) add(path.join(parent, name, suffix));
  }
  for (const managerRoot of [path.join(home, '.asdf/installs'), path.join(home, '.local/share/mise/installs')]) {
    for (const language of await children(managerRoot, io)) {
      const versions = path.join(managerRoot, language);
      for (const version of await children(versions, io)) add(path.join(versions, version, 'bin'));
    }
  }
  // Homebrew's opt directory includes keg-only language versions that are absent from PATH.
  for (const root of ['/opt/homebrew/opt', '/usr/local/opt', '/home/linuxbrew/.linuxbrew/opt']) {
    for (const name of (await children(root, io)).filter(n => /^(?:go|node|python|ruby|php|openjdk|llvm|gcc|rust|swift|cmake)(?:@|$)/.test(n))) {
      add(path.join(root, name, 'bin'));
      if (name.startsWith('python')) add(path.join(root, name, 'libexec/bin'));
      if (name.startsWith('openjdk')) add(path.join(root, name, 'libexec/openjdk.jdk/Contents/Home/bin'));
    }
  }
  return [...dirs].slice(0, 500);
}

export function installationSource(file, realPath, home = os.homedir()) {
  const p = `${file} ${realPath}`.replaceAll('\\', '/');
  for (const [test, label] of [
    [/\/.nvm\//, 'nvm'], [/\/fnm\//, 'fnm'], [/\/.volta\//, 'Volta'], [/\/.pyenv\//, 'pyenv'],
    [/\/.rbenv\//, 'rbenv'], [/\/.asdf\//, 'asdf'], [/\/mise\//, 'mise'], [/\/.rustup\/|\/.cargo\//, 'rustup'],
    [/\/(?:mini|ana)conda|\/miniforge/, 'Conda'], [/\/uv\/python\//, 'uv'],
    [/\/Cellar\/|\/homebrew\/|\/linuxbrew\//, 'Homebrew'], [/\/scoop\//, 'Scoop'],
    [/\/Chocolatey\//i, 'Chocolatey'], [/\/Xcode.*\/|\/CommandLineTools\//, 'Xcode'],
    [/\/JavaVirtualMachines\//, 'JDK'], [/\/.bun\//, 'Bun'], [/\/.deno\//, 'Deno']
  ]) if (test.test(p)) return label;
  if (/^\/(?:usr\/bin|bin|usr\/sbin)\//.test(file) || /[\\/]Windows[\\/]/i.test(file)) return '系统';
  if (file.startsWith(home + path.sep)) return '用户目录';
  if (/\/usr\/local\/go\//.test(p) || /[\\/]Program Files[\\/]/i.test(file)) return '独立安装';
  return '自定义路径';
}

export function parseVersion(output, id) {
  const clean = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim();
  const match = id === 'go' ? clean.match(/go(\d+(?:\.\d+)+(?:[a-z0-9.-]+)?)/i)
    : clean.match(/(?:^|[^\d])(\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?)/);
  return { version: match?.[1] || null, output: clean.split('\n').slice(0, 3).join('\n').slice(0, 800) };
}

async function executableCandidate(file, platform, io) {
  try {
    if (!(await io.stat(file)).isFile()) return null;
    await io.access(file, platform === 'win32' ? constants.F_OK : constants.X_OK);
    return await io.realpath(file);
  } catch { return null; }
}

export async function scanInventory(options = {}) {
  const started = Date.now();
  const deadline = started + 45000;
  const { platform = process.platform, home = os.homedir(), baseEnv = process.env, io = fs,
    runner = run, registry = tools, onProgress = () => {} } = options;
  onProgress({ phase: 'shell', message: '读取登录 Shell 环境…' });
  const captured = await captureEnvironment({ baseEnv, platform, runner, home });
  const env = captured.env;
  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const pathEntries = await inspectPath(env[pathKey] || '', { platform, cwd: home, io });
  const extra = await discoverDirectories({ home, platform, env, io });
  const directories = [...new Set([...pathEntries.filter(p => p.exists).map(p => p.resolved), ...extra])].slice(0, 512);
  const directoryFiles = new Map(await mapLimit(directories, 16, async directory => {
    try { return [directory, (await io.readdir(directory, { withFileTypes: true })).filter(f => f.isFile() || f.isSymbolicLink()).map(f => f.name).slice(0, 4096)]; }
    catch { return [directory, []]; }
  }));
  onProgress({ phase: 'discover', message: '检查 PATH 与常见安装目录…' });
  const pathAPI = platform === 'win32' ? path.win32 : path;
  const results = await mapLimit(registry, 5, async (tool, toolIndex) => {
    const extensions = platform === 'win32' ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').map(x => x.toLowerCase()) : [''];
    const found = new Map();
    for (const directory of directories) {
      const pattern = { python: /^python(?:3(?:\.\d{1,2})?)?$/, gcc: /^gcc-\d{1,2}$/, clang: /^clang-\d{1,2}$/, node: /^nodejs$/ }[tool.id];
      const extraNames = pattern ? directoryFiles.get(directory).filter(name => pattern.test(name.replace(/\.(?:exe|cmd|bat|com)$/i, ''))).sort() : [];
      const names = [...new Set([...extensions.map(ext => tool.command + ext), ...extraNames])];
      for (const name of names) {
      const file = pathAPI.join(directory, name);
      const realPath = await executableCandidate(file, platform, io);
      if (!realPath) continue;
      const key = platform === 'win32' ? realPath.toLowerCase() : realPath;
      const pathIndex = pathEntries.findIndex(p => (platform === 'win32' ? p.resolved.toLowerCase() === directory.toLowerCase() : p.resolved === directory));
      const command = name.replace(/\.(?:exe|cmd|bat|com)$/i, '');
      if (found.has(key)) {
        const previous = found.get(key);
        previous.aliases.push(file);
        if (!previous.isDefaultCommand && command === tool.command) Object.assign(previous, {
          path: file, command, isDefaultCommand: true, pathIndex: pathIndex >= 0 ? pathIndex : null,
          source: installationSource(file, realPath, home)
        });
        continue;
      }
      found.set(key, { path: file, realPath, aliases: [file], command, isDefaultCommand: command === tool.command,
        pathIndex: pathIndex >= 0 ? pathIndex : null,
        source: installationSource(file, realPath, home) });
      }
    }
    const rank = candidate => candidate.isDefaultCommand && candidate.pathIndex !== null ? candidate.pathIndex : 10000;
    const candidates = [...found.values()].sort((a,b) => rank(a)-rank(b));
    const active = candidates.find(c => c.pathIndex !== null && c.isDefaultCommand);
    const installations = await mapLimit(candidates.slice(0, 24), 2, async candidate => {
      const probe = Date.now() > deadline ? { stdout: '', stderr: '', error: '已达到本次扫描的时间限制' } : await runner(candidate.path, tool.args, {
        env: { ...env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ANALYTICS: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1', COREPACK_ENABLE_NETWORK: '0', MISE_NOT_FOUND_AUTO_INSTALL: '0', RUSTUP_AUTO_INSTALL: '0' },
        cwd: home, timeout: Math.min(4500, Math.max(100, deadline - Date.now()))
      });
      const parsed = parseVersion(probe.stdout + '\n' + probe.stderr, tool.id);
      const verified = !probe.error && !!parsed.version;
      // Output is not relayed to the renderer: wrappers can echo arbitrary environment secrets.
      return { ...candidate, active: candidate === active, version: verified ? parsed.version : null,
        flavor: tool.id === 'gcc' && /clang/i.test(parsed.output) ? 'Apple Clang 兼容命令' : null,
        status: verified ? 'verified' : 'unverified', error: verified ? null : probe.error || '未识别版本输出' };
    });
    onProgress({ phase: 'probe', message: `检测 ${tool.name}`, completed: toolIndex + 1, total: registry.length });
    const activeInstallation = installations.find(x => x.active);
    return { ...tool, name: tool.id === 'gcc' && activeInstallation?.flavor ? 'GCC / Clang' : tool.name,
      installed: installations.length > 0, installations, version: activeInstallation ? activeInstallation.version : installations[0]?.version || null,
      activePath: activeInstallation?.path || null,
      conflict: installations.filter(x => x.pathIndex !== null && x.isDefaultCommand).length > 1,
      truncated: candidates.length > 24 };
  });
  const installed = results.filter(t => t.installed);
  const redacted = redactEnvironment(env);
  const defaultShellTool = results.find(t => t.category === 'shells' && pathAPI.basename(captured.shell).replace(/\.exe$/i, '') === t.command);
  const defaultShellInstallation = defaultShellTool?.installations.find(i => i.aliases.includes(captured.shell));
  const configRoot = /zsh$/.test(captured.shell) && env.ZDOTDIR ? env.ZDOTDIR : home;
  const configNames = platform === 'win32' ? [] : /fish$/.test(captured.shell) ? [path.join(env.XDG_CONFIG_HOME || path.join(home,'.config'), 'fish/config.fish')] : /bash$/.test(captured.shell) ? ['.bash_profile', '.bashrc', '.profile'] : ['.zshenv', '.zprofile', '.zshrc', '.zlogin'];
  const configs = await Promise.all(configNames.map(async name => {
    const file = pathAPI.isAbsolute(name) ? name : pathAPI.join(configRoot, name);
    let exists = false;
    try { exists = (await io.stat(file)).isFile(); } catch { /* Optional. */ }
    return { name: pathAPI.isAbsolute(name) ? pathAPI.basename(name) : name, path: file, exists };
  }));
  return {
    schemaVersion: 1, scannedAt: new Date().toISOString(), durationMs: Date.now() - started,
    machine: { hostname: os.hostname(), platform, arch: os.arch(), release: os.release(), home,
      osName: platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : 'Linux' },
    shell: { path: captured.shell, version: defaultShellInstallation?.version || null, source: captured.source, warning: captured.warning, configs, cwd: home },
    tools: results, path: pathEntries, environment: redacted,
    summary: { installed: installed.length, installations: installed.reduce((n, t) => n + t.installations.length, 0),
      conflicts: installed.filter(t => t.conflict).length,
      missingPaths: pathEntries.filter(p => !p.exists).length, duplicatePaths: pathEntries.filter(p => p.duplicateOf !== null).length,
      pathIssues: pathEntries.filter(p => !p.exists || p.duplicateOf !== null || p.relative).length,
      redacted: redacted.filter(e => e.redacted).length },
    scope: 'PATH 与常见版本管理器目录；不递归扫描磁盘，也不检测项目虚拟环境。'
  };
}

export function exportReport(inventory) {
  // Explicit allowlist; do not export variable values, raw shell output, or future private fields.
  return {
    schemaVersion: inventory.schemaVersion, scannedAt: inventory.scannedAt,
    machine: { platform: inventory.machine.platform, arch: inventory.machine.arch, osName: inventory.machine.osName },
    shell: { path: inventory.shell.path, version: inventory.shell.version, source: inventory.shell.source },
    summary: inventory.summary, tools: inventory.tools.filter(t => t.installed).map(t => ({
      id: t.id, name: t.name, activePath: t.activePath, installations: t.installations.map(i => ({
        path: i.path, realPath: i.realPath, version: i.version, source: i.source, active: i.active, status: i.status
      }))
    })), path: inventory.path, scope: inventory.scope,
    privacy: '不包含环境变量值。路径可能含本机用户名，分享前请检查。'
  };
}
