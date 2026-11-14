import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const dest=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(dest,{recursive:true});
const uri=process.env.GAME_URL||'http://127.0.0.1:5487/';
const result={url:uri,events:[],errors:[]};
const event=(name,detail={})=>{
 const step={name,...detail};result.events.push(step);console.log(JSON.stringify(step));
 fs.writeFileSync(path.join(dest,'autosave-status-e2e.json'),JSON.stringify(result,null,2));
};
const shared=Boolean(process.env.CHROME_CDP_URL);
const browser=shared
 ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
 : await chromium.launch({
   executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
   headless:true,args:['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
 });
let context;
try {
 context=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await context.newPage();
 page.on('pageerror',x=>result.errors.push('PAGE '+x.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push('CONSOLE '+m.text().slice(0,250))});
 page.on('requestfailed',r=>{
  if(r.url().includes('/cdn-cgi/rum')&&r.failure()?.errorText==='net::ERR_ABORTED')return;
  result.errors.push('NET '+r.url()+' '+r.failure()?.errorText);
 });
 const r=await page.goto(uri,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
 const status=page.locator('.tg-save-status');
 const retry=page.locator('[data-action="retry-autosave"]');
 if(await status.count()!==1||await retry.count()!==1)throw Error('Missing accessible save status or retry control');
 event('game-ready',{http:r.status(),status:await status.innerText(),retryHidden:await retry.isHidden()});
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.locator('.tg-time-slider').fill('18.75');
 await page.waitForFunction(()=>document.querySelector('.tg-save-status')?.dataset.autosaveStatus==='saved',null,{timeout:22000});
 const valid=await page.evaluate(()=>window.__glade.sceneAutosave.readPresetSlot('empty-meadow')?.sceneJSON);
 if(!valid||JSON.parse(valid).scene.env.timeOfDay!==18.75)throw Error('Saved UI state not backed by actual storage data');
 event('real-save',{status:await status.innerText(),savedTime:18.75,retryHidden:await retry.isHidden()});

 await page.evaluate(()=>{
  const manager=window.__glade.sceneAutosave;
  window.__qaOriginalStorage=manager.storage;
  manager.storage={
   getItem:k=>window.__qaOriginalStorage.getItem(k),
   removeItem:k=>window.__qaOriginalStorage.removeItem(k),
   setItem:()=>{throw new DOMException('Storage is full','QuotaExceededError')}
  };
 });
 await page.locator('.tg-time-slider').fill('21.75');
 await page.waitForFunction(()=>document.querySelector('.tg-save-status')?.dataset.autosaveStatus==='error',null,{timeout:20000});
 if(await retry.isHidden())throw Error('Retry action hidden despite storage failure');
 const recorded=await page.evaluate(()=>window.__glade.sceneAutosave.readPresetSlot('empty-meadow')?.sceneJSON);
 if(JSON.parse(recorded).scene.env.timeOfDay!==18.75)throw Error('Autosave claimed failed but overwrote previous checkpoint');
 event('quota-failed',{status:await status.innerText(),retryVisible:true,previousTime:18.75});
 await retry.click();
 await page.waitForTimeout(300);
 if((await status.getAttribute('data-autosave-status'))!=='error')throw Error('Retry incorrectly claimed success while quota still denied');
 event('retry-failed-stays-error',{status:await status.innerText()});

 await page.evaluate(()=>{window.__glade.sceneAutosave.storage=window.__qaOriginalStorage;});
 await retry.click();
 await page.waitForFunction(()=>document.querySelector('.tg-save-status')?.dataset.autosaveStatus==='saved',null,{timeout:15000});
 const afterRetry=await page.evaluate(()=>JSON.parse(window.__glade.sceneAutosave.readPresetSlot('empty-meadow').sceneJSON).scene.env.timeOfDay);
 if(afterRetry!==21.75||!(await retry.isHidden()))throw Error('Retry did not persist latest scene or hide error action');
 event('retry-success',{status:await status.innerText(),savedTime:afterRetry});

 await page.setViewportSize({width:390,height:844});
 await status.scrollIntoViewIfNeeded();
 const bounds=await status.evaluate(n=>{
  const rect=n.getBoundingClientRect();
  return {left:rect.left,right:rect.right,viewport:innerWidth,documentWidth:document.documentElement.scrollWidth};
 });
 if(bounds.left<0||bounds.right>bounds.viewport||bounds.documentWidth>bounds.viewport)throw Error('Save status is not accessible on 390px mobile view');
 event('mobile-390px-status',{...bounds});
 result.success=true;
}catch(err){result.failure=String(err.stack||err).slice(0,2200);event('failed',{message:result.failure})}
finally{
 try{await context?.close()}catch{}
 if(!shared)try{await browser.close()}catch{}
 event('final',{success:!!result.success,errorCount:result.errors.length});
 if(!result.success||result.errors.length)process.exitCode=1;
}