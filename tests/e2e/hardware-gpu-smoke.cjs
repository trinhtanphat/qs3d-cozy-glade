'use strict';
/**
 * Hardware WebGL2 smoke — execute locally on a dedicated GPU QA computer.
 * Never launches GitHub Actions, writes production data or closes shared tabs.
 * Usage (Windows PowerShell):
 *   $env:GAME_URL='https://glade.qs3d.site/'
 *   $env:GPU_RENDERER='Intel.*D3D11'
 *   $env:GPU_RUNS='2'
 *   npm run test:e2e:gpu
 */
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const { inspectWindowsHost } = require('./gpu-host-safety.cjs');

const url = process.env.GAME_URL || 'https://glade.qs3d.site/';
const chromeBin = process.env.CHROME_BIN ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const dest = process.env.QA_RESULTS_DIR || process.cwd();
const runs = Math.max(1, Math.min(3, Number(process.env.GPU_RUNS) || 1));
const minFps = Math.max(1, Number(process.env.GPU_MIN_FPS) || 15);
const rendererPattern = process.env.GPU_RENDERER || 'Intel.*D3D11';
const readinessTimeout = Math.max(20000, Math.min(120000, Number(process.env.GPU_READY_TIMEOUT_MS) || 85000));
fs.mkdirSync(dest, { recursive: true });
const report = {
  testedAt: new Date().toISOString(),
  url, rendererPattern, minFps, readinessTimeout,
  runs: [], success: false, note: 'Local GPU-only acceptance, not a physical phone or browser compatibility certification.',
};
const output = path.join(dest, 'gpu-hardware-smoke.json');
const write = () => fs.writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
const unsafe = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;

async function runOnce(number) {
  const item = { run: number, startedAt: new Date().toISOString(), errors: [], networkFailures: [] };
  report.runs.push(item);
  write();
  let browser, context;
  try {
    browser = await chromium.launch({
      executablePath: chromeBin, headless: true, timeout: 35000,
      // Avoid forced driver/blocklist overrides: Intel UHD 620 D3D11
      // passed repeated hardware QA with these conservative Chrome flags.
      // Strict hardware verification below rejects any software fallback.
      args: ['--no-sandbox', '--enable-gpu', '--use-gl=angle', '--use-angle=d3d11'],
    });
    context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    page.on('pageerror', error => item.errors.push('PAGE ' + error.message));
    page.on('crash', () => item.errors.push('PAGE_CRASH'));
    page.on('console', message => {
      if (message.type() === 'error' && item.errors.length < 20) {
        item.errors.push('CONSOLE ' + message.text().slice(0, 400));
      }
    });
    page.on('requestfailed', request => {
      if (!request.url().includes('/cdn-cgi/rum') && item.networkFailures.length < 10) {
        item.networkFailures.push(request.url() + ': ' + request.failure()?.errorText);
      }
    });
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 75000 });
    item.http = response?.status();
    if (item.http !== 200) throw Error('Game HTTP response is not 200: ' + item.http);

    try {
      await page.waitForFunction(
        () => (!!window.__glade && document.getElementById('loading-overlay')?.classList.contains('is-hidden')) ||
          document.getElementById('loading-overlay')?.classList.contains('has-error'),
        null, { timeout: readinessTimeout }
      );
    } catch (error) {
      item.readinessDiagnostic = await page.evaluate(() => ({
        loaded: !!window.__glade,
        loader: document.getElementById('loading-overlay')?.className,
        loadingText: document.getElementById('loading-status')?.textContent,
      })).catch(() => ({ evaluationFailed: true }));
      throw Error('Scene did not become ready: ' + error.message);
    }

    if (await page.evaluate(() => document.getElementById('loading-overlay')?.classList.contains('has-error'))) {
      const message = await page.evaluate(() => document.getElementById('loading-status')?.textContent);
      throw Error('Game initialization failed: ' + (message || 'Unknown WebGL2 context failure'));
    }
    item.before = await page.evaluate(() => {
      const canvas = document.getElementById('glade-canvas');
      const gl = canvas?.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
      const g = window.__glade;
      return {
        webgl2: !!gl, hardwareRenderer: renderer,
        canvas: [canvas?.width || 0, canvas?.height || 0],
        quality: g?.pipeline?.getStats?.() || null,
      };
    });
    if (!item.before.webgl2) throw Error('WebGL2 context not available');
    if (!item.before.hardwareRenderer) throw Error('Hardware renderer identity not exposed; cannot certify hardware path');
    if (unsafe.test(item.before.hardwareRenderer)) throw Error('Software renderer cannot satisfy hardware acceptance');
    if (!(new RegExp(rendererPattern, 'i')).test(item.before.hardwareRenderer)) {
      throw Error('Renderer does not match required hardware: ' + item.before.hardwareRenderer);
    }
    await page.evaluate(() => {
      const g = window.__glade;
      g.adaptiveQuality?.manualOverride?.();
      g.pipeline.setQuality('eco');
      g.world.setQuality('eco');
      g.hud.setQuality('eco');
    });
    await page.waitForTimeout(6000);
    item.after = await page.evaluate(() => {
      const g = window.__glade, stats = g.pipeline.getStats();
      return {
        stats, fpsText: document.querySelector('.tg-perf-readout')?.textContent,
        grassCount: g.world.foliage?.grassMesh?.count,
        dpr: g.pipeline.renderer.getPixelRatio(),
      };
    });
    const stats = item.after.stats;
    if (!stats || !Number.isFinite(stats.fps) || stats.fps < minFps) {
      throw Error('Hardware FPS below configured smoke threshold ' + minFps + ': ' + stats?.fps);
    }
    if (!Number.isFinite(stats.drawCalls) || stats.drawCalls < 1 ||
        !Number.isFinite(stats.triangles) || stats.triangles < 1) {
      throw Error('No hardware scene geometry drawn');
    }
    if (stats.quality !== 'eco') throw Error('Eco graphics preset did not activate');
    if (item.errors.some(e => e.startsWith('PAGE ') || e === 'PAGE_CRASH')) {
      throw Error('Application exception or browser crash during GPU test');
    }
    item.success = true;
  } catch (error) {
    item.success = false;
    item.failure = String(error?.stack || error).slice(0,1200);
  } finally {
    try { await context?.close(); } catch {}
    try { await browser?.close(); } catch {}
    item.finishedAt = new Date().toISOString();
    write();
    console.log(JSON.stringify({
      run: item.run, success: item.success, http: item.http,
      renderer: item.before?.hardwareRenderer,
      fps: item.after?.stats?.fps,
      drawCalls: item.after?.stats?.drawCalls,
      failure: item.failure,
    }));
  }
  return item.success;
}

(async () => {
  // Strictly read-only preflight. Do not launch Chrome on an unstable host.
  const hostSafety = inspectWindowsHost();
  report.hostSafety = hostSafety;
  if (!hostSafety.safe) {
    report.failure = 'GPU test blocked for host safety: ' + hostSafety.problems.join('; ');
    write();
    console.error('GPU_HOST_PREFLIGHT_BLOCKED: ' + report.failure);
    console.error('NO_GPU_BROWSER_LAUNCHED REPORT=' + output);
    process.exitCode = 3;
    return;
  }
  let pass = true;
  for (let i = 1; i <= runs; i++) {
    if (!(await runOnce(i))) pass = false;
  }
  report.success = pass;
  write();
  console.log('GPU_HARDWARE_ACCEPTANCE=' + (pass ? 'PASS' : 'FAIL') +
    ' RUNS=' + runs + ' REPORT=' + output);
  if (!pass) process.exitCode = 1;
})().catch(error => {
  report.failure = String(error?.stack || error).slice(0,1200);
  report.success = false;
  write();
  console.error(report.failure);
  process.exitCode = 2;
});
