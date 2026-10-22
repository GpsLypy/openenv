import { _electron as electron } from 'playwright';
import electronBinary from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, '.local/verification');
await fs.mkdir(artifacts, { recursive: true });
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENENV_EXECUTABLE || electronBinary;
const packaged = !!process.env.OPENENV_EXECUTABLE;
const app = await electron.launch({ executablePath, args: packaged ? [] : [root], env: environment, timeout: 30000 });
const checks = [];
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.querySelectorAll('.tool-row').length > 0 && !document.querySelector('.scan-progress'), null, { timeout: 90000 });
  const data = await page.evaluate(() => window.openenv.cached());
  assert.ok(data.summary.installed > 0);
  checks.push(`real inventory: ${data.summary.installed} tools, ${data.summary.installations} installations`);
  const settings = await page.evaluate(() => window.openenv.settings());
  assert.equal(settings.trayAvailable, true);
  assert.equal(settings.startupSupported, packaged);
  checks.push('native tray exists; startup availability matches packaging');

  const node = data.tools.find(t => t.id === 'node');
  await page.locator('.tool-row').filter({ hasText: 'Node.js' }).click();
  assert.ok((await page.locator('.detail-panel').innerText()).includes(node.activePath.replace(data.machine.home, '~')));
  assert.equal(await page.locator('.installation').count(), node.installations.length);
  checks.push('Node.js inspector matches actual executable and installation count');
  await page.screenshot({ path: path.join(artifacts, 'overview.png') });

  const previousClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await page.getByRole('button', { name: '复制生效路径', exact: true }).click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), node.activePath);
  } finally { await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard); }
  checks.push('copy uses the real system clipboard and preserves its original text after verification');

  await page.getByRole('textbox', { name: '搜索环境', exact: true }).fill('no-environment-with-this-name');
  assert.equal(await page.locator('.tool-row').count(), 0);
  assert.ok((await page.locator('.inventory-panel').innerText()).includes('没有匹配的环境'));
  await page.getByRole('button', { name: '重置筛选' }).click();
  checks.push('search empty state and reset');

  await page.getByRole('navigation').getByRole('button', { name: /^语言运行时/ }).click();
  assert.equal(await page.locator('.tool-row').count(), data.tools.filter(t => t.installed && t.category === 'languages').length);
  await page.getByRole('checkbox', { name: '显示未安装' }).check();
  assert.equal(await page.locator('.tool-row').count(), data.tools.filter(t => t.category === 'languages').length);
  await page.getByRole('checkbox', { name: '显示未安装' }).uncheck();
  checks.push('category filter and missing tool visibility');

  await page.getByRole('navigation').getByRole('button', { name: /^Shell/ }).click();
  assert.equal(await page.locator('.shell-configs button').count(), data.shell.configs.length);
  assert.ok((await page.locator('.shell-current').innerText()).includes(data.shell.path));
  checks.push('shell view matches the captured shell and actual profile locations');

  await page.getByRole('navigation').getByRole('button', { name: /^环境变量/ }).click();
  await page.getByRole('button', { name: '全部变量', exact: true }).click();
  assert.equal(await page.locator('.env-row').count(), data.environment.length);
  assert.equal(await page.locator('.protected-value').count(), data.summary.redacted);
  await page.screenshot({ path: path.join(artifacts, 'environment.png') });
  checks.push('environment view preserves redaction contract');

  await page.getByRole('navigation').getByRole('button', { name: /^PATH 路径/ }).click();
  assert.equal(await page.locator('.path-entry').count(), data.path.length);
  await page.getByRole('button', { name: '只看待整理' }).click();
  assert.equal(await page.locator('.path-entry').count(), data.path.filter(p => !p.exists || p.duplicateOf !== null || p.relative).length);
  await page.screenshot({ path: path.join(artifacts, 'path.png') });
  checks.push('PATH order and issue filter');

  await page.getByRole('button', { name: /^偏好设置/ }).click();
  assert.equal(await page.getByRole('switch').count(), 2);
  assert.equal(await page.getByRole('switch', { name: '开机时启动 OpenEnv' }).isEnabled(), packaged);
  await page.screenshot({ path: path.join(artifacts, 'settings.png') });
  checks.push('startup and close-to-tray preferences present; native startup state read without changing it');

  const rejected = await page.evaluate(async () => { try { await window.openenv.reveal('/etc/passwd'); return false; } catch { return true; } });
  assert.equal(rejected, true);
  checks.push('IPC rejects unscanned reveal paths');

  const reportFile = path.join(artifacts, 'exported-report.json');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, reportFile);
  await page.getByRole('button', { name: '导出报告', exact: true }).click();
  await page.locator('.toast').filter({ hasText: '环境报告已导出' }).waitFor();
  const report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
  assert.equal(report.tools.length, data.summary.installed);
  assert.equal('environment' in report, false);
  assert.equal('hostname' in report.machine, false);
  checks.push('native export IPC writes a real report with no environment variable values');

  const isolation = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
  assert.deepEqual(isolation, { require: 'undefined', process: 'undefined' });
  checks.push('renderer has no Node.js globals');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  await app.evaluate(({ app }) => app.emit('activate'));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true);
  checks.push('close hides to tray; activate reopens the same window');

  await page.getByRole('navigation').getByRole('button', { name: /^环境总览/ }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1024, 768));
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  await page.screenshot({ path: path.join(artifacts, 'overview-1024.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 940));
  assert.deepEqual(errors, []);
  checks.push('1024px desktop layout has no horizontal overflow; no renderer errors');
  const [scanA,scanB] = await page.evaluate(() => Promise.all([window.openenv.scan(),window.openenv.scan()]));
  assert.equal(scanA.scannedAt,scanB.scannedAt);
  checks.push('concurrent refresh requests share one scan');
  await fs.writeFile(path.join(artifacts, 'desktop-results.json'), JSON.stringify({ packaged, checks, summary: data.summary, durationMs: data.durationMs, settings }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, packaged, checks }, null, 2));
} finally { await app.close(); }
