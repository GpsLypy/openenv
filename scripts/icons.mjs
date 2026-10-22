import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(size, sample) {
  const data = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Four subpixel samples keep the small menu bar glyph crisp.
    const colors = [[.25,.25],[.75,.25],[.25,.75],[.75,.75]].map(([dx,dy]) => sample((x+dx)/size,(y+dy)/size));
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 4; c++) data[offset+c] = Math.round(colors.reduce((a,b)=>a+b[c],0)/4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
const line = (x,y,ax,ay,bx,by,w) => {
  const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
  return Math.hypot(x-ax-t*(bx-ax),y-ay-t*(by-ay))<w;
};
const glyph = (x,y) => line(x,y,.26,.32,.44,.5,.032)||line(x,y,.44,.5,.26,.68,.032)||line(x,y,.54,.68,.75,.68,.032);
const appSample = (x,y) => {
  const dx=Math.max(Math.abs(x-.5)-.29,0),dy=Math.max(Math.abs(y-.5)-.29,0);
  if(Math.hypot(dx,dy)>.17)return [0,0,0,0];
  if(glyph(x,y))return [158,215,255,255];
  const glow=Math.max(0,1-Math.hypot(x-.3,y-.22)*1.5);
  return [15+glow*10,29+glow*24,47+glow*37,255];
};
export async function createIcons() {
  await fs.mkdir(path.join(root,'assets'),{recursive:true});
  await fs.writeFile(path.join(root,'assets/trayTemplate.png'),png(44,(x,y)=>glyph(x,y)?[0,0,0,255]:[0,0,0,0]));
  await fs.writeFile(path.join(root,'assets/trayTemplate@2x.png'),png(88,(x,y)=>glyph(x,y)?[0,0,0,255]:[0,0,0,0]));
  await fs.writeFile(path.join(root,'assets/icon.png'),png(1024,appSample));
  if (process.platform === 'darwin') {
    const records = [['icp4',16],['icp5',32],['icp6',64],['ic07',128],['ic08',256],['ic09',512],['ic10',1024]].map(([type,size]) => {
      const pixels = png(size,appSample), header = Buffer.alloc(8);
      header.write(type,0,'ascii'); header.writeUInt32BE(pixels.length+8,4);
      return Buffer.concat([header,pixels]);
    });
    const header = Buffer.alloc(8); header.write('icns',0,'ascii');
    header.writeUInt32BE(8+records.reduce((total,record)=>total+record.length,0),4);
    await fs.writeFile(path.join(root,'assets/icon.icns'),Buffer.concat([header,...records]));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await createIcons();
