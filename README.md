# IR Playbook Bot

A Slack-integrated Incident Response automation tool for Windows environments. Execute containment and forensic actions on remote Windows endpoints via PowerShell Remoting (WinRM) directly from Slack commands.

## Overview

IR Playbook Bot enables security teams to:
- **Quarantine compromised hosts** - Network isolation while maintaining management access
- **Collect forensic artifacts** - Event logs, prefetch files, browser history, PowerShell history
- **Terminate malicious processes** - Kill processes by PID or name including child processes
- **Capture memory dumps** - Process memory acquisition for malware analysis
- **Track incidents** - Automatic incident ID assignment and audit logging

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   Slack App     │◄───────►│  Control Host   │◄───────►│  Target VMs     │
│  (Cloud/Bot)    │ Socket  │   (Node.js)     │  WinRM  │   (Windows)     │
│                 │  Mode   │                 │  5985   │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                    │
                                    ▼
                            ┌─────────────────┐
                            │   PowerShell    │
                            │    Scripts      │
                            └─────────────────┘
```

**Key Components:**
- **Slack Socket Mode** - Firewall-friendly (no public endpoint required)
- **PowerShell Remoting** - Native Windows remote execution
- **Role-Based Access Control** - Configurable permissions per user/role

## Features

| Feature | Description |
|---------|-------------|
| Host Quarantine | Blocks all outbound traffic except management IPs using Windows Firewall |
| Log Collection | Gathers Security/System/PowerShell logs, prefetch, browser history into ZIP |
| Process Kill | Terminates processes by PID or name with child process handling |
| Memory Dump | Captures process memory using comsvcs.dll with fallback methods |
| System Status | Shows processes, network connections, persistence mechanisms |
| Audit Logging | Full trail of all IR actions with timestamps and user attribution |
| Incident Tracking | Automatic incident IDs for action correlation |

## Quick Start

### Prerequisites

- Node.js 18+
- Windows 10/11 or Windows Server (control host and targets)
- Slack workspace with admin access
- WinRM enabled on target hosts

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/ir-playbook-bot.git
cd ir-playbook-bot/ir-chatbot
npm install
```

### 2. Configure Environment

```bash
copy .env.example .env
```

Edit `.env` with your credentials:
```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
IR_USERNAME=your-ir-admin-account
IR_PASSWORD=your-ir-admin-password
```

### 3. Configure Targets

Edit `src/config/targets.json`:
```json
{
  "targets": {
    "vm1": {
      "ip": "192.168.100.10",
      "description": "Web Server",
      "os": "Windows"
    }
  },
  "managementIPs": ["192.168.100.1"]
}
```

### 4. Enable WinRM on Targets

Run on each target (as Administrator):
```powershell
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.100.1" -Force
```

### 5. Start the Bot

```bash
npm start
```

## Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/ir help` | Show available commands | All |
| `/ir targets` | List configured targets | All |
| `/ir status <target>` | Get system information | SOC_TIER1+ |
| `/ir quarantine <target>` | Isolate host from network | IR_ANALYST+ |
| `/ir release <target>` | Restore network connectivity | IR_ANALYST+ |
| `/ir collect <target>` | Collect forensic logs | IR_ANALYST+ |
| `/ir kill <target> <pid/name>` | Terminate a process | IR_ANALYST+ |
| `/ir memdump <target> <pid>` | Capture memory dump | IR_ANALYST+ |
| `/ir incidents` | View recent incidents | SOC_TIER2+ |

## Project Structure

```
ir-chatbot/
├── index.js                    # Entry point
├── src/
│   ├── slack/
│   │   └── slackApp.js        # Slack command handlers & UI
│   ├── services/
│   │   ├── powershellService.js   # Remote PowerShell execution
│   │   ├── auditService.js        # Action logging
│   │   └── incidentService.js     # Incident tracking
│   ├── middleware/
│   │   └── authMiddleware.js      # RBAC implementation
│   ├── scripts/
│   │   ├── Get-SystemInfo.ps1     # System reconnaissance
│   │   ├── Quarantine-Host.ps1    # Network isolation
│   │   ├── Release-Quarantine.ps1 # Restore connectivity
│   │   ├── Collect-Logs.ps1       # Forensic collection
│   │   ├── Kill-Process.ps1       # Process termination
│   │   └── Get-MemoryDump.ps1     # Memory acquisition
│   └── config/
│       ├── roles.json             # RBAC configuration
│       └── targets.json           # Target host definitions
└── docs/
    └── POC.md                     # Detailed documentation
```

## Security Considerations

- **Credentials**: Store in `.env` file (git-ignored), never commit secrets
- **RBAC**: Configure user permissions in `src/config/roles.json`
- **Network Isolation**: Use host-only or isolated VLAN for target VMs
- **WinRM Security**: Restrict TrustedHosts to management IPs only
- **Audit Logs**: All actions logged with user, target, timestamp, and result

## Quarantine Logic

The quarantine uses Windows Firewall Default Block strategy:
1. Sets `DefaultOutboundAction` to Block on all profiles
2. Creates Allow rules for management IPs (preserves remote access)
3. Redirects DNS to localhost (prevents name resolution)
4. Stops SMB services (prevents lateral movement)

This approach ensures management connectivity is maintained while blocking all other outbound traffic.

## Documentation

See [POC.md](docs/POC.md) for detailed documentation including:
- Network environment setup
- Slack app configuration
- Interview Q&A for technical discussions
- Video demo script

## Requirements

- Node.js 18+
- Windows 10/11 or Windows Server 2016+
- PowerShell 5.1+
- Slack workspace with bot/app token permissions

## License

MIT

## Disclaimer

This tool is intended for authorized incident response activities only. Ensure you have proper authorization before deploying in any environment. The authors are not responsible for misuse of this tool.
