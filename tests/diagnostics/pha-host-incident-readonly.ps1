<#
.SYNOPSIS
  Read-only forensic snapshot for an unstable Windows GPU QA laptop.
.DESCRIPTION
  Does NOT restart Windows, reset networks, change power settings, modify
  drivers, touch BIOS, or launch a GPU workload. The only write is the
  JSON evidence file in OutputDir. No service tags, IPs or MACs collected.
#>
param(
  [string]$OutputDir = 'C:\ProgramData\QS3D\GladeGPUQA\incident-evidence'
)
$ErrorActionPreference = 'Stop'
$now = Get-Date
$os = Get-CimInstance Win32_OperatingSystem
if (-not $os) { throw 'Cannot determine OS boot time' }

function Read-Events([int]$Id, [datetime]$From) {
  try { return @(Get-WinEvent -FilterHashtable @{LogName='System'; Id=$Id; StartTime=$From} -ErrorAction Stop) }
  catch {
    if ($_.Exception.Message -match 'No events were found') { return @() }
    throw
  }
}

$power41 = @(Read-Events 41 $now.AddHours(-48))
$unclean6008 = @(Read-Events 6008 $now.AddHours(-48))
$whea17All = @(Read-Events 17 $now.AddHours(-6) | Where-Object {
  $_.ProviderName -eq 'Microsoft-Windows-WHEA-Logger'
})
$wheaLastHour = @($whea17All | Where-Object {$_.TimeCreated -ge $now.AddHours(-1)})
$wheaLast15m = @($whea17All | Where-Object {$_.TimeCreated -ge $now.AddMinutes(-15)})

$powerEvents = @($power41 | ForEach-Object {
  $entry = $_
  $fields = @{}
  [xml]$eventXml = $entry.ToXml()
  foreach ($data in @($eventXml.Event.EventData.Data)) {
    $fields[[string]$data.Name] = [string]$data.'#text'
  }
  [pscustomobject]@{
    time = $entry.TimeCreated.ToString('o')
    bugcheckCode = $fields['BugcheckCode']
    sleepInProgress = $fields['SleepInProgress']
    bootAppStatus = $fields['BootAppStatus']
  }
})

$wheaExample = if ($whea17All.Count) {
  $recent = $whea17All[0]
  [pscustomobject]@{
    time = $recent.TimeCreated.ToString('o')
    port = if ($recent.Message -match 'Primary Bus:Device:Function:\s*([0-9a-fx:]+)') { $matches[1] } else { 'not parsed' }
    pciDevice = if ($recent.Message -match 'Primary Device Name:\s*(PCI\\[^\r\n]+)') { $matches[1] } else { 'not parsed' }
  }
} else { $null }

$battery = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
$batteryWmi = @(Get-CimInstance -Namespace root\wmi -ClassName BatteryStatus -ErrorAction SilentlyContinue)
$wifi = @(Get-CimInstance Win32_PnPSignedDriver | Where-Object {
  $_.DeviceName -match 'QCA9377'
} | Select-Object DeviceName,DriverVersion,DriverDate,Manufacturer)
$gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,Status)
$net = @(Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,Status,InterfaceDescription,LinkSpeed)
$bios = Get-CimInstance Win32_BIOS
$machine = Get-CimInstance Win32_ComputerSystem

$wer = @()
$werBase = 'C:\ProgramData\Microsoft\Windows\WER\ReportQueue'
foreach ($folder in @(Get-ChildItem $werBase -Directory -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -like 'Kernel_141*'
} | Select-Object -First 8)) {
  $f = Join-Path $folder.FullName 'Report.wer'
  if (-not (Test-Path $f)) { continue }
  $timeLine = Get-Content $f -ErrorAction SilentlyContinue | Where-Object {
    $_ -match '^EventTime='
  } | Select-Object -First 1
  $eventTime = $null
  if ($timeLine) {
    try { $eventTime = [DateTime]::FromFileTimeUtc([long]($timeLine.Substring(10))).ToLocalTime().ToString('o') }
    catch { $eventTime = 'invalid timestamp' }
  }
  $wer += [pscustomobject]@{
    eventType='LiveKernelEvent'
    code='141'
    eventTime=$eventTime
    queueLastWrite=$folder.LastWriteTime.ToString('o')
  }
}

$report = [ordered]@{
  generatedAt = $now.ToString('o')
  machine = [ordered]@{
    manufacturer = $machine.Manufacturer
    model = $machine.Model
    bootTime = $os.LastBootUpTime.ToString('o')
    uptimeMinutes = [math]::Round(($now-$os.LastBootUpTime).TotalMinutes,1)
    freeRamMiB = [math]::Round($os.FreePhysicalMemory/1024,0)
    bios = $bios.SMBIOSBIOSVersion
    biosRelease = $bios.ReleaseDate.ToString('o')
  }
  last48h = [ordered]@{
    kernelPower41 = $power41.Count
    eventLog6008 = $unclean6008.Count
    kernelPowerDetails = $powerEvents
    eventLog6008Times = @($unclean6008 | ForEach-Object {$_.TimeCreated.ToString('o')})
  }
  correctedPcie = [ordered]@{
    whea17Last15Minutes = $wheaLast15m.Count
    whea17Last60Minutes = $wheaLastHour.Count
    whea17Last6Hours = $whea17All.Count
    latestPciError = $wheaExample
  }
  power = [ordered]@{
    plan = [string]((powercfg /getactivescheme) -join ' ')
    sleepSettingsReadOnly = @((powercfg /query SCHEME_CURRENT SUB_SLEEP))
    pcieSettingsReadOnly = @((powercfg /query SCHEME_CURRENT SUB_PCIEXPRESS))
    batteryWin32Count = $battery.Count
    batteryStatusWmi = @($batteryWmi | Select-Object PowerOnline,Charging,Discharging,RemainingCapacity)
    note = 'Windows battery WMI fields alone do not establish physical adapter or battery condition.'
  }
  networkAdapters = $net
  wifiDriver = $wifi
  gpuDriver = $gpu
  wer141 = $wer
  evidenceScope = 'Read only, no user data or secrets, no power/network/GPU configuration changes.'
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$filename = 'pha-incident-' + $now.ToString('yyyyMMdd-HHmmss') + '.json'
$dest = Join-Path $OutputDir $filename
$json = $report | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText($dest, $json, [Text.UTF8Encoding]::new($false))
$sha = (Get-FileHash $dest -Algorithm SHA256).Hash
Write-Output ('EVIDENCE_PATH=' + $dest)
Write-Output ('EVIDENCE_SHA256=' + $sha)
Write-Output ('KERNEL41_48H=' + $power41.Count)
Write-Output ('EVENT6008_48H=' + $unclean6008.Count)
Write-Output ('WHEA17_60M=' + $wheaLastHour.Count)
Write-Output ('BATTERY_WIN32_COUNT=' + $battery.Count)
Write-Output ('WER_141_RECORDS=' + $wer.Count)
