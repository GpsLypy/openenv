import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { updateChecksums } from './checksums.mjs';
if (process.platform !== 'darwin') throw new Error('DMG packaging requires macOS.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const source = path.join(root, 'release/mac-arm64/OpenEnv.app');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { stdio: 'inherit' });
await fs.mkdir(path.join(root, '.local'), { recursive: true });
const staging = await fs.mkdtemp(path.join(root, '.local/dmg-stage-'));
try {
  execFileSync('/usr/bin/ditto', [source, path.join(staging, 'OpenEnv.app')], { stdio: 'inherit' });
  await fs.symlink('/Applications', path.join(staging, 'Applications'));
  await fs.writeFile(path.join(staging, '安装说明.txt'), `OpenEnv ${version} — macOS Apple Silicon\n\n1. 将 OpenEnv.app 拖到 Applications 文件夹。\n2. 从“应用程序”打开 OpenEnv。\n3. 在“偏好设置”中按需开启开机启动；默认关闭。\n\n当前版本为本地 ad-hoc 签名，尚未经过 Apple 公证。\n从互联网下载后首次打开可能被 macOS 拦截，可在“系统设置 → 隐私与安全性”中审核并选择“仍要打开”。\n\n本版本仅提供 arm64 安装包；Windows、Linux 与 Intel Mac 尚未进行实机验收。\n环境检测在本地完成，报告不包含环境变量值。\n\n项目与版本：\nhttps://github.com/GpsLypy/openenv\nhttps://github.com/GpsLypy/openenv/releases/tag/v${version}\n`, 'utf8');
  const dmg = path.join(root, `release/OpenEnv-${version}-mac-arm64.dmg`);
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', 'OpenEnv', '-srcfolder', staging, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-ov', dmg], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['verify', dmg], { stdio: 'inherit' });
  await updateChecksums(root, version);
  console.log(`DMG: ${dmg}`);
} finally { await fs.rm(staging, { recursive: true, force: true }); }
