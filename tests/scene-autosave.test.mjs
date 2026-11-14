import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneAutosave, SCENE_AUTOSAVE_KEY, sceneSlotKey } from '../src/ux/SceneAutosave.js';
import { HistoryManager } from '../src/ux/HistoryManager.js';

function makeStorage(){
 const map=new Map();
 return {
  map,
  getItem(k){return map.has(k)?map.get(k):null;},
  setItem(k,v){map.set(k,v);},
  removeItem(k){map.delete(k);}
 };
}
function makeScene(time=13.25){
 return {
  world:{version:1,terrain:{heights:new Float32Array([1.25,-0.3,2])},
    foliage:{trees:[],bushes:[],flowers:[],boulders:[]}},
  arch:{buildings:[{id:'cottage-1',seed:2302754525,x:0,z:0}],walls:[],paths:[],clutter:[]},
  env:{timeOfDay:time,season:'summer'}
 };
}
function makeManager(storage=makeStorage(),clock={}){
 return new SceneAutosave({storage,history:new HistoryManager(),delayMs:80,...clock});
}
test('autosave does not write before a gameplay change',()=>{
 const storage=makeStorage();makeManager(storage);
 assert.equal(storage.map.size,0);
});
test('flush records a versioned scene, preset and timestamp, lossless on import',async()=>{
 const storage=makeStorage();const manager=makeManager(storage);
 const scene=makeScene();
 manager.schedule(()=>scene,'qs3d-island');
 assert.equal(manager.flush(),true);
 const record=manager.read();
 assert.ok(record.savedAt>0);
 assert.equal(record.presetId,'qs3d-island');
 const imported=await new HistoryManager().importJSON(record.sceneJSON);
 assert.equal(imported.env.timeOfDay,13.25);
 assert.equal(imported.arch.buildings[0].seed,2302754525);
 for(const [i,expected] of [1.25,-0.3,2].entries()) {
   assert.ok(Math.abs(imported.world.terrain.heights[i]-expected)<1e-5);
 }
});
test('scheduled writes capture latest scene lazily after slider changes',async()=>{
 let pending;
 const storage=makeStorage();
 const manager=makeManager(storage,{setTimer:(fn)=>{pending=fn;return 1;},clearTimer:()=>{}});
 let captureCount=0;let time=13;
 manager.schedule(()=>{captureCount++;return makeScene(time)},'empty-meadow');
 time=19.5;
 manager.schedule(()=>{captureCount++;return makeScene(time)},'empty-meadow');
 assert.equal(captureCount,0);
 pending();
 assert.equal(captureCount,1);
 const scene=await new HistoryManager().importJSON(manager.read().sceneJSON);
 assert.equal(scene.env.timeOfDay,19.5);
 assert.equal(manager.read().presetId,'empty-meadow');
});
test('pagehide flush cancels pending timer and writes instantly',()=>{
 const storage=makeStorage();let canceled=0;
 const manager=makeManager(storage,{setTimer:()=>2,clearTimer:()=>{canceled++}});
 manager.schedule(()=>makeScene(), 'qs3d-island');
 assert.equal(manager.flush(),true);
 assert.equal(canceled,1);
 assert.ok(storage.map.has(SCENE_AUTOSAVE_KEY));
});
test('discard deletes checkpoint and cancels pending changes',()=>{
 const storage=makeStorage();const manager=makeManager(storage);
 manager.schedule(()=>makeScene());manager.flush();
 assert.ok(manager.read());
 manager.schedule(()=>makeScene(10));
 assert.equal(manager.discard(),true);
 assert.equal(manager.read(),null);
 assert.equal(manager.flush(),false);
});
test('broken or incompatible save is not silently treated as valid',()=>{
 for(const s of ['not json','{}',JSON.stringify({format:'qs3d-cozy-glade:autosave',version:2,sceneJSON:'{}',savedAt:1})]){
  const storage=makeStorage();storage.setItem(SCENE_AUTOSAVE_KEY,s);
  const manager=makeManager(storage);
  assert.equal(manager.read(),null);
  assert.ok(manager.lastError);
  assert.equal(storage.getItem(SCENE_AUTOSAVE_KEY),s,'must not delete user data');
 }
});
test('blocked and quota-exceeded storage never throw into game loop',()=>{
 const denied={getItem(){throw Error('no');},setItem(){throw Error('QuotaExceededError');},removeItem(){throw Error('no')}};
 const manager=makeManager(denied);
 assert.equal(manager.read(),null);
 assert.ok(manager.lastError);
 manager.schedule(()=>makeScene());
 assert.equal(manager.flush(),false);
 assert.ok(manager.lastError);
 assert.equal(manager.discard(),false);
});
test('no storage gracefully allows ordinary gameplay',()=>{
 const manager=makeManager(null);
 assert.equal(manager.read(),null);
 assert.equal(manager.schedule(()=>makeScene()),false);
 assert.equal(manager.flush(),false);
});
test('pure serializeJSON does not trigger file export or browser download',async()=>{
 const history=new HistoryManager();
 const text=history.serializeJSON(makeScene());
 assert.match(text,/"format": "tiny-glade-scene"/);
 const scene=await history.importJSON(text);
 assert.equal(scene.arch.buildings[0].id,'cottage-1');
});

// Every scene has a separate checkpoint; selecting another preset must not
// overwrite the buildings made on the previous map.
test('per-preset scene slots preserve independent buildings and the legacy current save',async()=>{
 const store=makeStorage(),s=makeManager(store);
 const island=makeScene(12);island.arch.buildings=[{id:'island-home',seed:5}];
 const meadow=makeScene(18);meadow.arch.buildings=[{id:'meadow-home',seed:8}];
 s.schedule(()=>island,'qs3d-island');assert.equal(s.flush(),true);
 s.schedule(()=>meadow,'empty-meadow');assert.equal(s.flush(),true);
 const history=new HistoryManager();
 const gotIsland=await history.importJSON(s.readPresetSlot('qs3d-island').sceneJSON);
 const gotMeadow=await history.importJSON(s.readPresetSlot('empty-meadow').sceneJSON);
 assert.equal(gotIsland.arch.buildings[0].id,'island-home');
 assert.equal(gotMeadow.arch.buildings[0].id,'meadow-home');
 assert.equal(s.read().presetId,'empty-meadow','legacy key tracks latest map');
 assert.equal(store.map.size,3,'global plus two separate map keys');
});
test('new slot keys reject invalid identifiers and pollution strings',()=>{
 assert.ok(sceneSlotKey('qs3d-island')?.includes(':preset:qs3d-island'));
 for(const id of ['','../..','__proto__',' constructor ','a'.repeat(70),42,null]){
  assert.equal(sceneSlotKey(id),null);
 }
});
test('discarding one saved map does not destroy other slots or latest backup',()=>{
 const store=makeStorage(),s=makeManager(store);
 s.schedule(()=>makeScene(9),'qs3d-island');s.flush();
 s.schedule(()=>makeScene(19),'empty-meadow');s.flush();
 assert.equal(s.discardPresetSlot('qs3d-island'),true);
 assert.equal(s.readPresetSlot('qs3d-island'),null);
 assert.ok(s.readPresetSlot('empty-meadow'));
 assert.equal(s.read().presetId,'empty-meadow');
});
test('damaged preset slot remains recoverable and pending default is canceled',()=>{
 const store=makeStorage(),s=makeManager(store);
 const key=sceneSlotKey('empty-meadow');store.setItem(key,'BROKEN DATA');
 assert.equal(s.readPresetSlot('empty-meadow'),null);
 assert.ok(s.lastError);
 s.schedule(()=>makeScene(),'empty-meadow');s.cancelPending();
 assert.equal(s.flush(),false);
 assert.equal(store.getItem(key),'BROKEN DATA','malformed slot must remain intact');
});
test('old version-1 single autosave stays readable after enabling map slots',async()=>{
 const store=makeStorage(),s=makeManager(store);
 const oldRecord={format:'qs3d-cozy-glade:autosave',version:1,savedAt:123456789,
  presetId:'qs3d-island',sceneJSON:s.history.serializeJSON(makeScene(10))};
 store.setItem(SCENE_AUTOSAVE_KEY,JSON.stringify(oldRecord));
 assert.equal(s.read().presetId,'qs3d-island');
 assert.equal(s.readPresetSlot('qs3d-island'),null);
 const restored=await s.history.importJSON(s.read().sceneJSON);
 assert.equal(restored.env.timeOfDay,10);
 s.schedule(()=>restored,'qs3d-island');s.flush();
 assert.ok(s.readPresetSlot('qs3d-island'),'legacy checkpoint migrates to per-map slot');
});

test('storage quota on a new slot does not corrupt latest map or drop pending edits',()=>{
 const backing=makeStorage();
 const manager=makeManager(backing);
 manager.schedule(()=>makeScene(9),'qs3d-island');
 assert.equal(manager.flush(),true);
 const prevJSON=backing.getItem(SCENE_AUTOSAVE_KEY);
 const meadowSlot=sceneSlotKey('empty-meadow');
 const quota={
   getItem:(k)=>backing.getItem(k),
   removeItem:(k)=>backing.removeItem(k),
   setItem:(k,v)=>{ if(k===meadowSlot)throw Error('QuotaExceededError');backing.setItem(k,v); }
 };
 manager.storage=quota;
 manager.schedule(()=>makeScene(20),'empty-meadow');
 assert.equal(manager.flush(),false);
 assert.equal(backing.getItem(SCENE_AUTOSAVE_KEY),prevJSON,'never advance global pointer to a scene whose slot failed');
 assert.equal(backing.getItem(meadowSlot),null);
 assert.equal(manager.pending?.presetId,'empty-meadow','retain unsaved changes in memory');
 manager.storage=backing;
 assert.equal(manager.flush(),true,'retry after quota recovery');
 assert.equal(manager.pending,null);
 assert.equal(manager.read().presetId,'empty-meadow');
 assert.ok(manager.readPresetSlot('empty-meadow'));
});
test('failure updating latest-scene pointer keeps per-map slot for recovery and retries',()=>{
 const store=makeStorage();
 const s=makeManager(store);
 s.schedule(()=>makeScene(8),'qs3d-island');s.flush();
 const oldLatest=store.getItem(SCENE_AUTOSAVE_KEY);
 s.storage={
   getItem:k=>store.getItem(k),
   setItem:(k,v)=>{ if(k===SCENE_AUTOSAVE_KEY)throw Error('quota on latest pointer');store.setItem(k,v); },
   removeItem:k=>store.removeItem(k)
 };
 s.schedule(()=>makeScene(14),'empty-meadow');
 assert.equal(s.flush(),false);
 assert.equal(store.getItem(SCENE_AUTOSAVE_KEY),oldLatest);
 assert.ok(s.readPresetSlot('empty-meadow'),'slot saved even if global pointer fails');
 assert.equal(s.pending?.presetId,'empty-meadow');
 s.storage=store;
 assert.equal(s.flush(),true);
 assert.equal(s.read().presetId,'empty-meadow');
});
test('browser with blocked storage retains the unsaved snapshot for warning before scene switch',()=>{
 const manager=makeManager(null);
 let captured=false;
 assert.equal(manager.schedule(()=>{captured=true;return makeScene();},'empty-meadow'),false);
 assert.equal(manager.pending?.presetId,'empty-meadow');
 assert.equal(manager.flush(),false);
 assert.ok(manager.lastError);
 assert.equal(captured,false);
 manager.cancelPending();
 assert.equal(manager.pending,null);
});

test('missing healthy slot clears stale quota error from another map',()=>{
 const s=makeManager(makeStorage());
 s.lastError=new Error('QuotaExceededError on prior map');
 assert.equal(s.readPresetSlot('empty-meadow'),null);
 assert.equal(s.lastError,null);
});

test('boot recovers newest per-map slot if latest pointer failed under quota',()=>{
 const store=makeStorage();
 const s=makeManager(store);
 s.schedule(()=>makeScene(11),'qs3d-island');s.flush();
 const oldLatest=store.getItem(SCENE_AUTOSAVE_KEY);
 const newRecord={format:'qs3d-cozy-glade:autosave',version:1,savedAt:Date.now()+5000,
  presetId:'empty-meadow',sceneJSON:s.history.serializeJSON(makeScene(23))};
 store.setItem(sceneSlotKey('empty-meadow'),JSON.stringify(newRecord));
 assert.equal(store.getItem(SCENE_AUTOSAVE_KEY),oldLatest);
 const chosen=s.mostRecentCheckpoint(['qs3d-island','empty-meadow']);
 assert.equal(chosen.presetId,'empty-meadow');
 assert.equal(JSON.parse(chosen.sceneJSON).scene.env.timeOfDay,23);
});
test('boot maintains backward compatibility when only v1 legacy pointer exists',()=>{
 const store=makeStorage(),s=makeManager(store);
 const record={format:'qs3d-cozy-glade:autosave',version:1,savedAt:42,
  presetId:'qs3d-island',sceneJSON:s.history.serializeJSON(makeScene(8))};
 store.setItem(SCENE_AUTOSAVE_KEY,JSON.stringify(record));
 assert.equal(s.mostRecentCheckpoint(['empty-meadow','qs3d-island']).presetId,'qs3d-island');
});
test('bad newest slot is ignored without hiding corrupt-data diagnostic if nothing valid remains',()=>{
 const store=makeStorage(),s=makeManager(store);
 store.setItem(sceneSlotKey('empty-meadow'),'{INVALID');
 assert.equal(s.mostRecentCheckpoint(['empty-meadow','qs3d-island']),null);
 assert.ok(s.lastError);
 const snapshot={format:'qs3d-cozy-glade:autosave',version:1,savedAt:100,
  presetId:'qs3d-island',sceneJSON:s.history.serializeJSON(makeScene(7))};
 store.setItem(SCENE_AUTOSAVE_KEY,JSON.stringify(snapshot));
 assert.equal(s.mostRecentCheckpoint(['empty-meadow','qs3d-island']).presetId,'qs3d-island');
});
