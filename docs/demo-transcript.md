# IR Playbook Bot - Demo Conversation Transcript

This document contains sample conversation transcripts demonstrating the IR Playbook Bot's capabilities. Use these as reference for your demo or as a template for testing.

---

## Demo Scenario: Responding to a Suspicious Activity Alert

### Context
A SOC analyst receives an alert about suspicious PowerShell activity on workstation `192.168.100.10`. They use the IR Playbook Bot to investigate and respond.

---

## Transcript

### 1. Getting Help

**User:** `/ir help`

**IR Bot Response:**
```
IR Playbook Bot - Commands

Basic Commands:
• /ir help - Show this help message
• /ir status <target> - Get system information from target
• /ir quarantine <target> - Isolate host from network
• /ir collect <target> - Collect forensic logs

Advanced Commands:
• /ir kill <target> <pid|name> - Terminate a process
• /ir memdump <target> <pid> - Dump process memory

Examples:
/ir status 192.168.100.10
/ir quarantine IR-Target-01
/ir kill 192.168.100.10 4532
/ir memdump 192.168.100.10 lsass

Target can be IP address or hostname. Ensure WinRM is configured.
```

---

### 2. Initial System Status Check

**User:** `/ir status 192.168.100.10`

**IR Bot Response:**
```
Gathering system information from 192.168.100.10...
```

**IR Bot Response (after processing):**
```
System Status: 192.168.100.10

Processes: 89 running
Notable processes:
  • powershell.exe (PID: 4532)
  • unknown_app.exe (PID: 6721)

Active Connections: 23 established
External connections:
  • powershell.exe -> 185.143.220.1:443
  • chrome.exe -> 142.250.185.206:443

Persistence entries: 12 found

Local Administrators: 3 members

Retrieved by john.smith at 2025-01-15T14:32:15.000Z
```

**Analysis:** The analyst notices a suspicious PowerShell process with an external connection to an unusual IP address.

---

### 3. Initiating Host Quarantine

**User:** `/ir quarantine 192.168.100.10`

**IR Bot Response:**
```
QUARANTINE REQUEST

You are about to isolate 192.168.100.10 from the network.

This will:
• Block all outbound network traffic
• Clear DNS cache
• Stop SMB services
• Only allow connections from management IPs

[Confirm Quarantine] [Cancel]
```

**User:** *Clicks "Confirm Quarantine"*

**IR Bot Response:**
```
Initiating quarantine on 192.168.100.10...
```

**IR Bot Response (after execution):**
```
QUARANTINE COMPLETE

• Target: 192.168.100.10
• Status: Isolated
• Requested by: john.smith
• Timestamp: 2025-01-15T14:35:22.000Z

[Release Quarantine] [Collect Logs]
```

---

### 4. Terminating Suspicious Process

**User:** `/ir kill 192.168.100.10 4532`

**IR Bot Response:**
```
PROCESS TERMINATION REQUEST

• Target: 192.168.100.10
• Process: 4532

This will forcefully terminate the specified process.

[Confirm Kill] [Cancel]
```

**User:** *Clicks "Confirm Kill"*

**IR Bot Response:**
```
Terminating process 4532 on 192.168.100.10...
```

**IR Bot Response (after execution):**
```
PROCESS TERMINATED

• Target: 192.168.100.10
• Process: 4532
• Terminated by: john.smith
• Timestamp: 2025-01-15T14:37:45.000Z
```

---

### 5. Collecting Forensic Logs

**User:** *Clicks "Collect Logs" button (or types):* `/ir collect 192.168.100.10`

**IR Bot Response:**
```
Collecting logs from 192.168.100.10... This may take a few minutes.
```

**IR Bot Response (after processing):**
```
LOG COLLECTION COMPLETE

• Target: 192.168.100.10
• Events collected: 2,847
• Days collected: 7
• Archive path: C:\Users\IRAdmin\AppData\Local\Temp\IR-Logs-20250115-143822.zip
• Collected by: john.smith
• Timestamp: 2025-01-15T14:42:18.000Z
```

---

### 6. Memory Dump (Advanced)

**User:** `/ir memdump 192.168.100.10 6721`

**IR Bot Response:**
```
Capturing memory dump from process 6721 on 192.168.100.10...
This may take several minutes depending on process size.
```

**IR Bot Response (after processing):**
```
MEMORY DUMP COMPLETE

• Target: 192.168.100.10
• Process ID: 6721
• Dump file: C:\Users\IRAdmin\AppData\Local\Temp\IR-MemDumps\unknown_app_6721_20250115-144312.dmp
• Size: 156.4 MB
• Captured by: john.smith
• Timestamp: 2025-01-15T14:45:30.000Z
```

---

### 7. Releasing Quarantine (After Investigation)

**User:** *Clicks "Release Quarantine" button*

**IR Bot Response:**
```
Releasing quarantine on 192.168.100.10...
```

**IR Bot Response (after execution):**
```
QUARANTINE RELEASED

• Target: 192.168.100.10
• Status: Connectivity restored
• Released by: john.smith
• Timestamp: 2025-01-15T15:30:00.000Z
```

---

## Additional Demo Scenarios

### Scenario A: Unauthorized User Attempt

**User (SOC Tier 1):** `/ir quarantine 192.168.100.10`

**IR Bot Response:**
```
You do not have permission to execute this command. IR_ANALYST role required.
```

---

### Scenario B: Invalid Target

**User:** `/ir status invalid-host-name-123`

**IR Bot Response:**
```
Failed to get status: Target not reachable via WinRM
```

---

### Scenario C: Missing Parameters

**User:** `/ir quarantine`

**IR Bot Response:**
```
Usage: /ir quarantine <target>
Example: /ir quarantine 192.168.100.10
```

---

### Scenario D: Kill Process by Name

**User:** `/ir kill 192.168.100.10 notepad`

**IR Bot Response:**
```
PROCESS TERMINATION REQUEST

• Target: 192.168.100.10
• Process: notepad

This will forcefully terminate the specified process.

[Confirm Kill] [Cancel]
```

---

## Audit Log Sample

After the above session, the audit log (`logs/audit.log`) would contain:

```json
{"timestamp":"2025-01-15T14:32:15.000Z","eventId":"IR-20250115-A1B2C3","action":"STATUS","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":null,"error":null}
{"timestamp":"2025-01-15T14:35:22.000Z","eventId":"IR-20250115-D4E5F6","action":"QUARANTINE","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":{"Status":"Isolated"}}
{"timestamp":"2025-01-15T14:37:45.000Z","eventId":"IR-20250115-G7H8I9","action":"KILL_PROCESS","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":{"ProcessId":4532}}
{"timestamp":"2025-01-15T14:42:18.000Z","eventId":"IR-20250115-J1K2L3","action":"COLLECT_LOGS","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":{"EventCount":2847}}
{"timestamp":"2025-01-15T14:45:30.000Z","eventId":"IR-20250115-M4N5O6","action":"MEMORY_DUMP","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":{"Size":"156.4 MB"}}
{"timestamp":"2025-01-15T15:30:00.000Z","eventId":"IR-20250115-P7Q8R9","action":"RELEASE_QUARANTINE","user":{"id":"U01ABC123","name":"john.smith"},"target":"192.168.100.10","status":"SUCCESS","details":{"Status":"Released"}}
```

---

## Demo Tips

1. **Start with `/ir help`** to show available commands
2. **Use `/ir status` first** to demonstrate reconnaissance
3. **Show the confirmation dialogs** before destructive actions
4. **Highlight the audit logging** for compliance
5. **Demonstrate the button interactions** for a modern UX
6. **End with releasing quarantine** to show the full lifecycle

---

## Screenshot Placeholders

For your demo presentation, capture screenshots of:

1. Slack workspace with the IR Bot
2. `/ir help` command output
3. `/ir status` results showing processes and connections
4. Quarantine confirmation dialog
5. Quarantine success message with action buttons
6. Log collection results
7. Audit log file contents

---

## Notes for Demo Environment

- Ensure VMs are running before demo
- Test WinRM connectivity beforehand
- Have sample "suspicious" processes running on target VM for realistic demo
- Consider running a simple Python HTTP server on target as a "suspicious" connection
