/**
 * Bounded browser endurance QA; never uses shared tabs, server mutation,
 * or an actual GPU stress device. Tests a fresh browser profile only.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url=process.env.GAME_URL||'https://glade.qs3d.site/';
const durationMs=Math.max(30000,Math.min(1800000,Number(process.env.QA_DURATION_MS)||180000));
const intervalMs=Math.max(5000,Math.min(60000,Number(process.env.QA_SAMPLE_MS)||15000));
const directory=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(directory,{recursive:true});
const output=path.join(directory,'scene-endurance.json');
const report={testedAt:new Date().toISOString(),url,durationMs,intervalMs,
  samples:[],errors:[],networkFailures:[],success:false,notes:'Isolated browser endurance, not physical Intel GPU QA'};
function write(){fs.writeFileSync(output,JSON.stringify(report,null,2),'utf8')}
function log(name,extra={}){const s={name,...extra};console.log(JSON.stringify(s));write()}
const shared=Boolean(process.env.CHROME_CDP_URL);
const browser=shared
  ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
  : await chromium.launch({
    executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless:true,args:['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']
  });
let context;
try{
 context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:false});
 const page=await context.newPage();
 let navigations=0,crashed=false;
 page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++});
 page.on('pageerror',e=>report.errors.push('PAGE '+e.message));
 page.on('crash',()=>{crashed=true;report.errors.push('PAGE_CRASH')});
 page.on('console',m=>{if(m.type()==='error' && report.errors.length<30)report.errors.push('CONSOLE '+m.text().slice(0,260))});
 page.on('requestfailed',r=>{
   const err=r.failure()?.errorText||'';
   if(r.url().includes('/cdn-cgi/rum')&&err==='net::ERR_ABORTED')return;
   if(report.networkFailures.length<30)report.networkFailures.push(r.url().slice(0,180)+' '+err);
 });
 const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
 if(resp?.status()!==200)throw Error('HTTP status '+resp?.status());
 await page.waitForFunction(()=>!!window.__glade &&
   document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:110000});
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForTimeout(850);
 // Avoid expensive rendering on software-backed CI-like QA; make this
 // a scene persistence and lifecycle test, not a GPU stress test.
 await page.evaluate(()=>{
  const g=window.__glade;
  g.adaptiveQuality?.manualOverride?.();
  g.pipeline?.setQuality?.('eco');
  g.world?.setQuality?.('eco');
  g.hud?.setQuality?.('eco');
 });
 const initial=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 await page.locator('[data-tool="cottage"]').click();
 let placed=false;
 for(const [x,y] of [[830,440],[780,460],[900,460],[730,430]]){
  await page.mouse.click(x,y);
  await page.waitForTimeout(420);
  if((await page.evaluate(()=>window.__glade.arch.serialize().buildings.length))>initial){placed=true;break}
 }
 if(!placed)throw Error('UI failed to place actual house');
 const houseCount=initial+1;
 await page.locator('.tg-time-slider').fill('11.25');
 await page.waitForFunction(n=>{
  const saved=window.__glade.sceneAutosave.readPresetSlot('empty-meadow');
  return !!saved &&
    JSON.parse(saved.sceneJSON).scene.arch.buildings.length===n &&
    JSON.parse(saved.sceneJSON).scene.env.timeOfDay===11.25;
 },houseCount,{timeout:23000});
 report.firstScene={houses:houseCount,time:11.25};
 log('scene-built-and-saved',{...report.firstScene});
 const start=Date.now();
 for(let i=0;Date.now()-start<durationMs;i++){
   await page.waitForTimeout(Math.min(intervalMs,Math.max(1,durationMs-(Date.now()-start))));
   const sample=await page.evaluate(()=>{
    const glade=window.__glade;
    const stats=glade?.pipeline?.getStats?.()||{};
    return {
      ready:!!glade&&document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),
      contextLost:glade?.graphicsRecovery?.isLost,
      preset:document.querySelector('.tg-select')?.value,
      houses:glade?.arch?.serialize?.().buildings.length,
      fps:stats.fps??null,drawCalls:stats.drawCalls??null,triangles:stats.triangles??null,
      visibility:document.visibilityState,
      saveStatus:document.querySelector('.tg-save-status')?.dataset.autosaveStatus,
      jsHeapUsed:performance.memory?.usedJSHeapSize??null,
    };
   });
   const measured={elapsedSec:Math.round((Date.now()-start)/1000),...sample};
   report.samples.push(measured);
   write();
   console.log('SAMPLE '+JSON.stringify(measured));
   if(!sample.ready||sample.contextLost||sample.preset!=='empty-meadow'||
     sample.houses!==houseCount||crashed){
     throw Error('Scene integrity/context lost during endurance at t='+measured.elapsedSec);
   }
 }
 // Check browser-local autosave integrity after the loop, then reload once.
 const stored=await page.evaluate(()=>JSON.parse(window.__glade.sceneAutosave.readPresetSlot('empty-meadow').sceneJSON).scene);
 if(stored.arch.buildings.length!==houseCount||stored.env.timeOfDay!==11.25)throw Error('Endurance checkpoint was altered');
 await page.reload({waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(n=>!!window.__glade&&
   document.querySelector('#loading-overlay')?.classList.contains('is-hidden')&&
   document.querySelector('.tg-select')?.value==='empty-meadow'&&
   window.__glade.arch.serialize().buildings.length===n,houseCount,{timeout:110000});
 const after=await page.evaluate(()=>({
   houses:window.__glade.arch.serialize().buildings.length,
   time:window.__glade.pipeline.envState.timeOfDay,
   lost:window.__glade.graphicsRecovery.isLost,
 }));
 if(Math.abs(after.time-11.25)>0.06||after.lost)throw Error('Post-endurance reload did not restore scene');
 if(navigations!==2)throw Error('Unexpected navigation count '+navigations);
 report.afterReload=after;
 if(report.errors.length||report.networkFailures.length)throw Error('Browser errors or failed requests during endurance');
 report.success=true;
 log('final-pass',{sampleCount:report.samples.length,elapsedSec:Math.round((Date.now()-start)/1000),navigations,after});
}catch(e){
 report.failure=String(e.stack||e).slice(0,1700);
 log('failed',{message:report.failure});
}finally{
 try{await context?.close()}catch{}
 if(!shared)try{await browser.close()}catch{}
 write();
 console.log('ENDURANCE_ACCEPTANCE='+ (report.success?'PASS':'FAIL')+' REPORT='+output);
 // An already-existing shared Chrome must stay alive. Exit only this Node
 // process; CDP transports can otherwise keep the event loop open.
 process.exit(report.success?0:1);
}
