import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { runGuardedGpuSequence } = require('./e2e/gpu-run-safety.cjs');

const safe = () => ({safe: true, problems: [], evidence: {uptimeMinutes: 300}});
const blocked = () => ({safe: false, problems: ['PCIe WHEA-17 burst']});

test('initial host failure blocks every GPU run', async () => {
  let started = 0;
  const checks = [];
  const result = await runGuardedGpuSequence({
    runs: 3, inspectHost: blocked, runOnce: async () => { started++; return true; },
    onCheck: entry => checks.push(entry),
  });
  assert.equal(started, 0);
  assert.equal(result.blocked, true);
  assert.equal(result.completedRuns, 0);
  assert.deepEqual(checks.map(x => [x.stage, x.run]), [['before', 1]]);
});

test('PCIe deterioration detected AFTER first run stops the remaining runs', async () => {
  let inspected = 0;
  let launched = 0;
  const result = await runGuardedGpuSequence({
    runs: 3, inspectHost: () => (++inspected === 1 ? safe() : blocked()),
    runOnce: async () => { launched++; return true; },
  });
  assert.equal(launched, 1);
  assert.equal(result.blocked, true);
  assert.equal(result.stage, 'after');
  assert.equal(result.completedRuns, 1);
});

test('host deterioration BEFORE second run blocks further hardware loads', async () => {
  let inspected = 0;
  const started = [];
  const result = await runGuardedGpuSequence({
    runs: 3, inspectHost: () => (++inspected === 3 ? blocked() : safe()),
    runOnce: async run => { started.push(run); return true; },
  });
  assert.deepEqual(started, [1]);
  assert.equal(result.stage, 'before');
  assert.equal(result.run, 2);
  assert.equal(result.blocked, true);
});

test('three healthy GPU runs require six independent safety samples', async () => {
  const started = [], checks = [];
  const result = await runGuardedGpuSequence({
    runs: 3, inspectHost: safe,
    runOnce: async n => { started.push(n); return true; },
    onCheck: c => checks.push([c.stage, c.run]),
  });
  assert.equal(result.success, true);
  assert.deepEqual(started, [1, 2, 3]);
  assert.deepEqual(checks, [
    ['before', 1], ['after', 1], ['before', 2],
    ['after', 2], ['before', 3], ['after', 3],
  ]);
});

test('invalid or throwing inspections fail closed without opening GPU browser', async () => {
  for (const inspectHost of [() => null, () => ({safe:true}),
    () => {throw new Error('System event log is unavailable');}]) {
    let launched = 0;
    const r = await runGuardedGpuSequence({
      runs: 2, inspectHost, runOnce: async () => {launched++;return true;},
    });
    assert.equal(r.blocked, true);
    assert.equal(launched, 0);
  }
});

test('failed GPU smoke still performs after-run safety inspection, then stops', async () => {
  const checks = [], started = [];
  const result = await runGuardedGpuSequence({
    runs: 3, inspectHost: safe, runOnce: async n => {started.push(n);return false;},
    onCheck: c => checks.push(c.stage),
  });
  assert.deepEqual(started, [1]);
  assert.deepEqual(checks, ['before', 'after']);
  assert.equal(result.blocked, false);
  assert.equal(result.success, false);
});

test('runner wiring records inter-run host checks around GPU smoke', () => {
  const code = readFileSync(new URL('./e2e/hardware-gpu-smoke.cjs', import.meta.url), 'utf8');
  assert.match(code, /runGuardedGpuSequence\(/);
  assert.match(code, /inspectHost:\s*inspectWindowsHost/);
  assert.match(code, /hostSafetyChecks\.push\(entry\)/);
  assert.match(code, /GPU_HOST_SAFETY_BLOCKED/);
  assert.match(code, /NO_GPU_BROWSER_LAUNCHED/);
});
