import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryManager } from '../src/ux/HistoryManager.js';
import { SceneAutosave, SCENE_AUTOSAVE_KEY, sceneSlotKey } from '../src/ux/SceneAutosave.js';
import {
  SCENE_LIBRARY_FORMAT, createSceneLibraryArchive, validateSceneLibraryArchive,
  commitSceneLibraryArchive, describeSceneLibrary,
} from '../src/ux/SceneLibraryArchive.js';

const presets=[
 {id:'qs3d-island',label:'Đảo Xanh'},
 {id:'empty-meadow',label:'Đồng Cỏ'},
 {id:'moonlit-abbey',label:'Tàn tích'},
];
function scene(time=13,building='house'){
 return {
  world:{terrain:{heights:new Float32Array([0,1,2])},foliage:{trees:[],bushes:[],flowers:[],boulders:[]}},
  arch:{buildings:[{id:building,seed:2302754525,x:0,z:0}],walls:[],paths:[],clutter:[]},
  env:{timeOfDay:time,season:'summer'}
 };
}
function store() {
 const map=new Map();
 return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
}
function fixture(){
 const storage=store(),history=new HistoryManager(),autosave=new SceneAutosave({storage,history});
 autosave.schedule(()=>scene(9,'island-house'),'qs3d-island');autosave.flush();
 autosave.schedule(()=>scene(17,'meadow-house'),'empty-meadow');autosave.flush();
 return {autosave,history,storage};
}
async function makeArchive(f,activePresetId='empty-meadow',capture=scene(20,'unsaved-meadow-house')){
 return createSceneLibraryArchive({
  autosave:f.autosave,history:f.history,presets,
  activePresetId,captureSnapshot:()=>capture,
 });
}
test('one portable archive includes all saved maps and current unsaved live edits',async()=>{
 const f=fixture(),raw=await makeArchive(f);
 const a=JSON.parse(raw);
 assert.equal(a.format,SCENE_LIBRARY_FORMAT);
 assert.equal(a.version,1);
 assert.equal(a.activePresetId,'empty-meadow');
 assert.equal(a.scenes.length,2);
 assert.deepEqual(a.scenes.map(s=>s.presetId),['qs3d-island','empty-meadow']);
 const meadow=await f.history.importJSON(a.scenes[1].sceneJSON);
 assert.equal(meadow.arch.buildings[0].id,'unsaved-meadow-house');
 assert.equal(meadow.env.timeOfDay,20);
 assert.equal(f.autosave.readPresetSlot('empty-meadow')?.sceneJSON.includes('unsaved-meadow-house'),false,
   'export must not mutate browser local autosaves');
});
test('full portable backup round-trip validates and restores multiple independent maps',async()=>{
 const f=fixture(),raw=await makeArchive(f);
 const checked=await validateSceneLibraryArchive(raw,{presets,history:f.history});
 const dest=store();
 const outcome=commitSceneLibraryArchive(checked,dest);
 assert.deepEqual(outcome,{restored:2,activePresetId:'empty-meadow'});
 const restored=new SceneAutosave({storage:dest,history:f.history});
 assert.equal(restored.read().presetId,'empty-meadow');
 assert.equal((await f.history.importJSON(restored.readPresetSlot('qs3d-island').sceneJSON)).arch.buildings[0].id,'island-house');
 assert.equal((await f.history.importJSON(restored.readPresetSlot('empty-meadow').sceneJSON)).arch.buildings[0].id,'unsaved-meadow-house');
});
test('restoring only included maps does not change unrelated slots',async()=>{
 const f=fixture(),all=JSON.parse(await makeArchive(f));
 all.scenes=all.scenes.filter(s=>s.presetId==='empty-meadow');
 const dest=store();
 dest.setItem(sceneSlotKey('moonlit-abbey'),'UNRELATED CUSTOM RECORD');
 const checked=await validateSceneLibraryArchive(JSON.stringify(all),{presets,history:f.history});
 commitSceneLibraryArchive(checked,dest);
 assert.equal(dest.getItem(sceneSlotKey('moonlit-abbey')),'UNRELATED CUSTOM RECORD');
});
test('invalid and polluted archives are rejected before any writes',async()=>{
 const f=fixture(),good=JSON.parse(await makeArchive(f));
 const versions=[
   '{}', '{not json',
   JSON.stringify({...good,version:4}),
   JSON.stringify({...good,format:'not-library'}),
   JSON.stringify({...good,scenes:[...good.scenes,good.scenes[0]]}),
   JSON.stringify({...good,scenes:[{...good.scenes[0],presetId:'../../secret'},good.scenes[1]]}),
   JSON.stringify({...good,activePresetId:'moonlit-abbey'}),
   JSON.stringify({...good,scenes:good.scenes.map((s,i)=>i===0?{...s,sceneJSON:'NOT_JSON'}:s)}),
   '{"format":"qs3d-cozy-glade-library","version":1,"__proto__":{"polluted":true},"scenes":[]}',
 ];
 for(const [i,raw] of versions.entries()) {
   await assert.rejects(()=>validateSceneLibraryArchive(raw,{presets,history:f.history}),undefined,'malformed '+i);
 }
 const dest=store();
 assert.equal(dest.map.size,0);
});
test('archive rejects excessive total file size without parsing it',async()=>{
 const f=fixture();
 await assert.rejects(()=>validateSceneLibraryArchive(' '.repeat(24*1024*1024+1),{presets,history:f.history}),/24 MB/);
});
test('failed import due quota restores every previous map and active pointer',async()=>{
 const f=fixture(),checked=await validateSceneLibraryArchive(await makeArchive(f),{presets,history:f.history});
 const old=store();
 old.setItem(sceneSlotKey('qs3d-island'),'OLD_ISLAND');
 old.setItem(sceneSlotKey('empty-meadow'),'OLD_MEADOW');
 old.setItem(SCENE_AUTOSAVE_KEY,'OLD_LATEST');
 const baseline=new Map(old.map);
 const denied={
  getItem:k=>old.getItem(k),removeItem:k=>old.removeItem(k),
  setItem:(k,v)=>{
   if(k===sceneSlotKey('empty-meadow')) throw Error('QuotaExceededError');
   old.setItem(k,v);
  }
 };
 await assert.throws(()=>commitSceneLibraryArchive(checked,denied),/original local saves were restored/);
 assert.deepEqual(old.map,baseline);
});
test('failed import on latest-pointer write restores both map slots',async()=>{
 const f=fixture(),checked=await validateSceneLibraryArchive(await makeArchive(f),{presets,history:f.history});
 const old=store();
 old.setItem(sceneSlotKey('qs3d-island'),'OLD_ISLAND');
 old.setItem(sceneSlotKey('empty-meadow'),'OLD_MEADOW');
 old.setItem(SCENE_AUTOSAVE_KEY,'OLD_LATEST');
 const baseline=new Map(old.map);
 const denied={
  getItem:k=>old.getItem(k),removeItem:k=>old.removeItem(k),
  setItem:(k,v)=>{
   if(k===SCENE_AUTOSAVE_KEY)throw Error('Quota on pointer');
   old.setItem(k,v);
  }
 };
 assert.throws(()=>commitSceneLibraryArchive(checked,denied),/original local saves were restored/);
 assert.deepEqual(old.map,baseline);
});
test('import first checks ability to inspect existing saves',async()=>{
 const f=fixture(),checked=await validateSceneLibraryArchive(await makeArchive(f),{presets,history:f.history});
 let writes=0;
 assert.throws(()=>commitSceneLibraryArchive(checked,{
  getItem(){throw Error('Storage unavailable')},
  setItem(){writes++},
 }),/Could not inspect existing/);
 assert.equal(writes,0);
});
test('library description lists all map slots and current live house counts',()=>{
 const f=fixture();
 const rows=describeSceneLibrary(f.autosave,presets,'empty-meadow',()=>scene(22,'live-house'));
 assert.equal(rows.length,3);
 assert.equal(rows[0].saved,true);
 assert.equal(rows[1].active,true);
 assert.equal(rows[1].buildings,1);
 assert.equal(rows[2].saved,false);
});
test('library backup fails closed if an inactive saved slot is corrupt',async()=>{
 const f=fixture();
 f.storage.setItem(sceneSlotKey('qs3d-island'),'{bad');
 await assert.rejects(()=>makeArchive(f),/Stored map is damaged/);
});
