import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
export async function updateChecksums(root, version) {
  const directory = path.join(root, 'release');
  const records = [];
  for (const extension of ['dmg', 'zip']) {
    const name = `OpenEnv-${version}-mac-arm64.${extension}`;
    let bytes;
    try { bytes = await fs.readFile(path.join(directory, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    records.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
  await fs.writeFile(path.join(directory, 'SHA256SUMS'), records.join('\n') + '\n');
}
