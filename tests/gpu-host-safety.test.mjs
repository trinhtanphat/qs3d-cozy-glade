import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateHostSafety, inspectWindowsHost, WINDOWS_QUERY } = require('./e2e/gpu-host-safety.cjs');

const healthy = () => ({
  systemLogReadable: true,
  observedAt: '2026-11-14T21:00:00+07:00',
  bootAt: '2026-11-13T09:00:00+07:00',
  uptimeMinutes: 2160,
  kernelPower41Last24h: 0,
  eventLog6008Last24h: 0,
  whea17Last60min: 0,
});

test('healthy host passes with no recent crash or PCIe burst', () => {
  const result = evaluateHostSafety(healthy());
  assert.equal(result.safe, true);
  assert.deepEqual(result.problems, []);
});

test('recent unexpected reboots and WHEA storm block all GPU launches', () => {
  const bad = { ...healthy(), uptimeMinutes: 3,
    kernelPower41Last24h: 5, eventLog6008Last24h: 5, whea17Last60min: 50 };
  const result = evaluateHostSafety(bad);
  assert.equal(result.safe, false);
  assert.equal(result.problems.length, 4);
  assert.match(result.problems.join(' / '), /PCIe WHEA-17 burst/);
  assert.match(result.problems.join(' / '), /Kernel-Power 41/);
});

test('single unexpected shutdown is not hidden by a clean-looking uptime', () => {
  const result = evaluateHostSafety({ ...healthy(), eventLog6008Last24h: 1 });
  assert.equal(result.safe, false);
  assert.ok(result.problems.some((p) => p.includes('EventLog 6008')));
});

test('frequent corrected PCIe errors block test even with no reboot', () => {
  assert.equal(evaluateHostSafety({...healthy(), whea17Last60min: 4}).safe, true);
  assert.equal(evaluateHostSafety({...healthy(), whea17Last60min: 5}).safe, false);
});

test('two-hour boot minimum must be met before GPU stress', () => {
  assert.equal(evaluateHostSafety({...healthy(), uptimeMinutes: 119.9}).safe, false);
  assert.equal(evaluateHostSafety({...healthy(), uptimeMinutes: 120}).safe, true);
});

test('invalid or unavailable Windows event evidence fails closed', () => {
  assert.equal(evaluateHostSafety(null).safe, false);
  assert.equal(evaluateHostSafety({...healthy(), whea17Last60min: undefined}).safe, false);
  assert.equal(evaluateHostSafety({...healthy(), systemLogReadable:false}).safe, false);
  assert.equal(evaluateHostSafety({...healthy(), kernelPower41Last24h:-1}).safe, false);
});

test('Windows PowerShell inspector is read only, bounded, and checks full evidence', () => {
  let called=false;
  const result = inspectWindowsHost({
    platform:'win32',
    executor:(exe,args,opts)=>{
      called=true;
      assert.equal(exe,'powershell.exe');
      assert.ok(args.includes('-EncodedCommand'));
      assert.ok(opts.timeout<=18000);
      assert.equal(opts.windowsHide,true);
      const encoded=args.at(-1);
      const script=Buffer.from(encoded,'base64').toString('utf16le');
      assert.equal(script,WINDOWS_QUERY);
      assert.match(script,/Get-WinEvent/);
      assert.match(script,/Get-CimInstance/);
      assert.doesNotMatch(script,/Set-Item|Set-NetAdapter|Disable-NetAdapter|Restart-Computer|Stop-Process|Set-ExecutionPolicy/);
      return JSON.stringify(healthy());
    },
  });
  assert.equal(called,true);
  assert.equal(result.safe,true);
});

test('inspector rejects unreachable platform and shell/event-log errors', () => {
  assert.equal(inspectWindowsHost({platform:'linux'}).safe,false);
  const result = inspectWindowsHost({
    platform:'win32',
    executor:()=>{throw Error('Event log inaccessible')},
  });
  assert.equal(result.safe,false);
  assert.match(result.problems.join(' '),/Read-only host check failed/);
});
