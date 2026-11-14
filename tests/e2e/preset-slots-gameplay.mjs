import {chromium} from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const dir=process.env.QA_RESULTS_DIR||process.cwd();
fs.mkdirSync(dir,{recursive:true});
const report={url:process.env.GAME_URL||'http://127.0.0.1:5487/',events:[],errors:[],analyticsAborts:0};
const log=(event,detail={})=>{const v={event,...detail};report.events.push(v);console.log(JSON.stringify(v));fs.writeFileSync(path.join(dir,'qa-multislot.json'),JSON.stringify(report,null,2))};
const browser=await chromium.launch({
 executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']
});
const ctx=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
const page=await ctx.newPage();
page.on('pageerror',e=>report.errors.push('PAGE '+e.message));
page.on('console',m=>{if(m.type()==='error')report.errors.push('CONSOLE '+m.text().slice(0,350))});
page.on('requestfailed',r=>{const u=r.url(),e=r.failure()?.errorText;if(u.includes('/cdn-cgi/rum')&&e==='net::ERR_ABORTED'){report.analyticsAborts++;return;}report.errors.push('NET '+u+' '+e)});
const len=async()=>await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
const slot=async(id)=>await page.evaluate(id=>{
 const a=window.__glade.sceneAutosave.readPresetSlot(id);
 return a?{presetId:a.presetId,time:JSON.parse(a.sceneJSON).scene.env.timeOfDay,
  buildings:JSON.parse(a.sceneJSON).scene.arch.buildings.length}:null
},id);
const select=async(id)=>{await page.locator('.tg-select').selectOption(id);await page.waitForTimeout(1200)};
try{
 const r=await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
 log('boot',{http:r.status(),resetButton:await page.locator('[data-action="reset-preset"]').count(),preset:await page.locator('.tg-select').inputValue()});
 if(r.status()!==200)throw Error('http not 200');
 const baseIsland=await len();
 await page.locator('.tg-time-slider').fill('9.25');
 await page.waitForFunction(()=>window.__glade.sceneAutosave.readPresetSlot('qs3d-island')?.sceneJSON?.includes('"timeOfDay": 9.25'),null,{timeout:17000});
 log('island-saved',{buildings:baseIsland,slot:await slot('qs3d-island')});
 await select('empty-meadow');
 const emptyBefore=await len();
 await page.locator('[data-tool="cottage"]').click();
 let built=false;
 for(const [x,y] of [[820,430],[750,450],[650,420],[900,490]]){
   await page.mouse.click(x,y);
   await page.waitForTimeout(450);
   if(await len()>emptyBefore){built=true;break;}
 }
 if(!built)throw Error('Could not place house with real pointer');
 await page.waitForFunction(expected=>window.__glade.sceneAutosave.readPresetSlot('empty-meadow') &&
   JSON.parse(window.__glade.sceneAutosave.readPresetSlot('empty-meadow').sceneJSON).scene.arch.buildings.length===expected,
   emptyBefore+1,{timeout:22000});
 log('meadow-built',{count:await len(),slot:await slot('empty-meadow')});
 await select('qs3d-island');
 await page.waitForFunction(()=>document.querySelector('.tg-time-readout')?.textContent==='09:15',null,{timeout:25000});
 const keptIsland=await len();
 log('island-restored',{time:await page.locator('.tg-time-readout').innerText(),count:keptIsland});
 if(keptIsland!==baseIsland)throw Error('Island geometry changed unexpectedly');
 await select('empty-meadow');
 await page.waitForFunction(n=>window.__glade.arch.serialize().buildings.length===n,emptyBefore+1,{timeout:24000});
 log('meadow-restored',{count:await len(),slot:await slot('empty-meadow')});
 page.once('dialog',d=>d.dismiss());
 await page.locator('[data-action="reset-preset"]').click();
 if(await len()!==emptyBefore+1)throw Error('Cancel should not erase a building');
 log('reset-cancel-preserves',{buildings:await len()});
 page.once('dialog',d=>d.accept());
 await page.locator('[data-action="reset-preset"]').click();
 await page.waitForFunction(n=>window.__glade.arch.serialize().buildings.length===n,emptyBefore,{timeout:18000});
 const current=await len();
 log('reset-confirm-only-meadow',{count:current,islandSlot:await slot('qs3d-island')});
 await page.waitForFunction(n=>window.__glade.sceneAutosave.readPresetSlot('empty-meadow') &&
 JSON.parse(window.__glade.sceneAutosave.readPresetSlot('empty-meadow').sceneJSON).scene.arch.buildings.length===n,
 emptyBefore,{timeout:24000});
 await page.reload({waitUntil:'domcontentloaded',timeout:80000});
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:120000});
 await page.waitForFunction(()=>document.querySelector('.tg-select')?.value==='empty-meadow',null,{timeout:25000});
 log('reload-after-reset',{preset:await page.locator('.tg-select').inputValue(),count:await len()});
 if(await len()!==emptyBefore)throw Error('Reset meadow should remain empty after reload');
 await select('qs3d-island');
 await page.waitForFunction(()=>document.querySelector('.tg-time-readout')?.textContent==='09:15',null,{timeout:24000});
 log('island-kept-after-other-reset',{time:await page.locator('.tg-time-readout').innerText(),count:await len()});
 report.success=true;
}catch(e){report.failure=String(e.stack||e).slice(0,2000);log('FAILED',{failure:report.failure})}
finally{
 log('final',{success:report.success===true,errorCount:report.errors.length,analyticsAborts:report.analyticsAborts});
 await browser.close();
 if(!report.success||report.errors.length)process.exitCode=1;
}