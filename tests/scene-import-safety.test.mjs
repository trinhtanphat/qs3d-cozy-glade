import test from 'node:test';
import assert from 'node:assert/strict';
import { HistoryManager } from '../src/ux/HistoryManager.js';

function validScene() {
  return {
    world: { version: 1, season: 'summer', terrain: { heightsB64: '', paths: [] },
      foliage: { trees: [], bushes: [], flowers: [], boulders: [] } },
    arch: { buildings: [], walls: [], paths: [], clutter: [] },
    env: { season: 'summer', timeOfDay: 13.25, mist: 0.12 },
  };
}
const history = () => new HistoryManager(3);
const envelope = (scene = validScene()) => JSON.stringify({
  format: 'tiny-glade-scene', version: 1, scene,
});

test('valid direct scene snapshots import losslessly', async () => {
  assert.deepEqual(await history().importJSON(JSON.stringify(validScene())), validScene());
});
test('valid versioned envelope imports losslessly', async () => {
  assert.deepEqual(await history().importJSON(envelope()), validScene());
});
test('file-like import via text() works', async () => {
  const s = envelope();
  assert.deepEqual(await history().importJSON({ size: s.length, text: async () => s }), validScene());
});
test('export JSON round-trips typed arrays', async () => {
  const s = validScene(); s.world.terrain.heights = new Float32Array([1.25, 0, -2.5]);
  const txt = history().exportJSON(s);
  const back = await history().importJSON(txt);
  assert.ok(back.world.terrain.heights instanceof Float32Array);
  assert.deepEqual(Array.from(back.world.terrain.heights), [1.25, 0, -2.5]);
});
test('duplicate state does not add extra undo record', () => {
  const h=history(); const s=validScene();
  h.pushState(s); h.pushState(structuredClone(s));
  assert.equal(h._undoStack.length,1);
});
test('undo and redo preserve deep snapshots', () => {
  const h=history(); const start=validScene(); const after=structuredClone(start);
  after.env.timeOfDay=18;
  h.pushState(start);
  const back=h.undo(after);
  assert.equal(back.env.timeOfDay,13.25);
  assert.equal(h.canRedo(),true);
  assert.equal(h.redo(back).env.timeOfDay,18);
});
test('clear resets history flags', () => {
  const h=history(); h.pushState(validScene());h.clear();
  assert.equal(h.canUndo(),false);assert.equal(h.canRedo(),false);
});

const invalid = [
 ['non-JSON input', '{oops'],
 ['empty root', 'null'],
 ['array root', '[]'],
 ['no world', '{"arch":{}}'],
 ['no arch', '{"world":{}}'],
 ['wrong world type', '{"world":[],"arch":{}}'],
 ['wrong arch type', '{"world":{},"arch":null}'],
 ['malformed world terrain', '{"world":{"terrain":[]},"arch":{}}'],
 ['malformed arch buildings', '{"world":{},"arch":{"buildings":{}}}'],
 ['unsupported format', '{"format":"alien-scene","world":{},"arch":{}}'],
 ['unsupported version', '{"format":"tiny-glade-scene","version":2,"scene":{"world":{},"arch":{}}}'],
 ['missing wrapped scene', '{"format":"tiny-glade-scene","version":1}'],
 ['prototype pollution key', '{"world":{},"arch":{"__proto__":{"x":1}}}'],
 ['nested constructor pollution key', '{"world":{},"arch":{},"env":{"constructor":{}}}'],
 ['nested prototype key', '{"world":{},"arch":{"walls":[{"prototype":{}}]}}'],
 ['number overflow to Infinity', '{"world":{},"arch":{},"env":{"timeOfDay":1e309}}'],
 ['typed float overflow to Infinity', '{"world":{"terrain":{"heights":{"__typedArray":"Float32Array","data":[1e300]}}},"arch":{}}'],
 ['unsupported environment', '{"world":{},"arch":{},"env":[]}'],
];
for (const [name, raw] of invalid) {
  test('reject: ' + name, async () => {
    await assert.rejects(history().importJSON(raw), Error);
  });
}
test('rejects excessive nesting', async () => {
  const scene=validScene();let v={};
  for(let i=0;i<55;i++)v={nested:v};
  scene.env.deep=v;
  await assert.rejects(history().importJSON(envelope(scene)), /nesting|complexity/);
});
test('rejects large scene arrays', async () => {
  const s=validScene();s.arch.paths=Array(100001).fill(0);
  await assert.rejects(history().importJSON(envelope(s)), /array is too large/);
});
test('rejects oversized file before reading it', async () => {
  let read=false;
  await assert.rejects(history().importJSON({size: 16*1024*1024+1,text:async()=>{read=true;return envelope();}}), /16 MB/);
  assert.equal(read,false);
});
test('rejects oversized JSON string', async () => {
  const s=envelope()+(' '.repeat(16*1024*1024));
  await assert.rejects(history().importJSON(s), /16 MB/);
});
test('invalid scenes cannot corrupt object prototype', async () => {
  await assert.rejects(history().importJSON('{"world":{},"arch":{"__proto__":{"polluted":true}}}'));
  assert.equal({}.polluted,undefined);
});
