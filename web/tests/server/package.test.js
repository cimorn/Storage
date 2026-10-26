// @vitest-environment node
const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {vendorRuntimeDependencies}=require('../../scripts/runtime-deps.cjs');
let root;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'storage-package-'));});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
it('vendors real runtime modules with resolved files rather than Windows directory junctions',async()=>{
 const target=path.join(root,'node_modules');
 const report=await vendorRuntimeDependencies({projectRoot:path.resolve(__dirname,'../..'),targetDir:target});
 expect(report.count).toBeGreaterThan(10);
 const {createRequire}=require('node:module'),resolve=createRequire(path.join(root,'package.json'));
 expect(typeof resolve('express')).toBe('function');expect(typeof resolve('mongodb').MongoClient).toBe('function');
 expect(typeof resolve('jpeg-js').decode).toBe('function');expect(typeof resolve('pngjs').PNG.sync.read).toBe('function');
 const express=await fs.lstat(path.join(target,'express'));expect(express.isSymbolicLink()).toBe(false);
 const sharpPackage=JSON.parse(await fs.readFile(path.join(target,'sharp','package.json'),'utf8'));
 expect(sharpPackage.version).toBe('0.35.5');
 // Build once on BUILDPLATFORM; both runtime targets must have their own addon
 // and libvips. Check actual ELF machine headers, not just package manifests.
 for(const [arch,machine] of [['x64',62],['arm64',183]]){
  const addonDir=path.join(target,'@img',`sharp-linux-${arch}`,'lib');
  const addon=(await fs.readdir(addonDir)).find(file=>file.endsWith('.node'));
  const bytes=await fs.readFile(path.join(addonDir,addon));
  expect(bytes.subarray(0,4).toString('hex')).toBe('7f454c46');
  expect(bytes.readUInt16LE(18)).toBe(machine);
  const libDir=path.join(target,'@img',`sharp-libvips-linux-${arch}`,'lib');
  const library=(await fs.readdir(libDir)).find(file=>file.startsWith('libvips-cpp.so'));
  expect((await fs.readFile(path.join(libDir,library))).readUInt16LE(18)).toBe(machine);
 }
// This integration copies the full runtime dependency tree (over 1,000 files).
// Allow filesystem work to finish while other test workers are running.
},30000);
it('rejects unexpected native runtime modules instead of bundling host binaries',async()=>{
 const app=path.join(root,'fake'),dependency=path.join(app,'node_modules','unexpected-native');
 await fs.mkdir(dependency,{recursive:true});
 await fs.writeFile(path.join(app,'package.json'),'{}');
 await fs.writeFile(path.join(dependency,'package.json'),JSON.stringify({name:'unexpected-native',version:'1.0.0',main:'index.js'}));
 await fs.writeFile(path.join(dependency,'index.js'),'module.exports={}');
 await fs.writeFile(path.join(dependency,'addon.node'),'host-only native');
 await expect(vendorRuntimeDependencies({projectRoot:app,targetDir:path.join(root,'out'),roots:['unexpected-native']})).rejects.toThrow(/native/i);
});
