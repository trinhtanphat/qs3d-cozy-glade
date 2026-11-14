import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const resultDir = process.env.QA_RESULTS_DIR || process.cwd();
fs.mkdirSync(resultDir, { recursive: true });
const url = process.env.GAME_URL || 'http://127.0.0.1:5487/';
const report = {url, steps:[], errors:[], analyticsAborts:0};
const log = (name,detail={}) => {
 const s={name,...detail};report.steps.push(s);console.log(JSON.stringify(s));
 fs.writeFileSync(path.join(resultDir,'qa-scene-library.json'),JSON.stringify(report,null,2));
};
const cdp = Boolean(process.env.CHROME_CDP_URL);
const browser = cdp
 ? await chromium.connectOverCDP(process.env.CHROME_CDP_URL)
 : await chromium.launch({executablePath:process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless:true,args:['--no-sandbox','--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
let ctx;
try {
 ctx=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true});
 const page=await ctx.newPage();
 page.on('pageerror',e=>report.errors.push('PAGE '+e.message));
 page.on('console',m=>{if(m.type()==='error')report.errors.push('CONSOLE '+m.text().slice(0,250))});
 page.on('requestfailed',r=>{
  const error=r.failure()?.errorText;
  if(r.url().includes('/cdn-cgi/rum')&&error==='net::ERR_ABORTED') {report.analyticsAborts++;return}
  report.errors.push('REQUEST '+r.url()+' '+error)
 });
 const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:80000});
 await page.waitForFunction(()=>!!window.__glade && document.querySelector('#loading-overlay')?.classList.contains('is-hidden'),null,{timeout:100000});
 const button=page.locator('[data-action="library"]');
 if(await button.count()!==1)throw Error('Library toolbar button missing');
 log('boot',{http:r.status(),libraryButton:true,preset:await page.locator('.tg-select').inputValue()});

 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForTimeout(1200);
 const count0=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 await page.locator('[data-tool="cottage"]').click();
 let made=false;
 for(const pt of [[810,415],[750,450],[890,455]]){
  await page.mouse.click(...pt);
  await page.waitForTimeout(390);
  if(await page.evaluate(()=>window.__glade.arch.serialize().buildings.length)>count0){made=true;break}
 }
 if(!made)throw Error('Could not build a house in meadow');
 const count1=await page.evaluate(()=>window.__glade.arch.serialize().buildings.length);
 log('built-meadow',{before:count0,after:count1});
 await page.locator('.tg-select').selectOption('qs3d-island');
 await page.waitForTimeout(500);
 await page.locator('.tg-time-slider').fill('8.25');
 await button.click();
 await page.locator('#tg-scene-library').waitFor({state:'visible',timeout:11000});
 const cards=await page.locator('.tg-library-item').count();
 if(cards!==5)throw Error('Expected 5 map cards, got '+cards);
 const info=await page.locator('.tg-library-summary').innerText();
 log('library-open',{cards,summary:info});
 const dlPromise=page.waitForEvent('download',{timeout:30000});
 await page.locator('[data-action="library-export"]').click();
 const dl=await dlPromise;
 const file=path.join(resultDir,'scene-library-backup.json');
 await dl.saveAs(file);
 const archive=JSON.parse(fs.readFileSync(file,'utf8'));
 if(archive.scenes.length!==2 || archive.activePresetId!=='qs3d-island')throw Error('Archive map count or active preset wrong');
 const island=JSON.parse(archive.scenes.find(s=>s.presetId==='qs3d-island').sceneJSON).scene;
 const meadow=JSON.parse(archive.scenes.find(s=>s.presetId==='empty-meadow').sceneJSON).scene;
 if(island.env.timeOfDay!==8.25||meadow.arch.buildings.length!==count1)throw Error('Archive missed live or stored edits');
 log('export-all',{filesize:fs.statSync(file).size,mapCount:archive.scenes.length,time:island.env.timeOfDay,meadowCount:meadow.arch.buildings.length});

 await page.locator('[data-action="library-close"]').click();
 await page.locator('.tg-time-slider').fill('22.25');
 await page.waitForFunction(()=>window.__glade.sceneAutosave.readPresetSlot('qs3d-island')?.sceneJSON?.includes('"timeOfDay": 22.25'),null,{timeout:22000});
 await button.click();
 page.once('dialog',d=>d.accept());
 await page.locator('#tg-scene-library input[type="file"]').setInputFiles(file);
 await page.waitForFunction(()=>document.querySelector('.tg-time-readout')?.textContent==='08:15',null,{timeout:115000});
 const restoredTime=await page.locator('.tg-time-readout').innerText();
 await page.locator('.tg-select').selectOption('empty-meadow');
 await page.waitForFunction(n=>window.__glade.arch.serialize().buildings.length===n,count1,{timeout:28000});
 log('restore-all',{time:restoredTime,meadowAfter:await page.evaluate(()=>window.__glade.arch.serialize().buildings.length)});

 // A malformed package must not mutate localStorage or reload the game.
 await page.waitForFunction(()=>!window.__glade.sceneAutosave.pending,null,{timeout:20000});
 const beforeBad=await page.evaluate(()=>localStorage.getItem('qs3d-cozy-glade:scene-autosave-v1'));
 await button.click();
 const invalid=path.join(resultDir,'invalid-library.json');
 fs.writeFileSync(invalid,'{"format":"qs3d-cozy-glade-library","version":3,"scenes":[]}', 'utf8');
 await page.locator('#tg-scene-library input[type="file"]').setInputFiles(invalid);
 await page.locator('.tg-library-status.is-error').waitFor({state:'visible',timeout:12000});
 const afterBad=await page.evaluate(()=>localStorage.getItem('qs3d-cozy-glade:scene-autosave-v1'));
 if(beforeBad!==afterBad)throw Error('Rejected backup mutated user saves');
 log('reject-invalid',{status:await page.locator('.tg-library-status').innerText()});

 await page.setViewportSize({width:390,height:844});
 const fit=await page.evaluate(()=>{
  const modal=document.querySelector('#tg-scene-library .tg-library-panel').getBoundingClientRect();
  return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,
   panelLeft:modal.left,panelRight:modal.right,
   panelVisible:modal.left>=0&&modal.right<=innerWidth+1};
 });
 if(!fit.panelVisible||fit.documentWidth>fit.width)throw Error('Library overlay overflows narrow viewport');
 log('narrow-screen-library',{...fit});
 await page.locator('[data-action="library-close"]').click();
 await button.scrollIntoViewIfNeeded();
 await button.click({timeout:12000});
 await page.locator('#tg-scene-library').waitFor({state:'visible',timeout:12000});
 await page.screenshot({path:path.join(resultDir,'scene-library-mobile.jpg'),type:'jpeg',quality:78});
 log('narrow-screen-button-reopen',{opened:true});
 report.success=true;
}catch(e){report.failure=String(e.stack||e).slice(0,2100);log('FAILED',{failure:report.failure})}
finally{
 try{await ctx?.close()}catch{}
 if(!cdp)try{await browser.close()}catch{}
 log('final',{success:!!report.success,errorCount:report.errors.length});
 if(!report.success||report.errors.length)process.exitCode=1;
}
