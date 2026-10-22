import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Box, Braces, Check, CheckCheck, ChevronRight, CircleHelp, Command, Copy, CornerDownRight, FileCode2, FolderOpen, GitBranch, HardDrive, Info, Layers3, ListFilter, LoaderCircle, LockKeyhole, Monitor, MoreHorizontal, Package, PanelLeftClose, RefreshCw, Route, Search, Settings2, ShieldCheck, Terminal, TriangleAlert, X } from 'lucide-react';
import type { Category, EnvEntry, Inventory, OpenEnvAPI, Progress, Settings, Tool, View } from './types';

const labels: Record<View, string> = { all: '环境总览', languages: '语言运行时', toolchain: '开发工具', managers: '包与版本管理', shells: 'Shell', environment: '环境变量', path: 'PATH 路径', settings: '偏好设置' };
const categoryNames: Record<Category, string> = { languages: '语言运行时', toolchain: '开发工具', managers: '包与版本管理', shells: 'Shell' };
const nav = [
  { id: 'all', icon: Layers3 }, { id: 'languages', icon: Braces }, { id: 'toolchain', icon: Box },
  { id: 'managers', icon: Package }, { id: 'shells', icon: Terminal },
  { id: 'environment', icon: FileCode2 }, { id: 'path', icon: Route }
] as const;
const shortPath = (p: string, home?: string) => home && p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
const time = (date?: string) => date ? new Date(date).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未扫描';

function ToolMark({ tool, large = false }: { tool: Tool; large?: boolean }) {
  return <span className={`tool-mark ${large ? 'large' : ''}`} style={{ '--tool-color': tool.color } as CSSProperties}>{tool.mark}</span>;
}
function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
function Empty({ icon = <Search size={25} />, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-symbol">{icon}</div><h3>{title}</h3><div>{children}</div></div>;
}
function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'on' : ''}`} onClick={onChange}><span /></button>;
}

export default function App() {
  const api = window.openenv;
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('node');
  const [showMissing, setShowMissing] = useState(false);
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ phase: '', message: '准备检测…' });
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [settingBusy, setSettingBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer); }, [toast]);
  const rescan = useCallback(async () => {
    if (!api) return;
    setScanning(true); setError(''); setProgress({ phase: 'shell', message: '读取登录 Shell 环境…' });
    try { setInventory(await api.scan()); } catch { setError('扫描未完成，请重新扫描。若持续失败，请检查 Shell 启动配置。'); }
    finally { setScanning(false); }
  }, [api]);
  useEffect(() => {
    if (!api) return;
    const offProgress = api.onProgress(p => { if (p.phase === 'error') { setScanning(false); setError(p.message); } else { setScanning(true); setProgress(p); } });
    const offInventory = api.onInventory(data => { setInventory(data); setScanning(false); });
    if (!initialized.current) {
      initialized.current = true;
      api.settings().then(setSettings).catch(() => setError('无法读取应用设置'));
      api.cached().then(cached => cached ? setInventory(cached) : rescan()).catch(() => rescan());
    }
    return () => { offProgress(); offInventory(); };
  }, [api, rescan]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') { e.preventDefault(); rescan(); }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); setView('settings'); setSearch(''); }
      if (e.key === 'Escape') { setSearch(''); searchRef.current?.blur(); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [rescan]);

  const filtered = useMemo(() => (inventory?.tools || []).filter(tool => {
    if (!showMissing && !tool.installed) return false;
    if (view !== 'all' && tool.category !== view) return false;
    if (onlyAttention && !tool.conflict && !tool.installations.some(i => i.status === 'unverified' || i.pathIndex === null)) return false;
    return `${tool.name} ${tool.command} ${tool.version || ''} ${tool.installations.map(i => i.path + ' ' + i.source).join(' ')}`.toLowerCase().includes(search.toLowerCase());
  }), [inventory, view, showMissing, search, onlyAttention]);
  const selected = filtered.find(t => t.id === selectedId) || filtered[0];
  const toolView = ['all', 'languages', 'toolchain', 'managers', 'shells'].includes(view);
  const goTo = (next: View) => { setView(next); setSearch(''); setOnlyAttention(false); };
  const copy = async (text: string) => { try { await api?.copy(text); notify('已复制'); } catch { notify('复制失败，请重试'); } };
  const reveal = async (file: string) => { try { await api?.reveal(file); } catch { notify('路径已变化，请重新扫描'); } };
  const doExport = async () => { try { const result = await api?.exportReport(); if (result && !result.canceled) notify('环境报告已导出'); } catch { notify('导出失败，请检查文件保存位置'); } };
  const updateSetting = async (name: 'startup' | 'closeToTray') => {
    if (!api || !settings) return;
    setSettingBusy(true);
    try { setSettings(name === 'startup' ? await api.setStartup(!settings.startup) : await api.setCloseToTray(!settings.closeToTray)); notify('设置已更新'); }
    catch { notify('系统未能应用设置，请检查系统登录项权限'); }
    finally { setSettingBusy(false); }
  };

  return <div className="app-shell">
    <header className="titlebar"><div className="window-title"><Terminal size={14} /> OpenEnv <span>/ 本机环境工作台</span></div><div className="titlebar-right"><span className="live-dot" /> LOCAL WORKSPACE</div></header>
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Terminal size={23} strokeWidth={2.5} /></div><div><strong>OpenEnv<span className="brand-dot">.</span></strong><span>让开发环境，一目了然</span></div></div>
      <div className="sidebar-label">工作空间 <span>WORKSPACE</span></div>
      <nav aria-label="主导航">{nav.map(({ id, icon: Icon }) => {
        const count = id === 'all' ? inventory?.summary.installed : id === 'environment' ? inventory?.environment.length : id === 'path' ? inventory?.path.length : inventory?.tools.filter(t => t.installed && t.category === id).length;
        return <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => goTo(id)}><Icon size={17} /><span>{labels[id]}</span><small>{count ?? '—'}</small></button>;
      })}</nav>
      <div className="sidebar-bottom">
        <div className="local-note"><div className="local-note-icon"><ShieldCheck size={16} /><strong>只在你的电脑上</strong></div><p>本地检测，配置不上传。<br />每个环境，都有迹可循。</p><div className="local-note-line"><span /> LOCAL FIRST</div></div>
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => goTo('settings')}><Settings2 size={17} /><span>偏好设置</span><small>⌘ ,</small></button>
        <div className="sidebar-version"><span className="live-dot" /> OpenEnv <span>v{settings?.version || '0.1.0'}</span></div>
      </div>
    </aside>
    <main className="workspace">
      <div className="workspace-top"><div className="breadcrumb"><Monitor size={15} /><span>本机</span><ChevronRight size={13} /><strong>{labels[view]}</strong></div><div className="machine-chip"><span className="live-dot" />{inventory ? `${inventory.machine.osName} · ${inventory.machine.arch === 'arm64' ? 'Apple Silicon' : inventory.machine.arch}` : '本地设备'}</div></div>
      <div className="workspace-body">
        <section className="page-heading"><div><div className="eyebrow">YOUR ENVIRONMENT, IN SIGHT</div><h1>{labels[view]}<span className="heading-period">.</span></h1><p>{view === 'all' ? '装了什么，正在用哪个，路径在哪里。一次看清。' : view === 'environment' ? '查看 Shell 导出的配置，敏感与未知变量的值已隐藏。' : view === 'path' ? '从前向后查找命令；第一个匹配的可执行文件生效。' : view === 'settings' ? '按你的习惯，让 OpenEnv 留在手边。' : view === 'shells' ? '从登录 Shell 到启动配置，了解环境是如何加载的。' : '查看已发现的环境、当前版本与安装来源。'}</p></div><div className="heading-actions"><button className="button secondary" onClick={doExport} disabled={!inventory}><ArrowDownToLine size={15} />导出报告</button><button className="button primary" onClick={rescan} disabled={scanning || !api}><RefreshCw size={15} className={scanning ? 'spin' : ''} />{scanning ? '正在扫描' : '重新扫描'}</button></div></section>
        {!api && <div className="notice"><Info size={17} /><span>请在 OpenEnv 桌面应用中打开此界面，即可检测本机真实环境。运行 <code>npm run dev</code> 启动。</span></div>}
        {error && <div className="notice error" role="alert"><TriangleAlert size={17} /><span>{error}</span><button className="icon-button" aria-label="关闭错误提示" onClick={() => setError('')}><X size={15} /></button></div>}
        {inventory?.shell.warning && <div className="notice"><TriangleAlert size={17} /><span>{inventory.shell.warning}</span></div>}
        {scanning && <div className="scan-progress" role="status"><span className="scan-progress-line" /><LoaderCircle className="spin" size={14} /><span>{progress.message}</span><small>检测过程中不会修改环境配置</small></div>}
        {inventory && toolView && <>
          <div className="summary-strip">
            <div className="summary-cell"><div className="summary-icon blue"><Braces size={19} /></div><div><span>已发现环境</span><strong>{inventory.summary.installed}<small>项</small></strong></div><span className="summary-aside">{inventory.summary.installations} 处安装</span></div>
            <div className="summary-cell"><div className="summary-icon green"><Terminal size={19} /></div><div><span>当前登录 Shell</span><strong className="shell-summary">{inventory.shell.path.split(/[\\/]/).pop()}<small>{inventory.shell.version}</small></strong></div><Badge tone={inventory.shell.source === 'fallback' ? 'amber' : 'green'}>{inventory.shell.source === 'login-shell' ? '已读取' : inventory.shell.source === 'fallback' ? '已回退' : '应用环境'}</Badge></div>
            <button className="summary-cell summary-action" onClick={() => goTo('path')}><div className="summary-icon amber"><Route size={19} /></div><div><span>PATH 待整理</span><strong>{inventory.summary.pathIssues}<small>处</small></strong></div><ChevronRight size={17} /></button>
          </div>
          {view === 'shells' && <ShellPanel inventory={inventory} reveal={reveal} />}
        </>}
        {toolView && <div className="inventory-layout">
          <section className="panel inventory-panel">
            <div className="panel-heading"><div className="panel-title"><span className="section-dot" /><h2>{view === 'all' ? '环境清单' : labels[view]}</h2><span className="panel-count">{filtered.length}</span></div><button className={`text-button ${onlyAttention ? 'selected-filter' : ''}`} onClick={() => setOnlyAttention(!onlyAttention)} aria-pressed={onlyAttention}><ListFilter size={14} />待关注</button></div>
            <div className="list-toolbar"><div className="search-field"><Search size={15} /><input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索环境、版本或路径…" aria-label="搜索环境" />{search ? <button className="icon-button" onClick={() => setSearch('')} aria-label="清除搜索"><X size={13} /></button> : <kbd>⌘ K</kbd>}</div><label className="checkbox-label"><input type="checkbox" checked={showMissing} onChange={e => setShowMissing(e.target.checked)} />显示未安装</label></div>
            <div className="table-heading"><span>环境 / 来源</span><span>当前版本</span><span>状态</span></div>
            <div className="tool-list">{filtered.map(tool => <button className={`tool-row ${selected?.id === tool.id ? 'selected' : ''}`} key={tool.id} onClick={() => setSelectedId(tool.id)} aria-pressed={selected?.id === tool.id}>
              <ToolMark tool={tool} /><div className="tool-name"><strong>{tool.name}{tool.installations.length > 1 && <span className="install-count">{tool.installations.length}</span>}</strong><span>{tool.installations.find(i => i.active)?.source || tool.installations[0]?.source || tool.description}<i>·</i>{categoryNames[tool.category]}</span></div>
              <code className={!tool.version ? 'muted' : ''}>{tool.version ? `v${tool.version}` : tool.installed ? '未确认' : '—'}</code>
              <div className="tool-status">{!tool.installed ? <Badge>未发现</Badge> : tool.conflict ? <Badge tone="amber"><span />多路径</Badge> : !tool.activePath ? <Badge tone="amber">未在 PATH</Badge> : tool.installations.find(i => i.active)?.status === 'unverified' ? <Badge tone="amber">待确认</Badge> : <Badge tone="green"><span />可用</Badge>}<ChevronRight size={14} /></div>
            </button>)}</div>
            {!filtered.length && <Empty icon={scanning ? <LoaderCircle size={26} className="spin" /> : <Search size={26} />} title={scanning && !inventory ? '正在认识你的开发环境' : !inventory ? '从一次本机扫描开始' : '没有匹配的环境'}>{scanning ? '正在读取 Shell，并检查常见安装位置。' : inventory ? <><p>试试其他关键词，或查看全部环境。</p><button className="text-button" onClick={() => { setSearch(''); setOnlyAttention(false); setShowMissing(false); }}>重置筛选 <ArrowRight size={14} /></button></> : '扫描后会显示真实版本、安装来源与路径。'}</Empty>}
            <div className="list-footnote"><Info size={13} /><span>只读检测 · 不安装、不升级、不改动配置</span><span>{inventory ? `${filtered.filter(t => t.installed).length} 项已安装` : '等待扫描'}</span></div>
          </section>
          <section className="panel detail-panel" aria-label="环境详情">{selected && inventory ? <ToolDetail tool={selected} inventory={inventory} copy={copy} reveal={reveal} /> : <Empty icon={<GitBranch size={26} />} title="每个环境，都有来处">选择一个环境，查看安装与解析路径。</Empty>}</section>
        </div>}
        {view === 'environment' && <EnvironmentPanel inventory={inventory} search={search} setSearch={setSearch} inputRef={searchRef} copy={copy} />}
        {view === 'path' && <PathPanel inventory={inventory} copy={copy} reveal={reveal} />}
        {view === 'settings' && <section className="panel settings-panel"><div className="panel-heading"><div className="panel-title"><Settings2 size={16} /><h2>应用行为</h2></div><Badge>本机设置</Badge></div>
          <div className="setting-row"><div className="setting-symbol"><Monitor size={20} /></div><div><h3>开机时启动 OpenEnv</h3><p>{settings?.startupSupported ? '登录电脑后，在菜单栏中安静启动。' : 'macOS / Windows 安装版支持；开发模式与 Linux 暂不提供此设置。'}</p></div><Toggle checked={settings?.startup || false} label="开机时启动 OpenEnv" disabled={!settings?.startupSupported || settingBusy} onChange={() => updateSetting('startup')} /></div>
          <div className="setting-row"><div className="setting-symbol"><PanelLeftClose size={20} /></div><div><h3>关闭窗口后留在菜单栏</h3><p>{settings?.trayAvailable ? '随时从菜单栏重新打开；使用“退出 OpenEnv”结束应用。' : '当前未连接到系统托盘。'}</p></div><Toggle checked={settings?.closeToTray || false} label="关闭窗口后留在菜单栏" disabled={!settings?.trayAvailable || settingBusy} onChange={() => updateSetting('closeToTray')} /></div>
          <div className="settings-subhead">检测与隐私</div><div className="setting-row"><div className="setting-symbol"><HardDrive size={20} /></div><div><h3>本地，只读，按需扫描</h3><p>读取登录 Shell、PATH 与常见版本管理器目录。不会遍历整个磁盘，<br />不会修改 Shell 配置，也不会自动安装环境。</p></div><ShieldCheck size={18} className="green-text" /></div>
          <div className="setting-row"><div className="setting-symbol"><LockKeyhole size={20} /></div><div><h3>环境变量的保护</h3><p>敏感与未知变量的值不传入界面，报告省略所有变量值。<br />报告包含安装路径，分享前请检查其中的用户名。</p></div></div>
          <div className="about-block"><div className="brand-icon"><Terminal size={24} /></div><div><strong>OpenEnv <Badge>v{settings?.version || '0.1.0'}</Badge></strong><p>把散落的开发环境，放回清晰的秩序里。</p></div><span>BUILT FOR YOUR MACHINE</span></div>
        </section>}
        {inventory && toolView && <div className="bottom-hint"><div><Terminal size={15} /><span>环境来自</span><code>{shortPath(inventory.shell.path, inventory.machine.home)}</code><Badge>{inventory.shell.source === 'login-shell' ? 'login + interactive' : 'process environment'}</Badge></div><span>检测范围：PATH + 常见安装位置 <CircleHelp size={13}><title>{inventory.scope}</title></CircleHelp></span></div>}
      </div>
      <footer className="statusbar"><div><span className={`live-dot ${scanning ? 'scanning' : ''}`} />{scanning ? progress.message : inventory ? '本机环境已就绪' : '等待本机扫描'}{inventory && <span className="status-separator" />}{inventory && <span>{inventory.machine.hostname}</span>}</div><div>{inventory && <><span>最近扫描 {time(inventory.scannedAt)}</span><span className="status-separator" /><span>{(inventory.durationMs / 1000).toFixed(1)}s</span></>}<ShieldCheck size={12} /><span>本地只读</span></div></footer>
    </main>
    {toast && <div className="toast" role="status"><CheckCheck size={17} />{toast}<button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}><X size={13} /></button></div>}
  </div>;
}

function ToolDetail({ tool, inventory, copy, reveal }: { tool: Tool; inventory: Inventory; copy: (s: string) => void; reveal: (s: string) => void }) {
  const active = tool.installations.find(i => i.active);
  const current = active || tool.installations[0];
  const route = inventory.path.filter(p => p.exists && p.duplicateOf === null && (!active || active.pathIndex === null || p.index <= active.pathIndex));
  const visibleRoute = route.length > 4 ? [...route.slice(0, 2), ...route.slice(-2)] : route;
  return <>
    <div className="panel-heading detail-label"><div className="panel-title"><GitBranch size={15} /><h2>环境详情</h2></div><span className="tiny-caps">INSPECT</span></div>
    <div className="detail-content"><div className="detail-identity"><ToolMark tool={tool} large /><div><div className="detail-name">{tool.name}<ArrowUpRight size={16} /></div><p>{tool.description}</p></div></div>
      <div className="version-line"><code>{tool.version ? `v${tool.version}` : tool.installed ? '版本未确认' : '未发现安装'}</code><Badge tone={active?.status === 'verified' ? 'green' : 'muted'}>{active ? '当前生效' : tool.installed ? '未在 PATH' : '未安装'}</Badge></div>
      {current?.flavor && <div className="inline-note amber-text"><Info size={13} />{current.flavor}</div>}
      {!tool.installed ? <div className="detail-note"><Info size={15} /><p>在 PATH 与常见安装目录中没有发现 {tool.name}。自定义位置或项目虚拟环境可能不在检测范围内。</p></div> : <>
        <div className="detail-meta"><span>安装来源</span><strong>{current.source}<Badge>{categoryNames[tool.category]}</Badge></strong><span>调用命令</span><code>{tool.command} {tool.args.join(' ')}</code></div>
        <div className="detail-section-title"><h3>{active ? '生效路径' : '发现的安装路径'}</h3><button className="icon-button" title="复制路径" aria-label="复制生效路径" onClick={() => copy(current.path)}><Copy size={13} /></button></div>
        <div className="path-box"><code>{shortPath(current.path, inventory.machine.home)}</code><button className="icon-button" title="在文件管理器中显示" aria-label="显示生效文件" onClick={() => reveal(current.path)}><FolderOpen size={15} /></button></div>
        {current.path !== current.realPath && <div className="resolved-path"><CornerDownRight size={12} /><code title={current.realPath}>{shortPath(current.realPath, inventory.machine.home)}</code></div>}
        <div className="detail-section-title"><h3>安装记录 <span>{tool.installations.length}</span></h3><span className="tiny-caps">DISCOVERED</span></div>
        <div className="installations">{tool.installations.map((install, index) => <div className={`installation ${install.active ? 'is-active' : ''}`} key={install.realPath}>
          <div className="installation-node"><span /></div><div className="installation-body"><div><strong>{install.version ? `v${install.version}` : '版本未确认'}</strong>{install.active ? <Badge tone="green">生效</Badge> : <span className="install-source">{install.pathIndex === null ? '未在 PATH' : !install.isDefaultCommand ? `专用命令 ${install.command}` : '被前序覆盖'}</span>}</div><p>{install.source}<span>·</span>{install.status === 'verified' ? '版本已确认' : install.error}</p><button className="installation-path" title={install.path} onClick={() => copy(install.path)}>{shortPath(install.path, inventory.machine.home)}<Copy size={11} /></button>{install.aliases.length > 1 && <small>{install.aliases.length} 个路径指向同一文件</small>}</div><button className="icon-button" onClick={() => reveal(install.path)} aria-label={`显示安装 ${index + 1}`}><FolderOpen size={13} /></button>
        </div>)}</div>
        {tool.truncated && <p className="inline-note amber-text">安装过多，仅显示前 24 处。</p>}
        <div className="detail-section-title"><h3>PATH 解析顺序</h3><Route size={13} /></div>
        <div className="path-route">{visibleRoute.map((entry, i) => <div className={entry.index === active?.pathIndex ? 'route-active' : ''} key={entry.index}><span className="route-number">{String(entry.index + 1).padStart(2, '0')}</span><code title={entry.resolved}>{shortPath(entry.resolved, inventory.machine.home)}</code>{entry.index === active?.pathIndex ? <Check size={13} /> : i === 1 && route.length > 4 ? <MoreHorizontal size={13} /> : <span className="route-pass">↓</span>}</div>)}</div>
        <div className={`detail-note ${tool.conflict ? 'attention-note' : ''}`}><Info size={15} /><p>{tool.conflict ? 'PATH 中有多个不同安装。前面的版本优先生效，其余版本仍保留在电脑上。' : active ? 'Shell 按 PATH 顺序查找命令，找到第一个可执行文件后即停止。' : '已找到安装文件，但当前登录 Shell 无法通过命令名直接使用。'}</p></div>
      </>}
    </div>
  </>;
}

function ShellPanel({ inventory, reveal }: { inventory: Inventory; reveal: (s: string) => void }) {
  return <section className="panel shell-panel"><div className="shell-current"><Terminal size={25} /><div><span>当前默认 Shell</span><strong>{inventory.shell.path}<Badge tone="green">{inventory.shell.version || '版本未确认'}</Badge></strong></div><span className="tiny-caps">LOGIN SHELL</span></div><div className="shell-configs">{inventory.shell.configs.map(config => <button key={config.name} disabled={!config.exists} onClick={() => reveal(config.path)}><FileCode2 size={16} /><code>{config.name}</code><Badge tone={config.exists ? 'blue' : 'muted'}>{config.exists ? '已找到' : '不存在'}</Badge>{config.exists && <ArrowUpRight size={13} />}</button>)}</div><p className="shell-footnote">配置文件仅展示位置。Shell 按各自的启动规则加载它们，此处不推断某个变量来自哪一行。</p></section>;
}

function EnvironmentPanel({ inventory, search, setSearch, inputRef, copy }: { inventory: Inventory | null; search: string; setSearch: (s: string) => void; inputRef: React.RefObject<HTMLInputElement | null>; copy: (s: string) => void }) {
  const [group, setGroup] = useState('development');
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = (inventory?.environment || []).filter(e => (group === 'all' || e.group === 'development') && e.name.toLowerCase().includes(search.toLowerCase()));
  return <section className="panel variables-panel"><div className="panel-heading"><div className="panel-title"><FileCode2 size={16} /><h2>Shell 环境变量</h2><span className="panel-count">{inventory?.environment.length || 0}</span></div><Badge><LockKeyhole size={12} />{inventory?.summary.redacted || 0} 项值已保护</Badge></div><div className="view-toolbar"><div className="segmented"><button className={group === 'development' ? 'active' : ''} onClick={() => setGroup('development')}>开发环境</button><button className={group === 'all' ? 'active' : ''} onClick={() => setGroup('all')}>全部变量</button></div><div className="search-field"><Search size={15} /><input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索变量名称…" aria-label="搜索变量名称" /></div></div><div className="env-head"><span>变量名称</span><span>当前值</span><span /></div>
      {entries.map((entry: EnvEntry) => <div className={`env-row ${expanded === entry.name ? 'expanded' : ''}`} key={entry.name}><code className="env-name">{entry.name}</code>{entry.redacted ? <span className="protected-value"><LockKeyhole size={12} />已保护 · 值不传入界面</span> : <button className="env-value" onClick={() => setExpanded(expanded === entry.name ? null : entry.name)} title="展开或收起变量值"><code>{entry.value || '(空值)'}</code></button>}{!entry.redacted ? <button className="icon-button" aria-label={`复制 ${entry.name}`} onClick={() => copy(entry.value || '')}><Copy size={14} /></button> : <ShieldCheck size={14} className="muted" />}</div>)}
      {!entries.length && <Empty title="没有匹配的变量">试试其他名称，或切换到全部变量。</Empty>}<div className="privacy-footnote"><ShieldCheck size={15} /><span>敏感与未知变量默认保护；支持查看的常用路径变量也会检查凭据格式。导出的报告不含任何变量值。</span></div>
    </section>;
}

function PathPanel({ inventory, copy, reveal }: { inventory: Inventory | null; copy: (s: string) => void; reveal: (s: string) => void }) {
  const [onlyIssues, setOnlyIssues] = useState(false);
  const entries = (inventory?.path || []).filter(e => !onlyIssues || !e.exists || e.duplicateOf !== null || e.relative);
  return <section className="panel paths-panel"><div className="panel-heading"><div className="panel-title"><Route size={17} /><h2>命令查找顺序</h2><span className="panel-count">{inventory?.path.length || 0}</span></div><button className="button secondary compact" disabled={!inventory} onClick={() => copy((inventory?.path || []).map(p => p.path === '(当前目录)' ? '' : p.path).join(inventory?.machine.platform === 'win32' ? ';' : ':'))}><Copy size={13} />复制 PATH</button></div><div className="path-explainer"><div className="path-flow"><Terminal size={17} /><code>command</code><ArrowRight size={14} /><span>PATH 01</span><ArrowRight size={14} /><span>PATH 02</span><ArrowRight size={14} /><span className="green-text">首个匹配生效</span></div><button className={`text-button ${onlyIssues ? 'selected-filter' : ''}`} onClick={() => setOnlyIssues(!onlyIssues)} aria-pressed={onlyIssues}><ListFilter size={14} />只看待整理</button></div>
    <div className="path-list">{entries.map(entry => <div className={`path-entry ${!entry.exists || entry.duplicateOf !== null ? 'path-issue' : ''}`} key={entry.index}><span className="path-index">{String(entry.index + 1).padStart(2, '0')}</span><div className="path-entry-text"><code>{shortPath(entry.path, inventory?.machine.home)}</code>{entry.duplicateOf !== null && <span>与第 {entry.duplicateOf + 1} 项重复；可手动检查 Shell 配置</span>}{!entry.exists && <span>目录不存在；可能已卸载或移动</span>}{entry.relative && <span>相对路径，按 Shell 工作目录解析</span>}</div><Badge tone={!entry.exists || entry.duplicateOf !== null || entry.relative ? 'amber' : 'green'}>{!entry.exists ? '不存在' : entry.duplicateOf !== null ? '重复' : entry.relative ? '相对路径' : '目录有效'}</Badge><button className="icon-button" aria-label={`复制 PATH 第 ${entry.index + 1} 项`} onClick={() => copy(entry.resolved)}><Copy size={14} /></button><button disabled={!entry.exists} className="icon-button" aria-label={`打开 PATH 第 ${entry.index + 1} 项`} onClick={() => reveal(entry.resolved)}><FolderOpen size={15} /></button></div>)}</div>{!entries.length && <Empty icon={<CheckCheck size={26} />} title={onlyIssues ? '没有需要整理的路径' : '等待扫描 PATH'}>重新扫描可获取当前登录 Shell 的最新路径。</Empty>}<div className="privacy-footnote"><Info size={15} /><span>OpenEnv 仅展示问题，不自动删除或重排 PATH。更改 Shell 配置后，重新扫描即可更新。</span></div></section>;
}
