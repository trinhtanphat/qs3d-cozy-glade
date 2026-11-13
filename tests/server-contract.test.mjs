import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import path from 'node:path';

async function unusedPort(){
 return await new Promise((resolve,reject)=>{
  const s=net.createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))});
 });
}
test('HTTP origin security, caching, assets and routes',async(t)=>{
 const port=await unusedPort();const root=path.dirname(fileURLToPath(new URL('../server.mjs',import.meta.url)));
 const proc=spawn(process.execPath,[path.join(root,'server.mjs')],{
  cwd:root,env:{...process.env,PORT:String(port)},windowsHide:true,stdio:'ignore'});
 t.after(()=>{proc.kill()});
 const url='http://127.0.0.1:'+port;
 let ready=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(url+'/healthz');if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(ready,true,'isolated server must start');
 const get=(p,opts)=>fetch(url+p,opts);
 for(const route of ['/','/play','/play/']){
  await t.test('game entry '+route,async()=>{
   const r=await get(route);assert.equal(r.status,200);
   const html=await r.text();assert.match(html,/<html lang="vi">/);
   assert.match(r.headers.get('content-type'),/text\/html/);
   assert.match(r.headers.get('cache-control'),/no-cache/);
  });
 }
 await t.test('health check does not cache',async()=>{
  const r=await get('/healthz');assert.equal(r.status,200);
  assert.deepEqual((await r.json()).ok,true);
  assert.equal(r.headers.get('cache-control'),'no-store');
 });
 for(const [p,mt] of [['/dist/glade.js','javascript'],['/dist/glade.css','css'],['/qs3d-guide.js','javascript'],['/qs3d-guide.css','css']]){
  await t.test('script or style '+p,async()=>{
   const r=await get(p);assert.equal(r.status,200);
   assert.ok(r.headers.get('content-type').includes(mt));
   assert.ok(Number(r.headers.get('content-length'))>50);
  });
 }
 for(const p of ['/.git/config','/node_modules/three/package.json','/package.json',
   '/server.mjs','/src/main.js','/.env','/%2e%2e/package.json']){
  await t.test('restricted path '+p,async()=>assert.equal((await get(p)).status,403));
 }
 await t.test('unknown public asset returns 404',async()=>{
  assert.equal((await get('/public/not-a-real-asset.png')).status,404);
 });
 await t.test('POST is rejected',async()=>{
  assert.equal((await get('/',{method:'POST'})).status,405);
 });
 await t.test('HEAD has no body',async()=>{
  const r=await get('/dist/glade.js',{method:'HEAD'});
  assert.equal(r.status,200);assert.equal((await r.text()),'');
 });
 await t.test('strong HTTP security headers',async()=>{
  const r=await get('/');
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.match(r.headers.get('permissions-policy'),/microphone=\(\)/);
  assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');
 });
 await t.test('ETag enables 304 without stale bundled JS',async()=>{
  const first=await get('/dist/glade.js');
  const etag=first.headers.get('etag');
  assert.ok(etag);
  const again=await get('/dist/glade.js',{headers:{'if-none-match':etag}});
  assert.equal(again.status,304);assert.equal(await again.text(),'');
 });
});
