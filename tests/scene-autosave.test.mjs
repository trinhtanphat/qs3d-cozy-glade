import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneAutosave, SCENE_AUTOSAVE_KEY } from '../src/ux/SceneAutosave.js';
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
