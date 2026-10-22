import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import assert from 'node:assert/strict';
async function manifest(directory, relative = '') {
  const records = [];
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes:true });
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name), full = path.join(directory,name);
    if (entry.isSymbolicLink()) records.push(['link',name,await fs.readlink(full)]);
    else if (entry.isDirectory()) records.push(...await manifest(directory,name));
    else if (entry.isFile()) {
      const digest = createHash('sha256');
      for await (const chunk of createReadStream(full)) digest.update(chunk);
      const stat = await fs.stat(full);
      records.push(['file',name,stat.mode & 0o777,digest.digest('hex')]);
    }
  }
  return records;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const dmg = path.join(root, `release/OpenEnv-${version}-mac-arm64.dmg`);
await fs.mkdir(path.join(root,'.local'), { recursive: true });
const mount = await fs.mkdtemp(path.join(root, '.local/dmg-mount-'));
const installation = path.join(root, '.local/dmg-install-check');
let mounted = false;
try {
  execFileSync('/usr/bin/hdiutil', ['verify', dmg], { stdio: 'inherit' });
  execFileSync('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, dmg], { stdio: 'inherit' });
  mounted = true;
  if (await fs.readlink(path.join(mount,'Applications')) !== '/Applications') throw new Error('Invalid Applications link');
  await fs.access(path.join(mount,'安装说明.txt'));
  const mountedApp = path.join(mount,'OpenEnv.app');
  const sourceApp = path.join(root,'release/mac-arm64/OpenEnv.app');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', mountedApp], { stdio: 'inherit' });
  const sourceManifest = await manifest(sourceApp);
  assert.deepEqual(await manifest(mountedApp),sourceManifest,'Mounted app differs from source');
  await fs.mkdir(installation,{ recursive:true });
  const installedApp = path.join(installation,'OpenEnv.app');
  execFileSync('/usr/bin/ditto',[mountedApp,installedApp],{ stdio:'inherit' });
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',installedApp],{ stdio:'inherit' });
  assert.deepEqual(await manifest(installedApp),sourceManifest,'Copied app differs from source');
  const result = { version, applicationsLink:true, sourceEquivalent:true, mountedSignature:true, copiedSignature:true,
    copiedEquivalent:true, manifestEntries:sourceManifest.length,
    dmgSha256:createHash('sha256').update(await fs.readFile(dmg)).digest('hex'), copiedApp:installedApp };
  await fs.mkdir(path.join(root,'.local/verification'),{ recursive:true });
  await fs.writeFile(path.join(root,'.local/verification/dmg-results.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  if (mounted) execFileSync('/usr/bin/hdiutil',['detach',mount],{ stdio:'inherit' });
  await fs.rm(mount,{recursive:true,force:true});
}
