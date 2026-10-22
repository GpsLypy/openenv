import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { captureEnvironment, parseShellEnvironment, redactEnvironment, inspectPath, parseVersion, installationSource, scanInventory, exportReport } from '../electron/inventory.mjs';
import { run, mapLimit } from '../electron/process.mjs';

const wrapped = env => `profile output\n__OPENENV_ENV_BEGIN_9F21__${Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\0')}\0__OPENENV_ENV_END_9F21__prompt`;

test('shell parser ignores startup output and preserves equals and multiline values', () => {
  const parsed = parseShellEnvironment(wrapped({ PATH: '/bin:/usr/bin', CUSTOM: 'a=b\nc' }));
  assert.deepEqual(parsed, { PATH: '/bin:/usr/bin', CUSTOM: 'a=b\nc' });
  assert.equal(parseShellEnvironment('PATH=/bin'), null);
});

test('environment capture times out safely and never leaks stderr into the warning', async () => {
  const result = await captureEnvironment({ baseEnv: { SHELL: '/bin/zsh', PATH: '/bin' }, runner: async () => ({ error: '检测超时（10 秒）', stderr: 'SECRET=private-value' }) });
  assert.equal(result.source, 'fallback');
  assert.equal(result.env.PATH, '/bin');
  assert.match(result.warning, /超时/);
  assert.ok(!result.warning.includes('private-value'));
});

test('macOS login PATH starts from system defaults instead of an IDE or npm launcher', async () => {
  let passed;
  await captureEnvironment({ platform: 'darwin', baseEnv: { SHELL: '/bin/zsh', PATH: '/injected/ide/bin', LANG: 'zh_CN.UTF-8' }, runner: async (_file, _args, options) => {
    passed = options.env;
    return { stdout: wrapped({ PATH: '/real/login/bin', SHELL: '/bin/zsh' }), error: null };
  } });
  assert.equal(passed.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.equal(passed.LANG, 'zh_CN.UTF-8');
});

test('only allowlisted non-sensitive variable values reach the renderer', () => {
  const entries = redactEnvironment({ PATH: '/usr/bin', GOPATH: '/home/test/go', MY_SERVICE: 'secret-value', API_KEY: 'sk-private', DATABASE_URL: 'postgres://a:b@localhost/db', GOPROXY: 'https://a:password@proxy.test', CUSTOM_TOKEN: 'secret', LANG: 'zh_CN.UTF-8' });
  assert.equal(entries.find(e => e.name === 'GOPATH').value, '/home/test/go');
  assert.equal(entries.find(e => e.name === 'LANG').value, 'zh_CN.UTF-8');
  for (const name of ['MY_SERVICE','API_KEY','DATABASE_URL','GOPROXY','CUSTOM_TOKEN']) assert.equal(entries.find(e => e.name === name).value, null);
  assert.ok(!JSON.stringify(entries).includes('secret-value'));
});

test('PATH keeps true precedence and flags relative, duplicate and missing locations', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openenv-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'bin'));
  const entries = await inspectPath(`${root}/bin:${root}/bin:${root}/gone::bin`, { cwd: root });
  assert.equal(entries[1].duplicateOf, 0);
  assert.equal(entries[2].exists, false);
  assert.equal(entries[3].relative, true);
  assert.equal(entries[3].resolved, root);
  assert.equal(entries[4].duplicateOf, 0);
});

test('Windows PATH matching is case-insensitive and semicolon-delimited', async () => {
  const entries = await inspectPath('C:\\Tools;C:\\tools;D:\\SDK', { platform: 'win32', cwd: 'C:\\Users\\test', io: { stat: async () => ({ isDirectory: () => true }) } });
  assert.equal(entries.length, 3);
  assert.equal(entries[1].duplicateOf, 0);
  assert.equal(entries[2].resolved, 'D:\\SDK');
});

test('version and installation provenance reflect executable evidence', () => {
  assert.equal(parseVersion('go version go1.26.1 darwin/arm64', 'go').version, '1.26.1');
  assert.equal(parseVersion('openjdk version "21.0.2" 2024-01-16', 'java').version, '21.0.2');
  assert.equal(parseVersion('Apple clang version 21.0.0 (clang-2100)', 'gcc').version, '21.0.0');
  assert.equal(parseVersion('not a version', 'node').version, null);
  assert.equal(installationSource('/opt/homebrew/bin/go', '/opt/homebrew/Cellar/go/1.26.1/bin/go'), 'Homebrew');
  assert.equal(installationSource('/home/test/.nvm/versions/node/v22/bin/node', '/home/test/.nvm/versions/node/v22/bin/node'), 'nvm');
});

test('real filesystem scan deduplicates symlinks, discovers inactive nvm, and does not promote a failed active version', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openenv-scan-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  const third = path.join(root, 'third');
  const inactive = path.join(root, '.nvm/versions/node/v24.0.0/bin');
  for (const dir of [first,second,third,inactive]) await fs.mkdir(dir, { recursive: true });
  for (const dir of [first,third,inactive]) await fs.writeFile(path.join(dir,'node'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  await fs.symlink(path.join(first,'node'), path.join(second,'node'));
  const env = { PATH: [first,second,third].join(':'), SHELL: '/bin/zsh', HOME: root, API_TOKEN: 'must-never-appear' };
  const io = Object.fromEntries(['stat','access','realpath','readdir'].map(method => [method, async (...args) => {
    if (!String(args[0]).startsWith(root)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return fs[method](...args);
  }]));
  let probes = 0;
  const runner = async (file, args, options) => {
    if (file === '/bin/zsh') return { stdout: wrapped(env), stderr: '', error: null };
    probes++;
    assert.equal(options.env.COREPACK_ENABLE_NETWORK, '0');
    assert.equal(options.env.RUSTUP_AUTO_INSTALL, '0');
    if (file === path.join(first,'node')) return { stdout: 'secret-wrapper-output', stderr: '', error: '命令退出码 1' };
    return { stdout: file.includes('.nvm') ? 'v24.0.0' : 'v22.0.0', stderr: '', error: null };
  };
  const data = await scanInventory({ home: root, platform: 'darwin', baseEnv: env, io, runner, registry: [{ id:'node',name:'Node.js',command:'node',args:['--version'],category:'languages' }] });
  const node = data.tools[0];
  assert.equal(probes, 3);
  assert.equal(node.installations.length, 3);
  assert.equal(node.installations[0].aliases.length, 2);
  assert.equal(node.activePath, path.join(first,'node'));
  assert.equal(node.version, null);
  assert.equal(node.installations[2].version, '24.0.0');
  assert.equal(node.installations[2].pathIndex, null);
  assert.equal(node.conflict, true);
  assert.ok(!JSON.stringify(data).includes('must-never-appear'));
  assert.ok(!JSON.stringify(data).includes('secret-wrapper-output'));
  const report = exportReport(data);
  assert.equal('environment' in report, false);
  assert.ok(!JSON.stringify(report).includes('API_TOKEN'));
});

test('local reports omit all variable values and arbitrary future fields', () => {
  const inventory = { schemaVersion: 1, scannedAt: 'today', machine: { platform: 'darwin', arch: 'arm64', osName: 'macOS', hostname: 'private-host' }, shell: { path:'/bin/zsh',version:'5.9',source:'login-shell',secret:'hidden' }, summary:{}, tools:[],path:[],environment:[{name:'HOME',value:'private-home'}], futurePrivateData:'secret',scope:'bounded' };
  const report = JSON.stringify(exportReport(inventory));
  for (const secret of ['private-home','private-host','futurePrivateData','hidden']) assert.ok(!report.includes(secret));
});

test('versioned compiler aliases are discovered without overriding the default command', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openenv-alias-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const first = path.join(root,'a'), second = path.join(root,'b'), third = path.join(root,'c');
  for (const directory of [first,second,third]) await fs.mkdir(directory);
  await fs.writeFile(path.join(first,'gcc-15'), '#!/bin/sh\n', { mode: 0o755 });
  await fs.writeFile(path.join(second,'gcc'), '#!/bin/sh\n', { mode: 0o755 });
  await fs.symlink(path.join(first,'gcc-15'),path.join(third,'gcc'));
  const env = { SHELL:'/bin/zsh', PATH:[first,second,third].join(':') };
  const io = Object.fromEntries(['stat','access','realpath','readdir'].map(method => [method, async (...args) => {
    if (!String(args[0]).startsWith(root)) throw new Error('missing');
    return fs[method](...args);
  }]));
  const data = await scanInventory({ home:root, platform:'darwin', baseEnv:env,io,
    registry:[{id:'gcc',name:'GCC',command:'gcc',args:['--version'],category:'toolchain'}],
    runner:async file => file === '/bin/zsh' ? { stdout:wrapped(env),error:null } : { stdout:file.includes('/b/') ? 'Apple clang version 21.0.0' : 'gcc 15.1.0',stderr:'',error:null }
  });
  assert.equal(data.tools[0].activePath,path.join(second,'gcc'));
  assert.equal(data.tools[0].name,'GCC / Clang');
  assert.equal(data.tools[0].version,'21.0.0');
  assert.equal(data.tools[0].installations.length,2);
  assert.equal(data.tools[0].installations[1].path,path.join(third,'gcc'));
  assert.equal(data.tools[0].installations[1].aliases.length,2);
});

test('probe process is bounded by time and output size', async () => {
  const started = Date.now();
  const result = await run(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { timeout: 100 });
  assert.match(result.error, /超时/);
  assert.ok(Date.now() - started < 2000);
  const oversized = await run(process.execPath, ['-e', 'process.stdout.write("a".repeat(100000))'], { maxBytes: 100 });
  assert.match(oversized.error, /超过限制/);
});

test('probe pool never exceeds its concurrency limit', async () => {
  let active = 0, peak = 0;
  const results = await mapLimit([1,2,3,4,5], 2, async value => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 10)); active--; return value * 2; });
  assert.deepEqual(results, [2,4,6,8,10]);
  assert.equal(peak, 2);
});
