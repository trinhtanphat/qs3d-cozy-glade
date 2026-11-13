import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainSystem } from '../src/world/TerrainSystem.js';

globalThis.THREE=THREE;

test('Eco terrain reduces raster triangles but keeps the entire editable 256x256 heightfield',()=>{
 const scene=new THREE.Scene();
 const terrain=new TerrainSystem({scene,materials:null,worldSize:120,waterLevel:-0.35});
 try{
  const fullIdx=terrain.geometry.index;
  assert.equal(fullIdx.count,255*255*6);
  const sample=[terrain.heights[0],terrain.heights[1000],terrain.heights[60000]];
  const size=terrain.geometry.attributes.position.count;
  assert.equal(size,256*256);

  terrain.setQuality('eco');
  const ecoIdx=terrain.geometry.index;
  assert.equal(ecoIdx.count,128*128*6);
  assert.ok(ecoIdx.count<fullIdx.count/3,'Eco must reduce triangle count at least 3x');
  assert.equal(terrain.geometry.attributes.position.count,size);
  assert.deepEqual([terrain.heights[0],terrain.heights[1000],terrain.heights[60000]],sample);
  for(const v of ecoIdx.array)assert.ok(v>=0&&v<size,'all LOD indices in range');

  terrain.setQuality('high');
  assert.equal(terrain.geometry.index,fullIdx,'High must reuse exact original full-resolution buffer');
  terrain.setQuality('balanced');
  assert.equal(terrain.geometry.index.count,fullIdx.count);
  terrain.setQuality('eco');
  assert.equal(terrain.geometry.index,ecoIdx,'Eco must reuse cached LOD buffer');
  terrain.setQuality('ultra');
  assert.equal(terrain.geometry.index,fullIdx,'Ultra must recover full grid');
 }finally{terrain.dispose()}
});
