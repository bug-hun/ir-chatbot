# IR Playbook Bot - Demo Conversation

This demonstrates a typical incident response workflow using the Slack bot.

---

## Scenario: Suspicious Process Detected on VM1

### 1. Check System Status

**User types:** `/ir status vm1`

**Bot responds:**
```
System Status: DESKTOP-T6U68JB (192.168.1.33)

QUARANTINE STATUS
Status: Not Quarantined
Evidence: None

SYSTEM INFO
Hostname: DESKTOP-T6U68JB
Domain: WORKGROUP
Current User: IRAdmin
OS: Microsoft Windows 11 Pro
Architecture: AMD64
Last Boot: 12/25/2024 10:30:00 AM

RUNNING PROCESSES (42 total)
PID     Name                    Owner                   Path
1234    chrome.exe              DESKTOP-T6U68JB\User    C:\Program Files\Google\...
5678    suspicious.exe          DESKTOP-T6U68JB\User    C:\Users\User\AppData\...
...

NETWORK CONNECTIONS (15 total)
Local              Remote              State        Process
192.168.1.33:443   52.84.123.45:443    Established  chrome.exe
192.168.1.33:8080  185.123.45.67:443   Established  suspicious.exe
...

LOCAL ADMINISTRATORS
- DESKTOP-T6U68JB\Administrator (User)
- DESKTOP-T6U68JB\IRAdmin (User)
```

### 2. Quarantine the Host

**User types:** `/ir quarantine vm1`

**Bot responds:**
```
Quarantine Confirmation

Target: vm1 (192.168.1.33)
Action: Network isolation - blocks all outbound traffic except management IPs

[Confirm Quarantine] [Cancel]
```

**User clicks:** `[Confirm Quarantine]`

**Bot responds:**
```
Quarantine Result: vm1

Status: Isolated
Hostname: DESKTOP-T6U68JB
Firewall Rules: 3 IR-ISOLATION rules created
Profiles Modified: Domain, Private, Public (outbound BLOCKED)

What would you like to do next?
[Release Quarantine] [Collect Logs] [View Status]
```

### 3. Collect Forensic Logs

**User clicks:** `[Collect Logs]` (or types `/ir collect vm1`)

**Bot responds:**
```
Collecting logs from vm1... (this may take a minute)
```

Then:
```
Log Collection Result: vm1

Path: C:\IR\Logs\DESKTOP-T6U68JB_20241225_143052.zip
Events Collected: 598
Size: 4.69 MB
Logs Downloaded To: collected-logs/INC-20241225-143045_DESKTOP-T6U68JB_20241225_143052.zip
```

### 4. Kill Suspicious Process

**User types:** `/ir kill vm1 5678`

**Bot responds:**
```
Process Termination Result: vm1

Status: Terminated
Process ID: 5678
Process Name: suspicious.exe
Message: Process terminated successfully
```

### 5. Check Status Again (While Quarantined)

**User clicks:** `[View Status]` (or types `/ir status vm1`)

**Bot responds:**
```
System Status: DESKTOP-T6U68JB (192.168.1.33)

QUARANTINE STATUS
Status: QUARANTINED
Evidence:
- IR-ISOLATION firewall rules found: 3 rules
- Outbound traffic BLOCKED on: Domain, Private, Public

Firewall Rules:
- IR-ISOLATION-BLOCK-OUT (Enabled, Outbound, Block)
- IR-ISOLATION-ALLOW-MGMT (Enabled, Outbound, Allow)
- IR-ISOLATION-ALLOW-LOCAL (Enabled, Outbound, Allow)

[Release Quarantine] [Collect Logs]
...
```

### 6. Release Quarantine

**User clicks:** `[Release Quarantine]` (or types `/ir release vm1`)

**Bot responds:**
```
Release Confirmation

Target: vm1 (192.168.1.33)
Action: Remove network isolation and restore normal connectivity

[Confirm Release] [Cancel]
```

**User clicks:** `[Confirm Release]`

**Bot responds:**
```
Quarantine Release Result: vm1

Status: Released
Hostname: DESKTOP-T6U68JB
Firewall Rules: IR-ISOLATION rules removed
Profiles Restored: Normal outbound traffic allowed
```

---

## Quick Reference

| Command | Example | Description |
|---------|---------|-------------|
| Status | `/ir status vm1` | View processes, connections, quarantine status |
| Quarantine | `/ir quarantine vm1` | Isolate host from network |
| Release | `/ir release vm1` | Remove quarantine |
| Collect | `/ir collect vm1` | Download event logs |
| Kill | `/ir kill vm1 1234` | Terminate process by PID |

**Targets:** Use `vm1`, `vm2`, or direct IP (e.g., `192.168.1.33`)
