const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, clipboard, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

app.setName('OpenEnv');
let window, tray, inventory, scanning, quitting = false;
let preferences = { closeToTray: true };
const isDev = !app.isPackaged;
const root = path.join(__dirname, '..');
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();

function showWindow() {
  if (!window || window.isDestroyed()) createWindow();
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (process.platform === 'darwin') app.dock.show();
}

function send(channel, data) { if (window && !window.isDestroyed()) window.webContents.send(channel, data); }

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1000, minHeight: 680,
    backgroundColor: '#0b111b', title: 'OpenEnv', show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 22, y: 22 }, icon: path.join(root, 'assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.once('ready-to-show', () => {
    const openedAtLogin = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
    if (!tray || (!process.argv.includes('--hidden') && !openedAtLogin)) showWindow();
  });
  window.on('close', event => {
    if (!quitting && preferences.closeToTray && tray) {
      event.preventDefault(); window.hide();
      if (process.platform === 'darwin') app.dock.hide();
    }
  });
  if (isDev && process.env.OPENENV_DEV_URL) window.loadURL('http://127.0.0.1:5173');
  else window.loadFile(path.join(root, 'dist/index.html'));
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(inventory ? `OpenEnv · ${inventory.summary.installed} 项环境` : 'OpenEnv · 本机环境');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 OpenEnv', click: showWindow },
    { label: inventory ? `已发现 ${inventory.summary.installed} 项环境 · ${inventory.summary.installations} 处安装` : '本机开发环境', enabled: false },
    { type: 'separator' },
    { label: scanning ? '正在扫描…' : '重新扫描环境', enabled: !scanning, click: () => scan().catch(() => {}) },
    { type: 'separator' },
    { label: '退出 OpenEnv', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }
  ]));
}

async function scan() {
  if (scanning) return scanning;
  scanning = (async () => {
    try {
      const { scanInventory } = await import('./inventory.mjs');
      inventory = await scanInventory({ onProgress: progress => send('inventory:progress', progress) });
      send('inventory:updated', inventory);
      return inventory;
    } catch (error) {
      send('inventory:progress', { phase: 'error', message: '扫描未完成，请重新扫描并检查 Shell 启动配置。' });
      throw error;
    } finally { scanning = null; refreshTray(); }
  })();
  refreshTray();
  return scanning;
}

function getSettings() {
  const supported = process.platform === 'darwin' || process.platform === 'win32';
  const startup = supported ? app.getLoginItemSettings().openAtLogin : false;
  return { platform: process.platform, packaged: app.isPackaged, startup, startupSupported: supported && app.isPackaged,
    closeToTray: preferences.closeToTray, trayAvailable: !!tray, version: app.getVersion() };
}

async function savePreferences() {
  await fs.writeFile(path.join(app.getPath('userData'), 'preferences.json'), JSON.stringify(preferences), { mode: 0o600 });
}

function registerIPC() {
  // Require the current local main frame for every privileged operation.
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('不允许此请求');
    return fn(...args);
  });
  handle('inventory:scan', scan);
  handle('inventory:cached', () => inventory || null);
  handle('settings:get', getSettings);
  handle('settings:startup', enabled => {
    if (typeof enabled !== 'boolean') throw new Error('无效的开机启动设置');
    if (!getSettings().startupSupported) throw new Error('请在打包后的 macOS 或 Windows 应用中设置开机启动');
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ['--hidden'] });
    return getSettings();
  });
  handle('settings:close-to-tray', async enabled => {
    if (typeof enabled !== 'boolean') throw new Error('无效的窗口设置');
    preferences.closeToTray = enabled;
    await savePreferences();
    return getSettings();
  });
  handle('text:copy', text => {
    if (typeof text !== 'string' || text.length > 200000) throw new Error('无法复制此内容');
    clipboard.writeText(text); return true;
  });
  handle('file:reveal', async file => {
    if (typeof file !== 'string' || !inventory) throw new Error('无法打开此路径');
    const allowed = new Set([
      ...inventory.tools.flatMap(t => t.installations.flatMap(i => [i.path, i.realPath])),
      ...inventory.path.filter(p => p.exists).map(p => p.resolved),
      ...inventory.shell.configs.filter(p => p.exists).map(p => p.path)
    ]);
    if (!allowed.has(file)) throw new Error('路径不在检测结果中');
    await fs.access(file);
    shell.showItemInFolder(file); return true;
  });
  handle('inventory:export', async () => {
    if (!inventory) throw new Error('请先扫描环境');
    const result = await dialog.showSaveDialog(window, {
      title: '导出环境报告', defaultPath: `OpenEnv-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON 环境报告', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const { exportReport } = await import('./inventory.mjs');
    await fs.writeFile(result.filePath, JSON.stringify(exportReport(inventory), null, 2) + '\n', { mode: 0o600 });
    return { canceled: false };
  });
}

if (hasLock) {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('activate', showWindow);
  app.whenReady().then(async () => {
    try { preferences = { ...preferences, ...JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'preferences.json'), 'utf8')) }; } catch { /* First run. */ }
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'OpenEnv', submenu: [{ role: 'about' }, { type: 'separator' }, { label: '显示主窗口', click: showWindow }, { role: 'hide' }, { role: 'quit' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '窗口', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] }
    ]));
    try {
      const image = nativeImage.createFromPath(path.join(root, process.platform === 'darwin' ? 'assets/trayTemplate.png' : 'assets/icon.png'));
      if (process.platform === 'darwin') image.setTemplateImage(true);
      tray = new Tray(image.resize({ width: process.platform === 'darwin' ? 20 : 24, height: process.platform === 'darwin' ? 20 : 24 }));
      tray.on('double-click', showWindow);
      refreshTray();
    } catch { tray = null; }
    registerIPC();
    createWindow();
  });
}
