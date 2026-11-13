import test from 'node:test';
import assert from 'node:assert/strict';
import {buildQS3DIsland} from '../src/ux/QS3DIsland.js';
import {PRESET_SCENES} from '../src/ux/PresetScenes.js';

function makeFixture(){
 const N=64;
 const tracked={walls:[],buildings:[],paths:[],groves:[],flowers:[],syncs:0,skirt:0,lights:0};
 const terrain={gridSize:N,worldSize:120,heights:new Float32Array(N*N),
  _syncRegion(){tracked.syncs++;},_syncSkirtHeights(){tracked.skirt++;}};
 const getHeightAt=(x,z)=>{
  const ix=Math.max(0,Math.min(N-1,Math.round((x/120+0.5)*(N-1))));
  const iz=Math.max(0,Math.min(N-1,Math.round((z/120+0.5)*(N-1))));
  return terrain.heights[iz*N+ix];
 };
 const world={terrain,getHeightAt,getHeightDataTexture:()=>({}),
  addPath:(points,opts)=>{tracked.paths.push({points,opts});return tracked.paths.length;},
  getPaths:()=>tracked.paths,
  paintTrees:(...args)=>{tracked.groves.push(args);},
  paintFlowers:(...args)=>{tracked.flowers.push(args);},
  foliage:{pruneAndReground(){},rebuildShoreFlora(){}},
  wildlife:{onWorldModified(){}},
  syncFootprints(){}};
 const arch={addBuilding:(b)=>tracked.buildings.push(b),
  addWall:(...w)=>tracked.walls.push(w),
  getFootprints:()=>[],getLanternPositions:()=>[],setPaths:()=>{},
  addClutter:()=>{}};
 const pipeline={water:{updateTerrainTexture(){}},setWeather(){},
   setTimeOfDay(){},syncPointLights(){tracked.lights++;}};
 return {world,arch,pipeline,tracked};
}

test('QS3D island is the first selectable preset, preserving all four upstream presets',()=>{
 const ids=PRESET_SCENES.map(p=>p.id);
 assert.equal(ids[0],'qs3d-island');
 for(const id of ['lakeside-keep','cotswold-hamlet','moonlit-abbey','empty-meadow']) assert.ok(ids.includes(id));
 assert.equal(new Set(ids).size,ids.length);
});
test('Island contains land surrounded by sea and its own freshwater pond',()=>{
 const f=makeFixture();
 const v=buildQS3DIsland(f);
 assert.equal(v.id,'qs3d-island');
 assert.ok(f.world.getHeightAt(0,0)>0.25,'central meadow above sea level');
 assert.ok(f.world.getHeightAt(-12,-1)<-0.35,'freshwater pond below sea level');
 for(const [x,z] of [[58,0],[-58,0],[0,58],[0,-58]]) {
   assert.ok(f.world.getHeightAt(x,z)<-0.35,'sea rim submerged at '+[x,z].join(','));
 }
 assert.equal(f.tracked.syncs,1,'terrain GPU data synced once');
 assert.equal(f.tracked.skirt,1,'terrain skirt synced');
});
test('Builds a teal-roof editable cottage with paths, fences and planted nature',()=>{
 const f=makeFixture();
 buildQS3DIsland(f);
 assert.equal(f.tracked.buildings.length,1);
 assert.equal(f.tracked.buildings[0].roofColor,'teal');
 assert.ok(f.tracked.paths.length>=2);
 assert.ok(f.tracked.walls.length>=2);
 assert.ok(f.tracked.groves.length>=6);
 assert.ok(f.tracked.flowers.length>=3);
 assert.equal(f.tracked.lights,1);
});
test('No invalid or non-finite values in the generated terrain',()=>{
 const f=makeFixture();
 buildQS3DIsland(f);
 for(const v of f.world.terrain.heights) {
   assert.ok(Number.isFinite(v));
   assert.ok(v>=-3.5&&v<=18.0);
 }
});
