import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const resultDir=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(resultDir,{recursive:true});
const chrome=process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const hardware=process.env.GPU_RENDERER==='d3d11';
const browserArgs=hardware
 ? ['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--disable-software-rasterizer']
 : ['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox','--disable-dev-shm-usage'];
let browser=await chromium.launch({executablePath:chrome,headless:true,args:browserArgs});
const ctx=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
const page=await ctx.newPage();
const report={url:process.env.GAME_URL||'http://127.0.0.1:5487/',errors:[],steps:[],analyticsAborts:0};
page.on('pageerror',e=>report.errors.push('PAGE: '+e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push('CONSOLE: '+m.text().slice(0,250))});
page.on('requestfailed',r=>{
 // Cloudflare Browser Insights may abort a beacon during navigation.
 // Only ignore that known analytics endpoint; never mask game asset errors.
 if(r.url().includes('/cdn-cgi/rum') && r.failure()?.errorText==='net::ERR_ABORTED') {
   report.analyticsAborts++;return;
 }
 report.errors.push('NETWORK: '+r.url()+' '+r.failure()?.errorText);
});
const log=(name,obj={})=>{const step={name,...obj};report.steps.push(step);console.log(JSON.stringify(step));fs.writeFileSync(path.join(resultDir,'qa-autosave-gameplay.json'),JSON.stringify(report,null,2))};
const ready=async()=>{
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
};
try {
 const r=await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:70000});
 await ready();
 log('initial-load',{http:r.status(),time:await page.locator('.tg-time-readout').innerText(),preset:await page.locator('.tg-select').inputValue()});
 await page.locator('.tg-time-slider').fill('18.75');
 await page.waitForFunction(()=>!!window.__glade.sceneAutosave.read(),null,{timeout:30000});
 const checkpoint=await page.evaluate(()=>{
   const a=window.__glade.sceneAutosave;
   const record=a.read();return {exists:!!record,presetId:record?.presetId,storageBytes:record?.sceneJSON.length,
      time:record?JSON.parse(record.sceneJSON).scene.env.timeOfDay:null};
 });
 log('time-autosaved',checkpoint);
 if(!checkpoint.exists||checkpoint.time!==18.75)throw Error('TIME_AUTOSAVE_FAILED');
 await page.reload({waitUntil:'domcontentloaded',timeout:70000});
 await ready();
 await page.waitForFunction(()=>document.querySelector('.tg-time-readout')?.textContent==='18:45',null,{timeout:25000});
 log('time-restored',{time:await page.locator('.tg-time-readout').innerText()});

 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForTimeout(2000);
 const before=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 await page.locator('[data-tool="cottage"]').click({timeout:18000});
 for(const pt of [[820,420],[680,460],[905,490]]) {
   await page.mouse.click(pt[0],pt[1]);
   await page.waitForTimeout(450);
   const n=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
   if(n>before)break;
 }
 const afterBuild=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 log('built-cottage',{before,afterBuild,selectedTool:await page.locator('[data-tool="cottage"]').getAttribute('aria-pressed')});
 if(afterBuild<=before)throw Error('ACTUAL_COTTAGE_BUILD_FAILED');
 await page.waitForFunction(expected=>{
   const a=window.__glade.sceneAutosave.read();
   if(!a)return false;
   try{return JSON.parse(a.sceneJSON).scene.arch.buildings.length===expected}catch{return false}
 },afterBuild,{timeout:30000});
 const checkpointAfterBuild=await page.evaluate(()=>{
   const a=window.__glade.sceneAutosave.read();
   return {exists:!!a,presetId:a?.presetId,buildings:JSON.parse(a?.sceneJSON||'{}').scene?.arch?.buildings?.length};
 });
 log('build-autosaved',checkpointAfterBuild);
 if(checkpointAfterBuild.buildings!==afterBuild)throw Error('COTTAGE_NOT_PERSISTED');
 await page.reload({waitUntil:'domcontentloaded',timeout:75000});
 await ready();
 await page.waitForFunction(expected=>window.__glade.arch.serialize().buildings.length===expected,afterBuild,{timeout:30000});
 const restored=await page.evaluate(()=>({
   count:window.__glade.arch.serialize().buildings.length,
   preset:document.querySelector('.tg-select')?.value,
   canUndo:window.__glade.history.canUndo(),
   autosaveError:window.__glade.sceneAutosave.lastError?.message??null
 }));
 log('cottage-restored',restored);
 if(restored.count!==afterBuild||restored.preset!=='empty-meadow')throw Error('COTTAGE_RESTORE_FAILED');

 await page.locator('[data-tool="cottage"]').click({timeout:18000});
 await page.mouse.click(750,480);
 await page.waitForTimeout(500);
 const afterSecond=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 if(afterSecond<=restored.count)throw Error('SECOND_BUILD_FAILED');
 await page.locator('[data-action="undo"]').click();
 await page.waitForTimeout(300);
 const afterUndo=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 await page.locator('[data-action="redo"]').click();
 await page.waitForTimeout(300);
 const afterRedo=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 log('undo-redo',{afterSecond,afterUndo,afterRedo});
 if(afterUndo!==restored.count||afterRedo!==afterSecond)throw Error('UNDO_REDO_FAILED');

 // Isolate corrupted-storage recovery in a fresh context, so repeated
 // software-rendered WebGL reloads do not exhaust the QA machine's memory.
 await ctx.close();
 await browser.close();
 // Fresh Chrome process so software-rendered WebGL resources from three
 // reloads cannot prevent the independent corrupted-storage recovery test.
 browser=await chromium.launch({executablePath:chrome,headless:true,args:browserArgs});
 const damagedCtx=await browser.newContext({viewport:{width:1280,height:800}});
 await damagedCtx.addInitScript(()=>{
   try{localStorage.setItem('qs3d-cozy-glade:scene-autosave-v1','{BROKEN')}catch{}
 });
 const damagedPage=await damagedCtx.newPage();
 damagedPage.on('pageerror',e=>report.errors.push('DAMAGED PAGE: '+e.message));
 damagedPage.on('console',m=>{if(m.type()==='error')report.errors.push('DAMAGED CONSOLE: '+m.text().slice(0,200))});
 await damagedPage.goto(report.url,{waitUntil:'domcontentloaded',timeout:70000});
 await damagedPage.waitForFunction(()=>!!window.__glade&&document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
 const damage=await damagedPage.evaluate(()=>({
   gameReady:!!window.__glade,
   autosaveError:!!window.__glade.sceneAutosave.lastError,
   buildings:window.__glade.arch.serialize().buildings.length
 }));
 log('damaged-save-fallback',damage);
 if(!damage.gameReady||!damage.autosaveError)throw Error('DAMAGED_SAVE_RECOVERY_FAILED');
 await damagedPage.screenshot({path:path.join(resultDir,'qa-autosave-last.jpg'),type:'jpeg',quality:75});
 await damagedCtx.close();
 report.success=true;
}catch(e){report.failure=String(e.stack??e).slice(0,1500);log('FAILED',{failure:report.failure})}
finally{
 log('final',{success:report.success??false,errorCount:report.errors.length});
 await browser.close();
 if(!report.success||report.errors.length) process.exitCode=1;
}