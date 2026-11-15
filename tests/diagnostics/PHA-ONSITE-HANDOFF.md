# PHA — onsite recovery and hardware acceptance handoff

**Prepared 15 Nov 2026 ~09:45 Asia/Ho_Chi_Minh.** Scope: dedicated Dell Inspiron 14 3476 / Windows `DESKTOP-PHA1S90` used for Cozy Glade Intel UHD 620 WebGL2 GPU QA. Incident: [#17](https://github.com/trinhtanphat/qs3d-cozy-glade/issues/17). The instructions below require a **human physically present at this computer**. They are not an authorization to issue a remote restart or firmware update.

## 1. Current evidence (read-only, no diagnosis inferred)

| Observation | Evidence |
| --- | --- |
| Last observed reboot | Windows boot **15 Nov 2026 09:28:01 VN**. Kernel-Power 41 at **09:28:11**; EventLog 6008 at **09:28:33** |
| Event storm at 09:43 VN | **8** Kernel-Power41 / 24h, **7** EventLog6008 / 24h, **314** corrected WHEA17 / rolling 60m |
| Recent Event41 fields | `BugcheckCode=0`, `PowerButtonTimestamp=0`, `SleepInProgress=0`; these do not prove a particular power fault |
| PCIe link | WHEA17: Intel root port **0:1C:5**, `PCI\\VEN_8086&DEV_9D15`, connected downstream to Qualcomm QCA9377 according to prior PnP tree |
| CPU firmware | Kernel-Processor-Power **Event37** at **06:15:47, 07:03:34, 08:47:03, 09:29:26 VN**: firmware limited CPU speed, 71 seconds since prior report; this is **not proof** of the cause |
| Battery telemetry | `Win32_Battery` no instance; `root\\wmi BatteryStatus`: PowerOnline=False, Charging=False, RemainingCapacity=0. Do not treat this alone as failed physical power |
| Remote-access risk | Qualcomm Wi-Fi **Up 390 Mbps**, Ethernet **Disconnected**; Tailscale traverses Wi-Fi, **not** an independent rescue link |
| System build | BIOS **1.16.0**, Intel UHD 620 driver **31.0.101.2141**; Fast Startup disabled, `HiberbootEnabled=0` |
| Windows event-time caution | Event6008 logged at 09:28:33 claims previous shutdown **08:46:05** despite later System WHEA events around **09:16**. Do **not** regard the embedded “previous shutdown at” text as a verified physical power-off time. Cross-check Kernel-General boot times, local clock and independent observations |
| Clock check | Windows time zone `SE Asia Standard Time`; NTP initially had DNS-resolution errors at 09:28:37, but `w32tm /query /status` later reported successful `time.google.com` synchronization at **09:44:35**. These logs alone do not establish a reboot cause |

CPU throttling plus power uncertainty makes correct Dell adapter detection an **early diagnostic priority**, not a reason to blindly replace parts. Persistent WHEA17 likewise justifies checking the QCA9377/PCIe link, but does not establish that Wi-Fi is the cause of full-system resets.

## 2. Technician onsite checklist

- [ ] Before touching hardware, confirm ownership/permission, save active work, inspect for visibly swollen battery/heat/smell or damaged cabling. Do not operate or handle a swollen/damaged battery; stop and use a qualified service provider.
- [ ] Provide a **working Ethernet cable/link and verified independent remote rescue path** (or on-site console) before attempting any change to the Qualcomm Wi-Fi adapter, BIOS, PCIe parts or power circuitry. Record whether Ethernet obtains a link. Avoid disturbing the existing Wi-Fi-only connection until a recovery path exists.
- [ ] With reliable power and a person at the keyboard, open BIOS setup using **F2 during Dell startup**. For this pre-2021 model, inspect **General → Battery Information** (or the equivalent menu). Record (without publishing serial/service tag) **AC Adapter Type / wattage**, whether **Unknown**, **Battery Health**, and any charging warning. Do not flash BIOS at this stage.
- [ ] Inspect external OEM-compatible adapter (label wattage/voltage), cable, DC plug and jack, wall outlet/power strip, and battery condition. If BIOS reports **Unknown** adapter, test a known-good correct compatible Dell charger and inspect the DC-in connection before considering firmware changes. Only competent personnel should service internal power connections.
- [ ] Observe Dell power/battery status LED pattern or beep/diagnostic code. Record exact pattern, e.g. amber/white counts, without guessing its meaning; interpret against the model manual.
- [ ] From the Dell startup logo, press **F12 → Diagnostics**. Run supported **ePSA** adapter/battery and memory/board tests under onsite supervision. Record **exact error code, validation number, component and timestamp** for any failure. If necessary select individual tests within ePSA. Do not leave the unstable machine running a prolonged stress loop.
- [ ] Only after power is stable and rescue access is verified, assess downstream **QCA9377** card, PCIe root-port/slot/contacts/antennas under safe shutdown procedures. Record whether WHEA17 persists after a controlled component/connection remediation. No remote disable/reset of Wi-Fi.
- [ ] If any firmware/BIOS change is considered, require verified good AC power, physical recovery plan, backups, exact model-compatible firmware and successful earlier diagnostics. **Do not flash BIOS to “see if it helps.”**

### Fill in after physical work

| Required field | Observed value / photo or evidence reference |
| --- | --- |
| Technician / local inspection time | _Pending_ |
| Ethernet or out-of-band fallback verified | _Pending_ |
| OEM-compatible adapter label / wattage | _Pending_ |
| BIOS recognized AC Adapter Type / wattage | _Pending_ |
| BIOS battery presence / health | _Pending_ |
| Charging LED / diagnostic blink codes | _Pending_ |
| Dell ePSA result / error code / validation number | _Pending_ |
| DC jack / plug / battery findings | _Pending_ |
| PCIe QCA9377 / root port findings | _Pending_ |
| Actual corrective action and changed part | _Pending_ |

Do not publish serial numbers, Service Tags, MAC/IP addresses, personal user data, screenshots with private identifiers, credentials or secrets in a public GitHub issue.

## 3. Post-repair acceptance — no shortcuts

Only after physical repair and verified independent recovery:

1. Reboot **once under onsite control only if required**, collect a baseline read-only snapshot with `tests/diagnostics/pha-host-incident-readonly.ps1`; do not use the previous snapshots as evidence of a repaired host.
2. Observe a **continuous 24-hour window** with **zero** Windows System Kernel-Power41 and EventLog6008, and **at least 120 minutes uptime**. Event log queries must succeed; an unreadable log is a failure, not a clean zero.
3. Verify the rolling **WHEA-Logger Event17 ≤ 4 in 60 minutes** and no new unexplained reset. Keep physical observations and the 24-hour snapshot as evidence.
4. Only then, on the repaired **physical Intel UHD 620**, run the built-in **three bounded WebGL2 D3D11 smoke runs** (no SwiftShader/software fallback). GitHub `main` contains a host-safety gate before and after every run; any unhealthy check aborts the sequence.
5. Attach the actual **3/3 GPU results**, evidence SHA-256, and the technician's redacted notes to issue #17. Close the issue only after independent acceptance. Software test counts on WIN11-181 do **not** replace physical GPU acceptance.

**Status at handoff: `HARDWARE_BLOCKED`.** Current production at `https://glade.qs3d.site/` remains independent of PHA. Do not deploy game changes or alter production infrastructure as part of this repair.

## Official references

- Dell Inspiron 14 3476 [service manual / diagnostics](https://www.dell.com/support/manuals/en-us/inspiron-14-3476-laptop/inspiron-14-3476-servicemanual/diagnostics?guid=guid-30c82063-87f8-4011-baff-2cd2726286dd&lang=en-us)
- Dell Inspiron 14 3476 [running ePSA — F12 → Diagnostics](https://www.dell.com/support/manuals/en-th/inspiron-14-3476-laptop/inspiron-14-3476-servicemanual/running-the-epsa-diagnostics?guid=guid-0b893eed-efbc-4831-a9c4-7298a7a9f619&lang=en-us)
- Dell [AC adapter identification and Battery Information in BIOS](https://www.dell.com/support/kbdoc/en-us/000141424/troubleshooting-power-issues-on-a-latitude-pc-with-the-ac-adapter-led-off-or-flickering?lang=en)
- Microsoft [unexpected reboot, Event41 troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/event-id-41-restart)
- Microsoft [Kernel-Processor-Power Event37](https://learn.microsoft.com/en-us/troubleshoot/windows-server/setup-upgrade-and-drivers/event-id-37-windows-kernel-processor-power) (Windows Server example; firmware throttle warning semantics, not a diagnosis of this Dell laptop)
