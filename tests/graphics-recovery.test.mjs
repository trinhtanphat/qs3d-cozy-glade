import test from 'node:test';
import assert from 'node:assert/strict';
import { installGraphicsRecovery } from '../src/ux/GraphicsRecovery.js';

class FakeElement {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (...names) => names.forEach((n) => this.classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classes.delete(n)),
    };
    this.hidden = false;
    this.textContent = '';
    this.type = null;
    this.id = '';
    this.attributes = new Map();
  }
  append(node) { this.children.push(node); }
  remove() { this.removed = true; }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(fn);
  }
  removeEventListener(name, fn) {
    const a = this.listeners.get(name) || [];
    this.listeners.set(name, a.filter((x) => x !== fn));
  }
  dispatch(name, event = { preventDefault() { this.defaultPrevented = true; } }) {
    for (const fn of this.listeners.get(name) || []) fn(event);
    return event;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
}
function fixture({ onReload, onContextLost } = {}) {
  const doc = { createElement: () => new FakeElement(doc) };
  const canvas = new FakeElement(doc);
  const overlay = new FakeElement(doc);
  const statusEl = new FakeElement(doc);
  overlay.classList.add('is-hidden');
  const recovery = installGraphicsRecovery({canvas,overlay,statusEl,onReload,onContextLost});
  const retry=overlay.children.find((child) => child.id === 'graphics-retry');
  const backup=overlay.children.find((child) => child.id === 'graphics-backup');
  return {canvas,overlay,statusEl,retry,backup,recovery};
}
test('successful scene starts with hidden recovery actions',()=>{
  const f=fixture();
  assert.equal(f.recovery.isLost,false);
  assert.equal(f.retry.hidden,true);
  assert.equal(f.backup.hidden,true);
  assert.equal(f.overlay.classList.contains('is-hidden'),true);
});
test('initial WebGL startup error becomes a retryable, accessible status',()=>{
  const f=fixture();
  f.recovery.showFailure('Error creating WebGL context.');
  assert.equal(f.overlay.classList.contains('has-error'),true);
  assert.equal(f.overlay.classList.contains('is-hidden'),false);
  assert.match(f.statusEl.textContent,/Error creating WebGL context/);
  assert.equal(f.retry.hidden,false);
  assert.equal(f.retry.attributes.get('aria-label'),'Thử lại đồ họa WebGL2');
  assert.equal(f.backup.hidden,true,'No scene exists to export before startup');
});
test('WebGL context loss pauses scene and keeps user backup available',()=>{
  let called=0,backup=0;
  const f=fixture({onContextLost:()=>called++});
  f.recovery.setBackupHandler(()=>backup++);
  const evt=f.canvas.dispatch('webglcontextlost');
  assert.equal(evt.defaultPrevented,true,'Browser should be allowed to restore WebGL');
  assert.equal(called,1);
  assert.equal(f.recovery.isLost,true);
  assert.equal(f.retry.hidden,false);
  assert.equal(f.backup.hidden,false);
  assert.match(f.statusEl.textContent,/GPU/);
  f.backup.dispatch('click');
  assert.equal(backup,1);
  f.canvas.dispatch('webglcontextrestored');
  assert.match(f.statusEl.textContent,/trở lại/);
  assert.equal(f.recovery.isLost,true,'Do not silently resume incompatible custom render targets');
});
test('retry only occurs after explicit button click; cancel can avoid reload',()=>{
  let allowed=false,attempts=0,reloads=0;
  const f=fixture({onReload:()=>{attempts++; if (allowed) reloads++}});
  f.recovery.showFailure('WebGL context lost');
  assert.equal(attempts,0);
  f.retry.dispatch('click');
  assert.equal(attempts,1);
  assert.equal(reloads,0);
  allowed=true;
  f.retry.dispatch('click');
  assert.equal(reloads,1);
});
test('observer exceptions are isolated, and backup can be removed',()=>{
  const f=fixture({onContextLost:()=>{throw Error('Autosave blocked')}});
  f.recovery.setBackupHandler(()=>{throw Error('Disk is full')});
  f.canvas.dispatch('webglcontextlost');
  f.backup.dispatch('click');
  assert.match(f.statusEl.textContent,/chưa thành công/i);
  f.recovery.setBackupHandler(null);
  assert.equal(f.backup.hidden,true);
});
test('cleanup unregisters context listeners and removes QA controls',()=>{
  let lost=0;
  const f=fixture({onContextLost:()=>lost++});
  f.recovery.dispose();
  f.canvas.dispatch('webglcontextlost');
  assert.equal(lost,0);
  assert.equal(f.retry.removed,true);
  assert.equal(f.backup.removed,true);
});
