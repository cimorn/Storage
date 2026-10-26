// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const {validateProject}=require('../../server/project-validation');
let shared={};try{shared=await import('../../shared/item-images.mjs');}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const {getItemImageIds,MAX_ITEM_IMAGES}=shared;
const a='img_11111111-1111-1111-1111-111111111111',b='img_22222222-2222-2222-2222-222222222222';
const project=item=>({meta:{},categories:[],locations:[],items:[{id:'one',name:'One',...item}]});
describe('ordered item photos',()=>{
  it('reads legacy primary, authoritative lists and explicit removal, deduplicating in order',()=>{
    expect(MAX_ITEM_IMAGES).toBe(20);
    expect(getItemImageIds({imagePath:a})).toEqual([a]);
    expect(getItemImageIds({imagePath:a,imagePaths:[b,a,b]})).toEqual([b,a]);
    expect(getItemImageIds({imagePath:a,imagePaths:[]})).toEqual([]);
    expect(getItemImageIds({})).toEqual([]);
  });
  it.each([null,'bad',[null],[''],[1],['x'.repeat(2049)],['x\u0000'],Array.from({length:21},(_,i)=>String(i))].map(imagePaths=>({imagePaths})))('rejects malformed or oversized lists: %j',({imagePaths})=>{
    expect(()=>getItemImageIds({imagePaths})).toThrow();
    expect(()=>validateProject(project({imagePaths}))).toThrow();
  });
  it('canonicalizes the primary field from the list and validates every secondary ID',()=>{
    expect(validateProject(project({imagePath:a,imagePaths:[b,a,b]})).items[0]).toMatchObject({imagePath:b,imagePaths:[b,a]});
    expect(validateProject(project({imagePath:a,imagePaths:[]})).items[0]).toMatchObject({imagePath:'',imagePaths:[]});
    expect(()=>validateProject(project({imagePath:a,imagePaths:[a,'invalid']}))).toThrow();
    expect(validateProject(project({imagePaths:['images/a.png','images/b.png']}),{allowImagePaths:true}).items[0].imagePaths).toEqual(['images/a.png','images/b.png']);
  });
});
