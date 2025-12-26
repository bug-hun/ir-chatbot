# IR Playbook Bot - Proof of Concept Guide

---

## Project Pitch

> "I built an Incident Response Playbook Bot that integrates with Slack to enable security teams to remotely execute containment and forensic actions on Windows endpoints. It uses PowerShell Remoting to quarantine compromised hosts, collect forensic artifacts, terminate malicious processes, and capture memory dumps - all from a Slack command interface with role-based access control and full audit logging."

### Technical Stack
- **Backend**: Node.js with Slack Bolt SDK
- **Remote Execution**: PowerShell Remoting (WinRM)
- **Communication**: Slack Socket Mode (firewall-friendly, no public endpoint needed)
- **Security**: Role-based access control (RBAC), immutable audit logging
- **Scripting**: PowerShell scripts for Windows IR automation

---

## Overview

The IR Playbook Bot enables security teams to remotely execute forensic and containment actions on Windows endpoints via PowerShell Remoting.

**Key Capabilities:**
- Host quarantine/isolation (blocks all network traffic except management)
- Forensic log collection (Security events, PowerShell history, Prefetch, etc.)
- System status checks (processes, connections, persistence, admins)
- Process termination
- Memory dumps

---

## File Structure & Purpose

### Root Files
| File | Purpose |
|------|---------|
| `index.js` | Entry point - initializes bot, validates environment, handles graceful shutdown |
| `package.json` | Dependencies - Slack Bolt, Winston logging, dotenv |
| `.env` | Secrets - Slack tokens and WinRM credentials (git-ignored) |

### Source Code (`src/`)

| File | Lines | Purpose |
|------|-------|---------|
| `slack/slackApp.js` | 1,433 | Main command handler - parses Slack commands, routes to handlers, builds Block Kit UI |
| `services/powershellService.js` | 329 | WinRM execution engine - reads scripts, injects credentials, executes remotely |
| `services/auditService.js` | 235 | Audit logging - records all actions with timestamp, user, target, status |
| `middleware/authMiddleware.js` | 166 | RBAC - 4 roles (ADMIN, IR_ANALYST, SOC_TIER2, SOC_TIER1) with permission checks |
| `utils/logger.js` | 58 | Winston logger - console + file transports |

### PowerShell Scripts (`src/scripts/`)

| Script | Lines | Purpose |
|--------|-------|---------|
| `Quarantine-Host.ps1` | 122 | Network isolation - Windows Firewall blocks outbound, allows management IPs, clears DNS, stops SMB |
| `Get-SystemInfo.ps1` | 183 | System recon - processes, connections, persistence, local admins, quarantine status |
| `Collect-Logs.ps1` | 279 | Forensic collection - event logs, PowerShell history, prefetch, browser history, network config |
| `Kill-Process.ps1` | 120 | Process termination - kills by PID or name, includes child processes |
| `Get-MemoryDump.ps1` | 212 | Memory capture - uses comsvcs.dll with fallbacks to DbgHelp and WMI |

### Config Files (`src/config/`)

| File | Purpose |
|------|---------|
| `targets.json` | Target VMs - name, IP, description, aliases |
| `roles.json` | RBAC config - roles, permissions, user assignments |

---

## Network Environment

### Our Lab Setup
```
┌─────────────────────────────────────────────────────────────┐
│                    Same LAN (192.168.1.0/24)                │
│                                                             │
│   ┌─────────────────┐                                       │
│   │  Control Host   │  192.168.1.3                          │
│   │  (Bot Runner)   │  - Node.js + Bot                      │
│   │   Windows 11    │  - PowerShell Remoting Client         │
│   └────────┬────────┘                                       │
│            │                                                │
│            │ WinRM (Port 5985)                              │
│            │                                                │
│   ┌────────┴────────┬─────────────────┐                     │
│   │                 │                 │                     │
│   ▼                 ▼                 ▼                     │
│ ┌───────────┐  ┌───────────┐   ┌───────────┐               │
│ │   VM1     │  │   VM2     │   │   VM3     │               │
│ │ .1.33     │  │ .1.34     │   │ .1.35     │  (Add more)   │
│ │ Windows   │  │ Windows   │   │ Windows   │               │
│ └───────────┘  └───────────┘   └───────────┘               │
│                                                             │
│   Gateway: 192.168.1.1                                      │
└─────────────────────────────────────────────────────────────┘
```

### Network Options

| Setup | Description | Use Case |
|-------|-------------|----------|
| **Same LAN** | All machines on same subnet (192.168.1.0/24) | Lab/Testing - our current setup |
| **Separate VLAN** | Control host on management VLAN, targets on user VLAN | Production - better security |
| **Cross-Network** | Control host can reach targets via routing | Enterprise with multiple sites |

### For Production (Separate VLAN)
```
Management VLAN (10.0.1.0/24)     User VLAN (10.0.2.0/24)
┌─────────────────┐               ┌─────────────────┐
│  Control Host   │               │  Target VMs     │
│  10.0.1.10      │◄─── WinRM ───►│  10.0.2.x       │
└─────────────────┘               └─────────────────┘
        │                                 │
        └────────── Router/Firewall ──────┘
                   (Allow 5985/5986)
```

---

## Control Host Setup (Main Windows Machine)

### Step 1: Install Node.js
Download from https://nodejs.org (v18 or higher)
```powershell
# Verify installation
node --version    # Should show v18.x or higher
npm --version
```

### Step 2: Clone/Copy the Bot
```powershell
cd C:\Users\<YourUser>\Desktop
git clone <repo-url> ir-chatbot
# OR copy the ir-chatbot folder manually
```

### Step 3: Install Dependencies
```powershell
cd ir-chatbot
npm install
```

### Step 4: Configure WinRM Client
```powershell
# Run as Administrator
# Allow connecting to any remote host
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Verify
Get-Item WSMan:\localhost\Client\TrustedHosts
```

### Step 5: Create .env File
```powershell
# Copy the example
copy .env.example .env

# Edit with your values
notepad .env
```

**.env Configuration:**
```bash
# Slack tokens (from api.slack.com/apps)
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_APP_TOKEN=xapp-your-app-token

# WinRM credentials (admin account on target VMs)
IR_USERNAME=IRAdmin
IR_PASSWORD=YourSecurePassword123!

# IPs allowed during quarantine (control host + gateway)
ALLOWED_MANAGEMENT_IPS=192.168.1.3,192.168.1.1

# Optional
COMMAND_TIMEOUT=300000
LOG_LEVEL=info
```

### Step 6: Test WinRM Connection
```powershell
# Test connectivity to target VM
Test-WSMan -ComputerName 192.168.1.33

# Test with credentials
$pw = ConvertTo-SecureString 'YourPassword' -AsPlainText -Force
$cred = New-Object PSCredential('IRAdmin', $pw)
Invoke-Command -ComputerName 192.168.1.33 -Credential $cred -ScriptBlock { hostname }
```

### Step 7: Start the Bot
```powershell
cd ir-chatbot
npm start
```

---

## Adding More Target Hosts

### Step 1: Configure the New Target VM

Run these commands on the **new target VM** as Administrator:

```powershell
# 1. Enable PowerShell Remoting
Enable-PSRemoting -Force

# 2. Allow connections from any host
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# 3. Enable WinRM firewall rules
Enable-NetFirewallRule -DisplayGroup "Windows Remote Management"

# 4. Create IR Admin account (if not using domain account)
$password = ConvertTo-SecureString "IRLabPass123!" -AsPlainText -Force
New-LocalUser -Name "IRAdmin" -Password $password -FullName "IR Admin" -Description "Incident Response Account"
Add-LocalGroupMember -Group "Administrators" -Member "IRAdmin"

# 5. Verify WinRM is running
Get-Service WinRM
Test-WSMan localhost
```

### Step 2: Add to targets.json

Edit `src/config/targets.json`:

```json
{
  "targets": {
    "vm1": {
      "ip": "192.168.1.33",
      "description": "Windows 10 Workstation",
      "os": "Windows"
    },
    "vm2": {
      "ip": "192.168.1.34",
      "description": "Windows Server 2019",
      "os": "Windows"
    },
    "vm3": {
      "ip": "192.168.1.35",
      "description": "Finance Department PC",
      "os": "Windows"
    },
    "dc01": {
      "ip": "192.168.1.10",
      "description": "Domain Controller",
      "os": "Windows Server"
    }
  },
  "aliases": {
    "workstation": "vm1",
    "server": "vm2",
    "finance": "vm3"
  },
  "managementIPs": [
    "192.168.1.3",
    "192.168.1.1"
  ]
}
```

### Step 3: Update .env (if needed)

If control host IP changed, update `ALLOWED_MANAGEMENT_IPS`:
```bash
ALLOWED_MANAGEMENT_IPS=192.168.1.3,192.168.1.1
```

### Step 4: Restart the Bot
```powershell
# Stop current bot (Ctrl+C)
# Start again
npm start
```

### Step 5: Verify New Target
```
/ir targets           # Should show new VM
/ir status vm3        # Test connection
```

---

## Prerequisites

### Infrastructure
| Component | Details |
|-----------|---------|
| Control Host | Windows machine running the bot (192.168.1.3) |
| Target VM(s) | Windows VMs with WinRM enabled |
| Slack Workspace | Bot installed with Socket Mode enabled |
| Network | All machines must be reachable on port 5985 (WinRM) |

### Target VM Requirements
```powershell
# Enable WinRM on target VMs (run as Administrator)
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force
Enable-NetFirewallRule -DisplayGroup "Windows Remote Management"
```

### Environment Variables (.env)
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
IR_USERNAME=IRAdmin
IR_PASSWORD=YourPassword
ALLOWED_MANAGEMENT_IPS=192.168.1.3,192.168.1.1
```

---

## Slack Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `/ir help` | Show all available commands | `/ir help` |
| `/ir targets` | List configured target systems | `/ir targets` |
| `/ir status <target>` | Get system status (processes, connections, quarantine state) | `/ir status vm1` |
| `/ir quarantine <target>` | Isolate host from network | `/ir quarantine vm1` |
| `/ir release <target>` | Restore network connectivity | `/ir release vm1` |
| `/ir collect <target>` | Collect forensic logs | `/ir collect vm1` |
| `/ir kill <target> <pid\|name>` | Terminate a process | `/ir kill vm1 notepad` |
| `/ir memdump <target> <pid>` | Capture process memory | `/ir memdump vm1 1234` |
| `/ir incidents` | View recent incident activity | `/ir incidents` |

---

## Video Demo Script (5-7 minutes)

### Setup
1. Start the bot: `npm start`
2. Have Slack open
3. Have VM console ready

### Demo Flow

**Intro (30 sec)**
> "I'll demonstrate my Incident Response Playbook Bot - a Slack-integrated tool for remote Windows endpoint containment and forensics."

**1. Basic Commands (1 min)**
```
/ir help           # Show available commands
/ir targets        # Show configured VMs
```
> "The bot provides role-based access - different users have different permissions"

**2. Status Check (1 min)**
```
/ir status vm1
```
> "This queries the remote system for running processes, network connections, persistence mechanisms, and quarantine status"
- Point out: "Currently shows NOT ISOLATED"

**3. Quarantine Demo (2 min)**
```
/ir quarantine vm1
```
- Show confirmation dialog
- Click confirm
- **Switch to VM console**: Run `ping google.com` - show it fails
- **Switch to VM console**: Run `Get-NetFirewallRule -DisplayName "IR-ISOLATION*"` - show rules
> "The host is now isolated - all outbound traffic blocked except management access"

**4. Collect Logs (1 min)**
```
/ir collect vm1
```
> "This collects forensic artifacts - event logs, PowerShell history, prefetch files"
- Show the ZIP being downloaded

**5. Release (30 sec)**
```
/ir release vm1
```
- **Switch to VM console**: Run `ping google.com` - show it works
> "Network connectivity restored"

**6. Incident Tracking (30 sec)**
```
/ir incidents
```
> "All actions are tracked with incident IDs for audit compliance"

**Closing (30 sec)**
> "Key features: Remote execution via WinRM, role-based access control, audit logging, and professional Slack UI. Built with Node.js and PowerShell for enterprise IR teams."

---

## Interview Q&A

### Technical Questions

**Q: Why did you choose Socket Mode instead of Events API?**
> "Socket Mode doesn't require a public endpoint, making it firewall-friendly for internal security tools"

**Q: How does the quarantine actually work?**
> "It sets Windows Firewall DefaultOutboundAction to Block, then creates Allow rules only for management IPs. DNS is redirected to localhost to prevent resolution, and SMB services are stopped to prevent lateral movement"

**Q: What happens if the management IP is blocked too?**
> "I solved this by using Default Block action instead of explicit Block rules. In Windows Firewall, Allow rules can override Default actions but not explicit Block rules"

**Q: How do you handle credential security?**
> "Credentials are stored in .env which is git-ignored, and they're escaped before injection into PowerShell commands to prevent injection attacks"

**Q: What forensic artifacts do you collect?**
> "Security event logs (logons, process creation), System/Application logs, PowerShell command history, Prefetch files for execution evidence, browser history, and network configuration"

### Behavioral Questions

**Q: What was the hardest part of this project?**
> "Getting the quarantine to work correctly - initially my explicit Block rules were overriding the Allow rules for management IPs. I had to understand Windows Firewall rule precedence to fix it"

**Q: How would you improve this tool?**
> "Add pre-flight checks before quarantine, support for Linux endpoints via SSH, integration with SIEM for automated response, and a web dashboard for non-Slack users"

---

## VM-Side Verification Commands

### Check Firewall Status
```powershell
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction

# Expected when QUARANTINED:
# Name    Enabled DefaultInboundAction DefaultOutboundAction
# Domain     True                Block                 Block
# Private    True                Block                 Block
# Public     True                Block                 Block
```

### Check IR Isolation Rules
```powershell
Get-NetFirewallRule -DisplayName "IR-ISOLATION*" | Format-Table DisplayName, Enabled, Direction, Action

# Expected when QUARANTINED (2 rules):
# IR-ISOLATION-Allow-Mgmt-Inbound    True   Inbound  Allow
# IR-ISOLATION-Allow-Mgmt-Outbound   True  Outbound  Allow
```

### Test Network Connectivity
```powershell
ping google.com      # Should FAIL when quarantined
ping 8.8.8.8         # Should FAIL when quarantined
```

---

## Emergency Recovery

If you lose Slack/WinRM access to the VM, run these commands directly on the VM console:

```powershell
# Remove all IR isolation rules
Get-NetFirewallRule -DisplayName "IR-ISOLATION*" | Remove-NetFirewallRule

# Reset firewall defaults
Set-NetFirewallProfile -Profile Domain,Public,Private -DefaultOutboundAction Allow

# Reset DNS to DHCP
Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object {
    Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ResetServerAddresses
}

# Clear DNS cache
Clear-DnsClientCache

# Restart network services
Start-Service LanmanWorkstation, LanmanServer -ErrorAction SilentlyContinue

# Verify recovery
ping google.com
```

---

## Architecture

```
+------------------+     Slack API      +------------------+
|   Slack App      | <----------------> |  IR Playbook Bot |
|  (Workspace)     |    Socket Mode     |  (Node.js)       |
+------------------+                    +--------+---------+
                                                 |
                                                 | PowerShell Remoting
                                                 | (WinRM / Port 5985)
                                                 |
                    +----------------------------+----------------------------+
                    |                            |                            |
            +-------v-------+            +-------v-------+            +-------v-------+
            |    VM1        |            |    VM2        |            |    VM3        |
            | 192.168.1.33  |            | 192.168.1.34  |            | 192.168.1.35  |
            +---------------+            +---------------+            +---------------+
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Access Denied" on quarantine | Check IR_USERNAME/IR_PASSWORD in .env |
| Ping still works after quarantine | Check if DefaultOutboundAction is Block |
| Cannot connect to VM after quarantine | Ensure your IP is in ALLOWED_MANAGEMENT_IPS |
| Bot not responding | Check `npm start` is running, verify Slack tokens |
| WinRM connection failed | Run `Enable-PSRemoting -Force` on target VM |

---

## Memory Dump Details

### What is a Memory Dump?
A memory dump captures the full contents of a process's memory at a specific moment. It's essential for:
- Malware analysis (find injected code, strings, C2 addresses)
- Credential extraction (passwords may be in memory)
- Forensic investigation (see what process was doing)

### Where are Dumps Saved?
On the **target VM**: `C:\Users\<IR_USERNAME>\AppData\Local\Temp\IR-MemDumps\`

File format: `<ProcessName>_<PID>_<Timestamp>.dmp`
Example: `Notepad_2348_20251226-125704.dmp`

### How to Use
```
/ir memdump vm1 <PID>
/ir memdump vm1 notepad    # Can also use process name
```

### Dump Methods (Automatic Fallback)
1. **comsvcs.dll** - Windows built-in, most reliable
2. **DbgHelp.dll** - .NET P/Invoke fallback
3. **WMI** - Metadata only (if above methods fail)

### Analyze with:
- **WinDbg** - Microsoft debugger
- **Volatility** - Memory forensics framework
- **strings** - Extract readable text

---

## Quarantine Firewall Logic

### The Problem We Solved
Initially, quarantine blocked **all** traffic including management IPs because explicit Block rules override Allow rules in Windows Firewall.

### The Fix
We use **Default Block action** instead of explicit Block rules. Allow rules CAN override Default actions.

### How Quarantine Works Now

**Step 1: Set Firewall Defaults to Block**
```powershell
Set-NetFirewallProfile -Profile Domain,Public,Private -DefaultOutboundAction Block
Set-NetFirewallProfile -Profile Domain,Public,Private -DefaultInboundAction Block
```

**Step 2: Create Allow Rules for Management IPs**
```powershell
New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Inbound" -Direction Inbound `
    -Action Allow -RemoteAddress 192.168.1.3,192.168.1.1 -Enabled True -Profile Any

New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Outbound" -Direction Outbound `
    -Action Allow -RemoteAddress 192.168.1.3,192.168.1.1 -Enabled True -Profile Any
```

**Step 3: Additional Isolation**
```powershell
# Clear DNS cache
Clear-DnsClientCache

# Redirect DNS to invalid address
Set-DnsClientServerAddress -InterfaceIndex <idx> -ServerAddresses "127.0.0.127"

# Stop SMB to prevent lateral movement
Stop-Service LanmanWorkstation, LanmanServer -Force
```

### Why This Works
| Rule Type | Behavior |
|-----------|----------|
| Explicit Block + Explicit Allow | **Block wins** (our initial problem) |
| Default Block + Explicit Allow | **Allow wins** (our solution) |

### Result
- Internet traffic: **BLOCKED** (by default action)
- Management IP (WinRM/RDP): **ALLOWED** (explicit rule)
- DNS: **BLOCKED** (redirected to invalid address)
- SMB/File sharing: **BLOCKED** (services stopped)

---

## Important File Locations

### On Control Host (Bot Machine)
| Location | Purpose |
|----------|---------|
| `ir-chatbot/` | Main project folder |
| `ir-chatbot/.env` | Secrets and configuration |
| `ir-chatbot/logs/audit.log` | All IR actions logged here |
| `ir-chatbot/logs/combined.log` | Application logs |
| `ir-chatbot/logs/error.log` | Error logs only |
| `ir-chatbot/collected-logs/` | Downloaded forensic archives |
| `ir-chatbot/src/config/targets.json` | Target VM configuration |
| `ir-chatbot/src/config/roles.json` | User roles and permissions |

### On Target VMs
| Location | Purpose |
|----------|---------|
| `C:\Users\<user>\AppData\Local\Temp\IR-MemDumps\` | Memory dump files |
| `C:\TEMP\IR-Logs-<date>\` | Forensic collection folder (before ZIP) |
| `C:\TEMP\IR-Logs-<date>.zip` | Compressed forensic archive |

---

## Kill Process Example

### Find and Kill a Malicious Process
```
# First, check status to see running processes
/ir status vm1

# Kill by process name
/ir kill vm1 notepad

# Kill by PID (get PID from status output)
/ir kill vm1 2348
```

### What Gets Killed
- The target process
- All child processes (process tree)

---

## Checking Audit Logs

### View Recent Actions
```powershell
# On control host
cd ir-chatbot

# View last 20 audit entries
Get-Content logs/audit.log | Select-Object -Last 20

# Search for specific action
Select-String -Path logs/audit.log -Pattern "QUARANTINE"

# Search by user
Select-String -Path logs/audit.log -Pattern "incident-bot"
```

### Audit Log Format
```json
{
  "timestamp": "2025-12-26T12:38:53.000Z",
  "action": "QUARANTINE",
  "user": "incident-bot",
  "target": "vm1",
  "status": "SUCCESS",
  "incidentId": "IR-20251226-ABCD"
}
```

---

## Quick Start Commands

### Start the Bot
```powershell
cd C:\Users\thunder\Desktop\research\tools\Incident Response Playbook Bot\ir-chatbot
npm start
```

### Run in Background (Windows)
```powershell
# Using PowerShell job
Start-Job -ScriptBlock { cd "C:\path\to\ir-chatbot"; npm start }

# Or use PM2 (install first: npm install -g pm2)
pm2 start index.js --name ir-bot
pm2 logs ir-bot
pm2 stop ir-bot
```

### Check if Bot is Running
```powershell
Get-Process node
```

### Restart the Bot
```powershell
# Stop (Ctrl+C in terminal)
# Then start again
npm start
```

---

## Slack App Setup (If Not Done)

### 1. Create Slack App
1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. Name: "IR Playbook Bot"
4. Select your workspace

### 2. Enable Socket Mode
1. Settings → Socket Mode → Enable
2. Generate App Token (starts with `xapp-`)

### 3. Add Bot Permissions
OAuth & Permissions → Bot Token Scopes:
- `commands`
- `chat:write`
- `users:read`

### 4. Create Slash Command
Slash Commands → Create New Command:
- Command: `/ir`
- Description: "Incident Response commands"
- Usage Hint: "help | status | quarantine | release | collect | kill | memdump"

### 5. Install to Workspace
Install App → Install to Workspace → Allow

### 6. Get Tokens
- Bot Token: OAuth & Permissions → Bot User OAuth Token (`xoxb-...`)
- Signing Secret: Basic Information → Signing Secret
- App Token: Basic Information → App-Level Tokens (`xapp-...`)

---

## Security Considerations

1. **Credentials**: Store IR credentials securely; use service accounts with minimal privileges
2. **Network Segmentation**: Management IPs should be on a separate VLAN
3. **Audit Logging**: All actions are logged to `logs/` directory
4. **Role-Based Access**: Configure user roles in Slack for authorization
5. **Recovery**: Always have console access to VMs for emergency recovery
