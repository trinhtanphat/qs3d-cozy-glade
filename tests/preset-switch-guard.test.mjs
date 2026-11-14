import test from 'node:test';
import assert from 'node:assert/strict';
import { maySwitchPreset } from '../src/ux/PresetSwitchGuard.js';

test('scene change without pending edits proceeds without asking',()=>{
 let asked=0;
 assert.equal(maySwitchPreset({autosave:{pending:null},confirmDiscard:()=>{asked++;return false}}),true);
 assert.equal(maySwitchPreset({autosave:null,confirmDiscard:()=>{asked++;return false}}),true);
 assert.equal(asked,0);
});
test('successful flush permits switch and does not show discard confirmation',()=>{
 let asked=0;
 const autosave={pending:{presetId:'island'},flush:()=>true};
 assert.equal(maySwitchPreset({autosave,confirmDiscard:()=>{asked++;return false}}),true);
 assert.equal(asked,0);
});
test('quota failure plus Cancel retains the current map and its pending snapshot',()=>{
 const pending={presetId:'island',capture:()=>({buildings:[1,2,3]})};
 let canceled=0,cleared=0;
 const autosave={pending,flush:()=>false,cancelPending:()=>{cleared++}};
 assert.equal(maySwitchPreset({autosave,confirmDiscard:()=>false,onCancel:()=>{canceled++}}),false);
 assert.equal(canceled,1);
 assert.equal(cleared,0);
 assert.equal(autosave.pending,pending);
});
test('quota failure plus explicit approval permits switching',()=>{
 let canceled=0,cleared=0;
 const autosave={pending:{capture:()=>({})},flush:()=>false,cancelPending:()=>{cleared++;autosave.pending=null;}};
 assert.equal(maySwitchPreset({autosave,confirmDiscard:()=>true,onCancel:()=>{canceled++}}),true);
 assert.equal(cleared,1);
 assert.equal(canceled,0);
 assert.equal(autosave.pending,null);
});
test('storage failure cannot bypass confirmation if callback is unavailable',()=>{
 let canceled=0;
 const autosave={pending:{},flush:()=>false,cancelPending:()=>{throw Error('Must not clear unsaved state');}};
 assert.equal(maySwitchPreset({autosave,onCancel:()=>{canceled++}}),false);
 assert.equal(canceled,1);
});
