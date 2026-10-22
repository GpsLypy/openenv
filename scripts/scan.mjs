import { scanInventory } from '../electron/inventory.mjs';
const inventory = await scanInventory({ onProgress: p => { if (p.phase !== 'probe') process.stderr.write(p.message + '\n'); } });
const installed = inventory.tools.filter(t => t.installed);
console.log(JSON.stringify({ machine: inventory.machine, shell: inventory.shell, summary: inventory.summary,
  tools: installed.map(t => ({ name: t.name, version: t.version, activePath: t.activePath, installations: t.installations.length, conflict: t.conflict })),
  durationMs: inventory.durationMs }, null, 2));
