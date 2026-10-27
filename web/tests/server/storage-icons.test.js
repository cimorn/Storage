import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';

const require=createRequire(import.meta.url), sharp=require('sharp');
const root=path.resolve(import.meta.dirname,'../../..');
it('ships a Storage-specific opaque white icon and matching multi-resolution desktop resources',async()=>{
  const png=await readFile(path.join(root,'web/public/icon.png'));
  const desktop=await readFile(path.join(root,'desktop/assets/app-icon.png'));
  expect(desktop.equals(png)).toBe(true);
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  expect([info.width,info.height]).toEqual([256,256]);
  for(let i=3;i<data.length;i+=4)expect(data[i]).toBe(255);
  for(const [x,y] of [[0,0],[255,0],[0,255],[255,255]]){
    expect([...data.subarray((y*info.width+x)*4,(y*info.width+x)*4+4)]).toEqual([255,255,255,255]);
  }
  const center=(128*info.width+128)*4;
  expect(data[center]).toBeLessThan(80); // Teal archive-box label, not the previous blue website mark.
  expect(data[center+1]).toBeGreaterThan(data[center+2]);
  const ico=await readFile(path.join(root,'web/public/favicon.ico'));
  expect(ico.equals(await readFile(path.join(root,'desktop/assets/app-icon.ico')))).toBe(true);
  expect(ico.readUInt16LE(4)).toBe(7);
  const dimensions=[];
  for(let n=0;n<7;n++){
    const entry=6+n*16,length=ico.readUInt32LE(entry+8),offset=ico.readUInt32LE(entry+12);
    const size=ico[entry]||256;
    dimensions.push(size);
    const image=await sharp(ico.subarray(offset,offset+length)).metadata();
    expect([image.width,image.height]).toEqual([size,size]);
  }
  expect(dimensions).toEqual([16,24,32,48,64,128,256]);
});
