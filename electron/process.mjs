import { spawn } from 'node:child_process';

// Kill the entire POSIX process group, including subprocesses started by profiles/shims.
export function run(file, args, { env = process.env, cwd, timeout = 5000, maxBytes = 128 * 1024, platform = process.platform } = {}) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', bytes = 0, done = false, timer;
    let executable = file, invocation = args;
    if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(file)) {
      // Registry arguments are fixed; reject command interpreter expansion in paths.
      if (/[\r\n"%!?^&|<>]/.test(file) || args.some(a => !/^[A-Za-z0-9_.=-]+$/.test(a))) {
        resolve({ stdout, stderr, error: '此命令包装路径无法安全检测', code: null }); return;
      }
      executable = env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
      invocation = ['/d', '/s', '/c', `""${file}" ${args.join(' ')}"`];
    }
    const child = spawn(executable, invocation, {
      env, cwd, windowsHide: true, shell: false,
      detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      windowsVerbatimArguments: platform === 'win32' && executable !== file
    });
    const finish = (error = null, code = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, error, code });
    };
    const stop = error => {
      try {
        if (platform === 'win32') {
          spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill('SIGKILL'));
        }
        else process.kill(-child.pid, 'SIGKILL');
      } catch { /* Already exited. */ }
      finish(error);
    };
    const collect = key => chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) return stop('输出超过限制');
      if (key === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.on('error', e => finish(e.code === 'ENOENT' ? '命令不存在' : '无法执行命令'));
    child.on('close', code => finish(code === 0 ? null : `命令退出码 ${code}`, code));
    timer = setTimeout(() => stop(`检测超时（${Math.round(timeout / 1000)} 秒）`), timeout);
  });
}

export async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current], current);
    }
  }));
  return results;
}
