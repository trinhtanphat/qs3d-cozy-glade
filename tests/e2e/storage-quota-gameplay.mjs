import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const dir=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(dir,{recursive:true});
const result={url:process.env.GAME_URL||'http://127.0.0.1:5487/',steps:[],errors:[]};
const note=(name,details={})=>{const r={name,...details};result.steps.push(r);console.log(JSON.stringify(r));fs.writeFileSync(path.join(dir,'qa-storage-quota-guard.json'),JSON.stringify(result,null,2))};
const remote=Boolean(process.env.CHROME_CDP_URL);
const browser=remote
 ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
 : await chromium.launch({executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
let ctx;
try{
 ctx=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await ctx.newPage();
 page.on('pageerror',e=>result.errors.push('PAGE '+e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push('CONSOLE '+m.text().slice(0,250))});
 page.on('requestfailed',r=>{
  const e=r.failure()?.errorText??'';
  if(!r.url().includes('/cdn-cgi/rum')||e!=='net::ERR_ABORTED')result.errors.push('REQUEST '+r.url()+' '+e);
 });
 const res=await page.goto(result.url,{waitUntil:'domcontentloaded',timeout:85000});
 await page.waitForFunction(()=>window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:110000});
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForTimeout(1200);
 const before=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 // Simulate browser quota denial without changing real browser profile storage.
 await page.evaluate(()=>{
  const manager=window.__glade.sceneAutosave,original=manager.storage;
  window.__qaOriginalStorage=original;
  manager.storage={
   getItem:k=>original.getItem(k),
   removeItem:k=>original.removeItem(k),
   setItem:()=>{throw new DOMException('The quota has been exceeded','QuotaExceededError')}
  };
 });
 await page.locator('[data-tool="cottage"]').click();
 for(const [x,y] of [[820,420],[700,440],[900,440]]){
  await page.mouse.click(x,y);
  await page.waitForTimeout(350);
  if(await page.evaluate(()=>window.__glade.arch.serialize().buildings.length)>before)break;
 }
 const built=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 if(built!==before+1)throw Error('Actual UI house creation failed');
 const pending=await page.evaluate(()=>window.__glade.sceneAutosave.pending?.presetId);
 if(pending!=='empty-meadow')throw Error('Autosave pending scene missing');
 note('house-built-with-quota-full',{before,built,pending});
 let blockedDialog=false;
 page.once('dialog',async dialog=>{
  blockedDialog=/không thể tự lưu/i.test(dialog.message());
  await dialog.dismiss();
 });
 await page.locator('.tg-select').selectOption('qs3d-island');
 await page.waitForTimeout(400);
 const canceled=await page.evaluate(()=>({
  currentPreset:document.querySelector('.tg-select').value,
  buildingCount:window.__glade.arch.serialize().buildings.length,
  pendingPreset:window.__glade.sceneAutosave.pending?.presetId,
  error:window.__glade.sceneAutosave.lastError?.name
 }));
 note('switch-canceled-keeps-current-map',{...canceled,blockedDialog});
 if(!blockedDialog||canceled.currentPreset!=='empty-meadow'||canceled.buildingCount!==before+1||canceled.pendingPreset!=='empty-meadow')throw Error('Quota guard failed to preserve unsaved map');
 await page.evaluate(()=>{window.__glade.sceneAutosave.storage=window.__qaOriginalStorage;});
 await page.locator('.tg-select').selectOption('qs3d-island');
 await page.waitForTimeout(900);
 const slot=await page.evaluate(()=>{
  const m=window.__glade.sceneAutosave;
  const saved=m.readPresetSlot('empty-meadow');
  return {found:!!saved,buildings:saved?JSON.parse(saved.sceneJSON).scene.arch.buildings.length:null};
 });
 note('retry-after-quota-recovery',{slot});
 if(!slot.found||slot.buildings!==before+1)throw Error('House not recovered after quota is cleared');
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForFunction(n=>window.__glade.arch.serialize().buildings.length===n,before+1,{timeout:20000});
 note('map-reopened-with-house',{buildingCount:await page.evaluate(()=>window.__glade.arch.serialize().buildings.length)});
 result.success=true;
}catch(e){result.failure=String(e.stack||e).slice(0,1200);note('FAILED',{failure:result.failure})}
finally{
 try{await ctx?.close()}catch{}
 if(!remote)try{await browser.close()}catch{}
 note('final',{success:result.success===true,errorCount:result.errors.length});
 if(!result.success||result.errors.length)process.exitCode=1;
}