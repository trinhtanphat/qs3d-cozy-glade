import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('compact desktop toolbar breakpoint keeps scene controls and clock on separate rows',()=>{
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const guide=readFileSync(new URL('../qs3d-guide.css',import.meta.url),'utf8');
 const rule=css.match(/@media \(min-width: 761px\) and \(max-width: 1349px\)\s*\{([\s\S]*?)\n\}/);
 assert.ok(rule,'compact desktop breakpoint required');
 assert.match(rule[1],/\.tg-top-left\s*\{[^}]*top:\s*12px/s);
 assert.match(rule[1],/\.tg-top-right-wrap\s*\{[^}]*top:\s*66px/s);
 assert.match(rule[1],/\.tg-top-left[^}]*overflow-x:\s*auto/s);
 assert.match(guide,/@media \(min-width: 761px\) and \(max-width: 1349px\)/);
});
