# IR Playbook Bot

A professional-grade Incident Response Playbook Bot built with Node.js and PowerShell. Integrates with Slack to execute IR commands on Windows systems remotely via WinRM.

## Features

- **Slack Integration** - Socket Mode for secure, firewall-friendly communication
- **Remote PowerShell Execution** - Execute IR scripts on Windows targets via WinRM
- **Host Quarantine** - Isolate compromised hosts while maintaining management access
- **Log Collection** - Gather forensic artifacts including event logs, prefetch, and browser history
- **Process Termination** - Kill malicious processes by PID or name
- **Memory Dump** - Capture process memory for analysis
- **Role-Based Access Control** - Configurable permissions per user
- **Audit Logging** - Complete trail of all IR actions

## Quick Start

### 1. Install Dependencies

```bash
cd ir-chatbot
npm install
```

### 2. Configure Environment

```bash
copy .env.example .env
# Edit .env with your Slack tokens and credentials
```

### 3. Start the Bot

```bash
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/ir help` | Show available commands |
| `/ir status <target>` | Get system information |
| `/ir quarantine <target>` | Isolate host from network |
| `/ir collect <target>` | Collect forensic logs |
| `/ir kill <target> <pid>` | Terminate a process |
| `/ir memdump <target> <pid>` | Capture memory dump |

## Project Structure

```
ir-chatbot/
├── index.js                 # Entry point
├── src/
│   ├── slack/
│   │   └── slackApp.js     # Slack command handlers
│   ├── services/
│   │   ├── powershellService.js
│   │   ├── auditService.js
│   │   └── incidentService.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── scripts/
│   │   ├── Get-SystemInfo.ps1
│   │   ├── Quarantine-Host.ps1
│   │   ├── Collect-Logs.ps1
│   │   ├── Kill-Process.ps1
│   │   └── Get-MemoryDump.ps1
│   ├── config/
│   │   ├── roles.json
│   │   └── targets.json
│   └── utils/
│       └── logger.js
└── docs/
    ├── deployment-guide.md
    └── demo-transcript.md
```

## Documentation

- [Deployment Guide](docs/deployment-guide.md) - Complete setup instructions
- [Demo Transcript](docs/demo-transcript.md) - Sample conversations and scenarios

## Requirements

- Node.js 18+
- Windows 10/11 (host and targets)
- VirtualBox 7.x (for test environment)
- Slack workspace with admin access

## Security Considerations

- Store credentials in `.env` file (never commit)
- Configure RBAC in `src/config/roles.json`
- Review audit logs regularly at `logs/audit.log`
- Use host-only networking for VMs
- Restrict WinRM to management IPs

## License

MIT
