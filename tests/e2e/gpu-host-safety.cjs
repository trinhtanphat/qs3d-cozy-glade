'use strict';
/**
 * Read-only Windows host health gate for GPU QA.
 * Block stressful GPU runs after unexpected restarts or PCIe WHEA floods.
 */
const { execFileSync } = require('node:child_process');
const MIN_UPTIME_MINUTES=120;
const REBOOT_WINDOW_HOURS=24;
const MAX_WHEA17_PER_HOUR=4;

const WINDOWS_QUERY = [
  "$ErrorActionPreference='Stop'",
  '$now=Get-Date',
  '$null=Get-WinEvent -ListLog System -ErrorAction Stop',
  '$boot=(Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime',
  "$reboots=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=41;StartTime=$now.AddHours(-24)} -ErrorAction SilentlyContinue)",
  "$shutdowns=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=6008;StartTime=$now.AddHours(-24)} -ErrorAction SilentlyContinue)",
  "$pci=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=17;StartTime=$now.AddMinutes(-60)} -ErrorAction SilentlyContinue | Where-Object {$_.ProviderName -eq 'Microsoft-Windows-WHEA-Logger'})",
  '$info=@{',
  "  observedAt=$now.ToString('o')",
  "  bootAt=$boot.ToString('o')",
  '  uptimeMinutes=[math]::Round((New-TimeSpan -Start $boot -End $now).TotalMinutes,1)',
  '  kernelPower41Last24h=$reboots.Count',
  '  eventLog6008Last24h=$shutdowns.Count',
  '  whea17Last60min=$pci.Count',
  "  systemLogReadable=$true",
  '}',
  '$info | ConvertTo-Json -Compress -Depth 3',
].join('\n');

function evaluateHostSafety(evidence) {
  const problems=[];
  if (!evidence || evidence.systemLogReadable !== true) {
    problems.push('Windows System Event Log could not be verified');
  }
  for (const key of ['uptimeMinutes','kernelPower41Last24h','eventLog6008Last24h','whea17Last60min']) {
    if (!Number.isFinite(evidence?.[key]) || evidence[key]<0) {
      problems.push('Missing or invalid host metric: '+key);
    }
  }
  if (Number.isFinite(evidence?.uptimeMinutes) && evidence.uptimeMinutes<MIN_UPTIME_MINUTES) {
    problems.push('Host booted recently ('+evidence.uptimeMinutes+' min; require 120 min)');
  }
  if (Number.isFinite(evidence?.kernelPower41Last24h) && evidence.kernelPower41Last24h>0) {
    problems.push('Kernel-Power 41 in 24h: '+evidence.kernelPower41Last24h);
  }
  if (Number.isFinite(evidence?.eventLog6008Last24h) && evidence.eventLog6008Last24h>0) {
    problems.push('EventLog 6008 in 24h: '+evidence.eventLog6008Last24h);
  }
  if (Number.isFinite(evidence?.whea17Last60min) && evidence.whea17Last60min>MAX_WHEA17_PER_HOUR) {
    problems.push('PCIe WHEA-17 burst in 60 min: '+evidence.whea17Last60min);
  }
  return {
    safe:problems.length===0,
    problems,
    evidence:evidence||null,
    criteria:{noUnexpectedRestartHours:REBOOT_WINDOW_HOURS,
      minimumUptimeMinutes:MIN_UPTIME_MINUTES,maximumWhea17PerHour:MAX_WHEA17_PER_HOUR},
  };
}
function inspectWindowsHost({executor=execFileSync,platform=process.platform}={}) {
  if(platform!=='win32')return evaluateHostSafety(null);
  try {
    const encoded=Buffer.from(WINDOWS_QUERY,'utf16le').toString('base64');
    const stdout=executor('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],
      {encoding:'utf8',timeout:18000,maxBuffer:256*1024,windowsHide:true});
    return evaluateHostSafety(JSON.parse(String(stdout).trim()));
  }catch(error) {
    const failure=evaluateHostSafety(null);
    failure.problems.push('Read-only host check failed: '+String(error?.message||error).slice(0,240));
    return failure;
  }
}
module.exports={evaluateHostSafety,inspectWindowsHost,WINDOWS_QUERY};
