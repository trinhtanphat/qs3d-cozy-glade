import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveQuality, QUALITY_ORDER, recommendedQualityForRenderer } from '../src/engine/AdaptiveQuality.js';

const make = (opts={})=>new AdaptiveQuality({startTime:0,...opts});
const sample = (q,now,fps=10)=>({quality:q,now,fps});
test('quality hierarchy includes low-powered eco and preserves Ultra',()=>{
 assert.deepEqual([...QUALITY_ORDER],['eco','balanced','high','ultra']);
});
test('auto quality waits for a complete warm-up period',()=>{
 const a=make();
 for(const t of [500,2500,7900]) assert.equal(a.observe(sample('high',t)),null);
});
test('auto quality needs three sustained slow FPS windows',()=>{
 const a=make();
 assert.equal(a.observe(sample('high',9000)),null);
 assert.equal(a.observe(sample('high',9400)),null);
 assert.equal(a.observe(sample('high',9800)),'balanced');
});
test('auto quality drops ultra to high only one tier at a time',()=>{
 const a=make();
 for(let i=0;i<2;i++)a.observe(sample('ultra',9000+i*400));
 assert.equal(a.observe(sample('ultra',9800)),'high');
});
test('auto quality applies cooldown after lowering a tier',()=>{
 const a=make();for(const t of [9000,9300])a.observe(sample('high',t));
 assert.equal(a.observe(sample('high',9600)),'balanced');
 for(const t of [9900,12000,17000])assert.equal(a.observe(sample('balanced',t)),null);
 for(const t of [18000,18400]) assert.equal(a.observe(sample('balanced',t)),null);
 assert.equal(a.observe(sample('balanced',18800)),'eco');
});
test('auto quality never goes below eco',()=>{
 const a=make();for(const t of [9000,9400])a.observe(sample('eco',t));
 assert.equal(a.observe(sample('eco',9800)),null);
});
test('manual quality override disables any later automatic downgrade',()=>{
 const a=make();a.observe(sample('high',9000));a.manualOverride();
 for(const t of [10000,15000,30000,90000])assert.equal(a.observe(sample('high',t)),null);
 assert.equal(a.isManual,true);
});
test('healthy FPS resets consecutive slow samples',()=>{
 const a=make();
 a.observe(sample('high',9000));
 a.observe(sample('high',9400,25));
 a.observe(sample('high',9800));
 a.observe(sample('high',10200));
 assert.equal(a.observe(sample('high',10600)),'balanced');
});
test('invalid FPS data does not trigger quality changes',()=>{
 const a=make();
 for(const fps of [NaN,Infinity,-Infinity]) assert.equal(a.observe(sample('high',9000,fps)),null);
 assert.equal(a.observe(sample('high',9000)),null);
});
test('invalid quality tiers are ignored',()=>{
 const a=make();
 for(const t of [9000,9400])a.observe(sample('unknown',t));
 assert.equal(a.observe(sample('unknown',9800)),null);
});
test('custom performance limits are respected',()=>{
 const a=make({minFps:35,consecutive:2,cooldownMs:1000});
 assert.equal(a.observe(sample('balanced',1100,30)),null);
 assert.equal(a.observe(sample('balanced',1200,30)),'eco');
});
test('auto quality never upgrades or oscillates from healthy FPS',()=>{
 const a=make();
 assert.equal(a.observe(sample('eco',12000,80)),null);
 assert.equal(a.observe(sample('balanced',20000,40)),null);
 assert.equal(a.observe(sample('high',30000,60)),null);
});

test('low-end Intel UHD 620 uses Eco rather than unplayable High',()=>{
 const renderer='ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)';
 assert.equal(recommendedQualityForRenderer('high',renderer),'eco');
 assert.equal(recommendedQualityForRenderer('balanced',renderer),'eco');
});
test('old Intel HD Graphics 520 likewise uses Eco',()=>{
 assert.equal(recommendedQualityForRenderer('high','Intel(R) HD Graphics 520'),'eco');
});
test('modern discrete and integrated GPUs retain chosen defaults',()=>{
 for(const renderer of ['NVIDIA GeForce RTX 4070','AMD Radeon RX 6800','Intel(R) Iris(R) Xe Graphics','Apple M4 GPU','']){
  assert.equal(recommendedQualityForRenderer('high',renderer),'high');
 }
});
test('missing or non-string renderer identification falls back safely',()=>{
 for(const renderer of [null,undefined,17,{}]){
  assert.equal(recommendedQualityForRenderer('balanced',renderer),'balanced');
 }
});
