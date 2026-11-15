import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('./diagnostics/pha-host-incident-readonly.ps1', import.meta.url), 'utf8');
const reader = source.match(/function Read-Events\([\s\S]*?\n}\s*\n/)?.[0];

test('PHA forensic reader distinguishes no matching events from event log failures', () => {
  assert.ok(reader, 'Read-Events function must exist');
  assert.match(reader, /Get-WinEvent -FilterHashtable[^\n]*-ErrorAction Stop/);
  assert.match(reader, /FullyQualifiedErrorId -like 'NoMatchingEventsFound\*'/);
  assert.match(reader, /throw\s*\n/);
  assert.doesNotMatch(reader, /Exception\.Message\s+-match\s+['"]No events were found/);
});

test('all PHA forensic event categories use fail-closed reader', () => {
  for (const id of [41, 6008, 17, 29]) {
    assert.match(source, new RegExp('Read-Events\\s+' + id + '\\s+'));
  }
});

test('PowerShell can parse PHA forensic script without executing hardware probes', { skip: process.platform !== 'win32' }, () => {
  const pathname = fileURLToPath(new URL('./diagnostics/pha-host-incident-readonly.ps1', import.meta.url));
  const command = '$null=$tokens=$errors=$null; [System.Management.Automation.Language.Parser]::ParseFile(\'' +
    pathname.replaceAll("'", "''") + "', [ref]$tokens, [ref]$errors) > $null; if($errors.Count -gt 0){$errors | Out-String; exit 2}";
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 20000
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
