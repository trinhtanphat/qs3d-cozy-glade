# PHA laptop reboot incident — physical recovery runbook

Updated 14 November 2026. Applies to DESKTOP-PHA1S90 (Dell Inspiron 3476), a separate Intel UHD 620 GPU QA machine. This is not a production Glade deployment procedure.

## Current established facts

- Windows System recorded at least seven unclean restarts within 48 hours: 13 Nov ~06:15 and 17:41; 14 Nov ~06:03, 14:20, 15:33, 17:04 and 20:11 (Vietnam time).
- The most recent Kernel-Power Event 41 had BugcheckCode 0 and no fresh conventional C:\Windows\Minidump file was found for 14 Nov. These facts do not determine the cause.
- Repeated corrected PCIe WHEA 17 entries identify Intel root port 0:1C:5 (VEN_8086 DEV_9D15), PnP path PCIROOT(0)#PCI(1C05). Windows mapped Qualcomm QCA9377 Wi-Fi NIC downstream at PCIROOT(0)#PCI(1C05)#PCI(0000). At one point 136 WHEA 17 in a preceding hour were counted.
- Wi-Fi remained Up at 390 Mbps; Ethernet was Disconnected. Tailscale over the same Wi-Fi NIC is not a physically independent recovery path. Do not disable or reset the Wi-Fi adapter remotely.
- Dell BIOS 1.16.0 (December 2021), Intel UHD 620 driver 31.0.101.2141, Qualcomm QCA9377 Wi-Fi driver 12.0.0.1118 (May 2021). No driver update attempted.
- High performance plan already has automatic Sleep Never, automatic Hibernate Never and PCIe Link State Power Management Off on AC and DC. Blindly setting these values again is not a fix.
- Win32_Battery returned no instance. root/wmi BatteryStatus showed PowerOnline=false and RemainingCapacity=0. These telemetry fields do not conclusively identify physical adapter or battery condition.
- Two queued WER LiveKernelEvent 141 reports were last written on 14 Nov at 20:15, but their actual Windows FILETIME event dates were 07 Nov at 14:28 and 15:45. They document earlier display-engine timeouts, not fresh failures on 14 Nov.
- Public Cozy Glade on WIN11-181 remains independent of PHA and was healthy at Git main bc5a38e.

## Ordered physical troubleshooting — only with onsite access or proven alternate wired recovery

1. Protect data and connectivity first. Obtain an OS/file backup and a working Ethernet or out-of-band console before any action that might interrupt Wi-Fi.
2. Examine the power path: genuine Dell adapter with correct wattage, power cable, DC jack and wall outlet. In BIOS (F2) check AC adapter wattage identification and physical battery health. A laptop without a working battery can drop instantly on an AC interruption, but missing WMI battery data alone is not proof of this.
3. Have an onsite technician run Dell F12 preboot adapter/battery and memory diagnostics where supported. If adapter is shown as Unknown, swap with a known-good compatible Dell charger and inspect DC-in rather than flash firmware blindly.
4. Inspect the QCA9377 Wi-Fi card, PCIe slot/contacts and cables with the laptop properly shut down onsite, only after a separate remote access path has been verified. WHEA 17 points to that link but does not prove it caused system-wide reboot.
5. Review model-specific BIOS and driver updates only after power is stable and with a physical recovery plan. Never flash BIOS on uncertain power or over an unstable Wi-Fi-only remote connection.
6. Validate stability first: 24 hours without Kernel-Power 41 / EventLog 6008, 120+ minutes uptime, and at most four WHEA 17 events/hour; the automated GPU safety gate refuses to launch hardware workloads until these conditions are met.
7. Then perform 3/3 short GPU D3D11 hardware smoke with the conservative Chrome configuration and collect evidence, followed by a bounded extended QA when stable. Physical Android/iOS testing and many-hour endurance require independent evidence.

## Portable read-only forensic snapshot

Run on a dedicated PowerShell session, from the repository checkout:

    powershell.exe -NoProfile -File .\tests\diagnostics\pha-host-incident-readonly.ps1 -OutputDir C:\ProgramData\QS3D\GladeGPUQA\incident-evidence

The script only reads boot time, selected Windows Event Log records, driver versions, existing power settings, battery telemetry and WER code-141 actual event timestamps. It creates a timestamped JSON file and SHA-256 evidence record. It does not collect Service Tags, IP addresses or MACs and does not alter hardware or Windows configurations.

## Sources

- Microsoft VIDEO_ENGINE_TIMEOUT_DETECTED (0x141): https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-0x141---video-engine-timeout-detected
- Dell AC adapter and battery power troubleshooting: https://www.dell.com/support/kbdoc/en-us/000141424/
- Open project incident: https://github.com/trinhtanphat/qs3d-cozy-glade/issues/17

Keep hardware issue #17 open until actual root cause and stability are independently verified.
