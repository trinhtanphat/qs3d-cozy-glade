import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.GAME_URL||'http://127.0.0.1:5487/';
const dir=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(dir,{recursive:true});
const report={url,steps:[],errors:[],success:false};
const step=(name,more={})=>{
 const item={name,...more};report.steps.push(item);console.log(JSON.stringify(item));
 fs.writeFileSync(path.join(dir,'webgl-recovery-e2e.json'),JSON.stringify(report,null,2));
};
const usingCDP=Boolean(process.env.CHROME_CDP_URL);
const browser=usingCDP
 ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
 : await chromium.launch({executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,args:['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
let context;
try {
 context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
 const page=await context.newPage();
 page.on('pageerror',error=>report.errors.push('PAGE '+error.message));
 page.on('console',message=>{if(message.type()==='error')report.errors.push('CONSOLE '+message.text().slice(0,400))});
 page.on('requestfailed',request=>{
  if(request.url().includes('/cdn-cgi/rum') && request.failure()?.errorText==='net::ERR_ABORTED')return;
  report.errors.push('NETWORK '+request.url()+' '+request.failure()?.errorText);
 });
 let navs=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navs++});
 const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:85000});
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
 step('boot',{status:resp.status(),buttons:await page.locator('#graphics-retry').count()});
 if(resp.status()!==200)throw Error('HTTP not 200');
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForTimeout(850);
 const initial=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 await page.locator('[data-tool="cottage"]').click();
 let built=false;
 for(const [x,y] of [[820,420],[750,440],[880,450]]){
  await page.mouse.click(x,y);
  await page.waitForTimeout(370);
  const now=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
  if(now>initial){built=true;break}
 }
 if(!built)throw Error('Actual house placement failed');
 await page.waitForFunction(n=>{
  const slot=window.__glade.sceneAutosave.readPresetSlot('empty-meadow');
  return !!slot && JSON.parse(slot.sceneJSON).scene.arch.buildings.length===n;
 },initial+1,{timeout:22000});
 step('house-built-and-autosaved',{buildings:initial+1});
 await page.locator('.tg-time-slider').fill('22.25');
 await page.evaluate(()=>{
  const m=window.__glade.sceneAutosave;
  window.__qaOriginalStorage=m.storage;
  m.storage={getItem:k=>window.__qaOriginalStorage.getItem(k),
   removeItem:k=>window.__qaOriginalStorage.removeItem(k),
   setItem:()=>{throw new DOMException('Quota denied','QuotaExceededError')}};
 });
 const prevented=await page.evaluate(()=>{
   const e=new Event('webglcontextlost',{bubbles:false,cancelable:true});
   document.getElementById('glade-canvas').dispatchEvent(e);
   return {prevented:e.defaultPrevented,lost:window.__glade.graphicsRecovery.isLost,
     pending:!!window.__glade.sceneAutosave.pending};
 });
 await page.locator('#loading-overlay.has-error').waitFor({state:'visible',timeout:8000});
 if(!prevented.prevented||!prevented.lost||!prevented.pending)throw Error('WebGL loss handler did not protect unsaved edits');
 if(!(await page.locator('#graphics-retry').isVisible())||!(await page.locator('#graphics-backup').isVisible()))throw Error('Recovery controls not available');
 step('context-loss-detected',{...prevented,message:await page.locator('#loading-status').innerText()});

 let dialogMessage=null;
 page.once('dialog',async dialog=>{dialogMessage=dialog.message();await dialog.dismiss()});
 await page.locator('#graphics-retry').click();
 if(!dialogMessage?.includes('Không tự lưu'))throw Error('Reload risk confirmation was missing');
 if(navs!==1)throw Error('Reload occurred despite cancel');
 step('cancel-reload-preserves-edits',{confirmed:false,navs});

 const downloaded=page.waitForEvent('download',{timeout:25000});
 await page.locator('#graphics-backup').click();
 const d=await downloaded;
 const file=path.join(dir,'recovered-webgl-design.json');
 await d.saveAs(file);
 const snapshot=JSON.parse(fs.readFileSync(file,'utf8')).scene;
 if(snapshot.arch.buildings.length!==initial+1||snapshot.env.timeOfDay!==22.25)throw Error('Downloaded backup did not include live unsaved scene');
 step('emergency-json-export',{bytes:fs.statSync(file).size,buildings:snapshot.arch.buildings.length,time:snapshot.env.timeOfDay});

 await page.evaluate(()=>{window.__glade.sceneAutosave.storage=window.__qaOriginalStorage});
 await page.locator('#graphics-retry').click();
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden') && document.querySelector('.tg-select')?.value==='empty-meadow',null,{timeout:120000});
 await page.waitForFunction(n=>window.__glade.arch.serialize().buildings.length===n,initial+1,{timeout:30000});
 const recovered=await page.evaluate(()=>({
  buildings:window.__glade.arch.serialize().buildings.length,
  time:window.__glade.pipeline.envState.timeOfDay,
  lost:window.__glade.graphicsRecovery.isLost,
  preset:document.querySelector('.tg-select')?.value,
 }));
 if(Math.abs(recovered.time-22.25)>0.06||recovered.lost)throw Error('Reload did not recover saved time or renderer');
 if(navs!==2)throw Error('Unexpected navigation loop, count='+navs);
 step('reloaded-and-restored',{...recovered,navs});
 await page.setViewportSize({width:390,height:844});
 const compact=await page.evaluate(()=>({
  viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
  retryPresent:!!document.querySelector('#graphics-retry'),
 }));
 if(compact.documentWidth>compact.viewport||!compact.retryPresent)throw Error('Recovery UI breaks mobile viewport');
 step('mobile-layout',{...compact});
 report.success=true;
}catch(error){report.failure=String(error.stack||error).slice(0,1800);step('FAILED',{failure:report.failure})}
finally{
 try{await context?.close()}catch{}
 if(!usingCDP)try{await browser.close()}catch{}
 step('final',{success:report.success,errorCount:report.errors.length});
 if(!report.success||report.errors.length)process.exitCode=1;
}
