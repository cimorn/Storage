// @vitest-environment node
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
const require=createRequire(import.meta.url);
const {PNG}=require('pngjs');
const {createInventoryService}=require('../../server/inventory-service');
const {createMemoryRepository}=require('../../server/repository');
const {createMemoryObjectStore}=require('../../server/oss-store');
const {applyItemTimestamps}=require('../../server/item-timestamps');
const {decryptBytes,encryptBytes}=require('../../server/crypto');
const png=PNG.sync.write({width:4,height:4,data:Buffer.alloc(64,255)});
const close=[];afterEach(async()=>{for(const fn of close.splice(0))await fn();vi.restoreAllMocks();});
function setup(options={}){
  const repository=options.repository||createMemoryRepository(),objects=options.objects||createMemoryObjectStore(),encryptionKey=options.encryptionKey||randomBytes(32);
  const service=createInventoryService({repository,objects,encryptionKey,...options});close.push(()=>service.close());return {service,repository,objects,encryptionKey};
}
async function seed(isPrivate=false){
  const context=setup();
  await context.service.importProject({meta:{},categories:[{id:'cat',name:'Category'}],locations:[],items:[{id:'one',name:'One',categoryId:'cat',tags:[],isPrivate,imagePaths:['a','b'],createdAt:'2020-01-01',updatedAt:'2021-01-01'}]}, {includePrivate:true,images:{a:{bytes:png,mime:'image/png'},b:{bytes:png,mime:'image/png'}}});
  return {...context,project:await context.service.getProject({includePrivate:true})};
}
describe('multi-photo service lifecycle',()=>{
  it('imports all ordered payloads, backs them up and restores them with new independent IDs',async()=>{
    const {service,project,objects}=await seed();const ids=project.items[0].imagePaths;
    expect(ids).toHaveLength(2);expect(project.items[0].imagePath).toBe(ids[0]);expect(objects.keys()).toHaveLength(2);
    const backup=await service.backup();expect(Object.keys(backup.images)).toEqual(ids);
    const target=setup().service;await target.importProject(backup.project,{includePrivate:true,images:backup.images});
    const restored=(await target.getProject({includePrivate:true})).items[0];expect(restored.imagePaths).toHaveLength(2);expect(restored.imagePaths).not.toEqual(ids);
    for(const id of restored.imagePaths)expect((await target.readImage(id)).mime).toBe('image/webp');
  });
  it('preserves unseen secondary photos on old-tab no-op, replacement and clear-primary saves',async()=>{
    const {service,project}=await seed();const [first,second]=project.items[0].imagePaths;
    let old=structuredClone(project);delete old.items[0].imagePaths;await service.saveProject(old,{includePrivate:true});
    expect((await service.getProject({includePrivate:true})).items[0]).toMatchObject({imagePaths:[first,second],updatedAt:'2021-01-01'});
    old=await service.getProject({includePrivate:true});delete old.items[0].imagePaths;delete old.items[0].imagePath;await service.saveProject(old,{includePrivate:true});
    expect((await service.getProject({includePrivate:true})).items[0]).toMatchObject({imagePaths:[first,second],updatedAt:'2021-01-01'});
    const replacement=await service.uploadImage({bytes:png,mime:'image/png'});
    old=await service.getProject({includePrivate:true});delete old.items[0].imagePaths;old.items[0].imagePath=replacement.imageId;
    await service.saveProject(old,{includePrivate:true});
    expect((await service.getProject({includePrivate:true})).items[0].imagePaths).toEqual([replacement.imageId,second]);
    old=await service.getProject({includePrivate:true});delete old.items[0].imagePaths;old.items[0].imagePath='';await service.saveProject(old,{includePrivate:true});
    expect((await service.getProject({includePrivate:true})).items[0]).toMatchObject({imagePaths:[second],imagePath:second});
    const explicit=await service.getProject({includePrivate:true});explicit.items[0].imagePaths=[];await service.saveProject(explicit,{includePrivate:true});
    expect((await service.getProject({includePrivate:true})).items[0]).toMatchObject({imagePaths:[],imagePath:''});
  });
  it('denies hidden secondary reads and copies and secondary reuse by another owner',async()=>{
    const {service,project}=await seed(true);const secondary=project.items[0].imagePaths[1];
    await expect(service.readImage(secondary)).rejects.toMatchObject({code:'NOT_FOUND'});
    await expect(service.copyImage(secondary)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await service.readImage(secondary,{includePrivate:true})).mime).toBe('image/webp');
    const visible=await service.getProject();visible.items.push({id:'steal',name:'steal',imagePaths:[secondary]});
    await expect(service.saveProject(visible)).rejects.toMatchObject({code:'INVALID_IMAGE'});
    const copied=await service.copyImage(secondary,{includePrivate:true});const ordinary=await service.getProject();ordinary.items.push({id:'leak',imagePaths:[copied.imageId]});
    await expect(service.saveProject(ordinary)).rejects.toMatchObject({code:'FORBIDDEN'});
  });
  it('keeps both old generations after a second-copy failure, resumes all moves, then cleans all images on deletion',async()=>{
    const {service,project,objects,repository,encryptionKey}=await seed();const oldKeys=objects.keys();const copy=objects.copy;let calls=0;
    objects.copy=async(...args)=>{if(++calls===2)throw new Error('unavailable');return copy(...args);};
    project.categories[0].name='Moved';await expect(service.saveProject(project,{includePrivate:true})).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
    expect(objects.keys()).toEqual(expect.arrayContaining(oldKeys));
    objects.copy=copy;const restarted=setup({objects,repository,encryptionKey}).service;await restarted.retryPending();
    expect(objects.keys()).toHaveLength(2);for(const key of objects.keys())expect(key).toContain('/Moved/');
    const moved=await restarted.getProject({includePrivate:true});for(const id of moved.items[0].imagePaths)expect((await restarted.readImage(id)).mime).toBe('image/webp');
    moved.items=[];await restarted.saveProject(moved,{includePrivate:true});expect(objects.keys()).toHaveLength(0);
  });
  it('validates every import input before staging any image',async()=>{
    const {service,objects}=setup();await expect(service.importProject({meta:{},categories:[],locations:[],items:[{id:'one',imagePaths:['a','missing']}]},{includePrivate:true,images:{a:{bytes:png,mime:'image/png'}}})).rejects.toMatchObject({code:'INVALID_IMAGE'});
    expect(objects.keys()).toEqual([]);
  });
  it('timestamps secondary additions and ordered changes but ignores introducing an equivalent list',()=>{
    const before={items:[{id:'one',imagePath:'a',updatedAt:'old'}]},now=new Date('2026-01-01');
    expect(applyItemTimestamps(before,{items:[{...before.items[0],imagePaths:['a']}]},now).items[0].updatedAt).toBe('old');
    const multiple={items:[{...before.items[0],imagePaths:['a','b','c']}]};
    expect(applyItemTimestamps(before,multiple,now).items[0].updatedAt).toBe(now.toISOString());
    expect(applyItemTimestamps(multiple,{items:[{...multiple.items[0],imagePaths:['a','c','b']}]},now).items[0].updatedAt).toBe(now.toISOString());
  });
});

async function asLegacy(context,{malformedLast=false}={}){
  const {repository,objects,encryptionKey}=context,stored=await repository.read();
  const state=JSON.parse(decryptBytes(stored.envelope,encryptionKey,'nas-storage:inventory:v1').toString());
  for(const record of Object.values(state.images)){
    const malformed=malformedLast&&record.id===Object.keys(state.images).at(-1),bytes=malformed?Buffer.from([255,216,255,0,255,217]):png;
    const encrypted=Buffer.from(JSON.stringify(encryptBytes(bytes,encryptionKey,`nas-storage:image:${record.id}:v1`)));
    record.mime=malformed?'image/jpeg':'image/png';record.digest=require('node:crypto').createHash('sha256').update(bytes).digest('hex');record.encryptedSize=encrypted.length;delete record.optimizationVersion;
    await objects.put(record.key,encrypted);
  }
  await repository.compareAndSwap(stored.revision,{revision:stored.revision+1,envelope:encryptBytes(Buffer.from(JSON.stringify(state)),encryptionKey,'nas-storage:inventory:v1')});
  return setup({repository,objects,encryptionKey}).service;
}
describe('existing-photo optimization',()=>{
  it('requires privacy access and is idempotent for versioned uploads',async()=>{
    const {service,project,objects}=await seed();
    await expect(service.optimizeImages()).rejects.toMatchObject({code:'FORBIDDEN'});
    const put=vi.spyOn(objects,'put');
    expect(await service.optimizeImages({includePrivate:true})).toMatchObject({optimizedCount:0,skippedCount:2,beforeBytes:0,afterBytes:0,savedBytes:0});
    expect(put).not.toHaveBeenCalled();expect((await service.getProject({includePrivate:true})).revision).toBe(project.revision);
  });
  it('publishes all optimized generations atomically while preserving IDs, ownership, fields and dates',async()=>{
    const context=await seed(true),service=await asLegacy(context),before=await service.getProject({includePrivate:true}),oldKeys=context.objects.keys();
    const result=await service.optimizeImages({includePrivate:true});
    expect(result).toMatchObject({optimizedCount:2,skippedCount:0,beforeBytes:png.length*2});expect(Object.keys(result).sort()).toEqual(['afterBytes','beforeBytes','optimizedCount','savedBytes','skippedCount']);
    const after=await service.getProject({includePrivate:true});expect(after.items).toEqual(before.items);expect(after.revision).toBe(before.revision+1);
    expect(context.objects.keys()).toHaveLength(2);for(const key of oldKeys)expect(context.objects.keys()).not.toContain(key);
    for(const id of after.items[0].imagePaths){await expect(service.readImage(id)).rejects.toMatchObject({code:'NOT_FOUND'});expect((await service.readImage(id,{includePrivate:true})).mime).toBe('image/webp');}
    expect(await service.optimizeImages({includePrivate:true})).toMatchObject({optimizedCount:0,skippedCount:2});
  });
  it('retains readable old bytes when an upload fails and resumes verified outputs on restart',async()=>{
    const context=await seed(),service=await asLegacy(context),before=await service.getProject({includePrivate:true}),oldKeys=context.objects.keys(),put=context.objects.put;let calls=0;
    context.objects.put=async(...args)=>{if(++calls===2)throw new Error('temporary');return put(...args);};
    await expect(service.optimizeImages({includePrivate:true})).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
    for(const id of before.items[0].imagePaths)expect((await service.readImage(id)).bytes).toEqual(png);
    expect(context.objects.keys()).toEqual(expect.arrayContaining(oldKeys));context.objects.put=put;
    const restarted=setup(context).service;await restarted.retryPending();const after=await restarted.getProject({includePrivate:true});expect(after.items).toEqual(before.items);expect(context.objects.keys()).toHaveLength(2);
    for(const id of after.items[0].imagePaths)expect((await restarted.readImage(id)).mime).toBe('image/webp');
  });
  it('rechecks authorization before scheduling work and before committing transformed bytes',async()=>{
    const context=await seed(),service=await asLegacy(context),objects=context.objects;let allowed=true;
    const assertAuthorized=()=>{if(!allowed)throw Object.assign(new Error('locked'),{code:'FORBIDDEN'});};
    const get=objects.get;objects.get=async key=>{const result=await get(key);allowed=false;return result;};
    await expect(service.optimizeImages({includePrivate:true,assertAuthorized})).rejects.toMatchObject({code:'STORAGE_UNAVAILABLE'});
    for(const id of context.project.items[0].imagePaths)expect((await service.readImage(id)).mime).toBe('image/png');
  });
});

it('keeps legacy generations after a checkpoint CAS conflict and resumes without mutating published objects',async()=>{
  const context=await seed(),service=await asLegacy(context),oldKeys=context.objects.keys();const cas=context.repository.compareAndSwap;let calls=0;
  context.repository.compareAndSwap=async(...args)=>++calls===3?false:cas(...args);
  await expect(service.optimizeImages({includePrivate:true})).rejects.toMatchObject({code:'CONFLICT'});
  for(const id of context.project.items[0].imagePaths)expect((await service.readImage(id)).bytes).toEqual(png);
  expect(context.objects.keys()).toEqual(expect.arrayContaining(oldKeys));context.repository.compareAndSwap=cas;
  const restarted=setup(context).service;await restarted.retryPending();expect(context.objects.keys()).toHaveLength(2);
  for(const id of context.project.items[0].imagePaths)expect((await restarted.readImage(id)).mime).toBe('image/webp');
});
it('cannot overwrite active generations or leave a delayed rejected attempt after another process resumes optimization',async()=>{
  const context=await seed(),first=await asLegacy(context),second=setup(context).service,put=context.objects.put;let entered,release,blocked=true;
  const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  context.objects.put=async(...args)=>{if(blocked){blocked=false;entered();await gate;}return put(...args);};
  const pending=first.optimizeImages({includePrivate:true}).catch(error=>error);await started;
  await second.retryPending();const active=context.objects.keys(),published=await Promise.all(active.map(key=>context.objects.get(key)));
  release();expect(await pending).toMatchObject({code:'CONFLICT'});
  for(let i=0;i<active.length;i++)expect(await context.objects.get(active[i])).toEqual(published[i]);
  expect(context.objects.keys()).toEqual(active);
});

it('aborts a non-retryable legacy decode failure without stranding the project or changing active originals',async()=>{
  const context=await seed(),service=await asLegacy(context,{malformedLast:true}),before=await service.getProject({includePrivate:true}),oldKeys=context.objects.keys();
  await expect(service.optimizeImages({includePrivate:true})).rejects.toMatchObject({code:'INVALID_IMAGE'});
  const after=await service.getProject({includePrivate:true});expect(after).toEqual(before);expect(context.objects.keys()).toEqual(oldKeys);
  after.items[0].name='Still editable';await service.saveProject(after,{includePrivate:true});
  expect((await service.getProject({includePrivate:true})).items[0].name).toBe('Still editable');
});

it.each(['json','decrypt','digest','missing','read-error'])('aborts optimization after a %s source failure while retaining project metadata and active keys',async kind=>{
  const context=await seed(),service=await asLegacy(context),before=await service.getProject({includePrivate:true}),stored=await context.repository.read();
  const state=JSON.parse(decryptBytes(stored.envelope,context.encryptionKey,'nas-storage:inventory:v1').toString()),record=state.images[before.items[0].imagePaths[1]],firstKey=state.images[before.items[0].imagePaths[0]].key;
  const firstBytes=await context.objects.get(firstKey),original=await context.objects.get(record.key),get=context.objects.get;
  if(kind==='json')await context.objects.put(record.key,Buffer.from('not an encrypted JSON envelope'));
  if(kind==='decrypt'){
    const envelope=JSON.parse(original.toString());envelope.ciphertext=Buffer.alloc(Buffer.from(envelope.ciphertext,'base64').length,0).toString('base64');await context.objects.put(record.key,Buffer.from(JSON.stringify(envelope)));
  }
  if(kind==='digest')await context.objects.put(record.key,Buffer.from(JSON.stringify(encryptBytes(Buffer.from('different plaintext'),context.encryptionKey,`nas-storage:image:${record.id}:v1`))));
  if(kind==='missing')await context.objects.delete(record.key);
  if(kind==='read-error')context.objects.get=async key=>{if(key===record.key)throw new Error('transient upstream failure');return get(key);};
  const activeKeys=context.objects.keys(),deletes=vi.spyOn(context.objects,'delete');
  await expect(service.optimizeImages({includePrivate:true})).rejects.toMatchObject({code:kind==='missing'?'NOT_FOUND':'STORAGE_UNAVAILABLE'});
  expect(await service.getProject({includePrivate:true})).toEqual(before);
  expect(context.objects.keys()).toEqual(activeKeys);for(const [key] of deletes.mock.calls)expect(activeKeys).not.toContain(key);
  expect(await context.objects.get(firstKey)).toEqual(firstBytes);
  const current=await context.repository.read(),recovered=JSON.parse(decryptBytes(current.envelope,context.encryptionKey,'nas-storage:inventory:v1').toString());expect(recovered.pending).toBe(null);
  before.items[0].name='Editable after source error';await service.saveProject(before,{includePrivate:true});expect((await service.getProject({includePrivate:true})).items[0].name).toBe('Editable after source error');
  if(kind==='read-error'){
    context.objects.get=get;expect(await service.optimizeImages({includePrivate:true})).toMatchObject({optimizedCount:2});
  }
});

it('does not abort or clean a newer committed generation when a delayed source failure loses the journal CAS',async()=>{
  const context=await seed(),first=await asLegacy(context),second=setup(context).service,before=await first.getProject({includePrivate:true}),stored=await context.repository.read();
  const state=JSON.parse(decryptBytes(stored.envelope,context.encryptionKey,'nas-storage:inventory:v1').toString()),sourceKey=state.images[before.items[0].imagePaths[1]].key,get=context.objects.get;
  let entered,release,blocked=true;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  context.objects.get=async key=>{if(key===sourceKey&&blocked){blocked=false;entered();await gate;throw new Error('delayed source failure');}return get(key);};
  const pending=first.optimizeImages({includePrivate:true}).catch(error=>error);await started;await second.retryPending();
  const active=context.objects.keys(),published=await Promise.all(active.map(key=>get(key)));release();expect(await pending).toMatchObject({code:'CONFLICT'});
  const after=await first.getProject({includePrivate:true});expect(after.items).toEqual(before.items);expect(after.revision).toBe(before.revision+1);expect(context.objects.keys()).toEqual(active);
  for(let i=0;i<active.length;i++)expect(await get(active[i])).toEqual(published[i]);
  for(const id of after.items[0].imagePaths)expect((await first.readImage(id)).mime).toBe('image/webp');
});
