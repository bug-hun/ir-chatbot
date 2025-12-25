# IR Playbook Bot - Deployment Guide

## Prerequisites

- **Node.js** 18+ installed
- **PowerShell 7+** with Remoting enabled
- **Windows VMs** accessible via WinRM
- **Slack App** with Socket Mode enabled

---

## Quick Start

### 1. Clone and Install

```bash
cd ir-chatbot
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret
IR_USERNAME=YOURDOMAIN\IRAdmin
IR_PASSWORD=YourSecurePassword
```

### 3. Configure Targets

Edit `src/config/targets.json`:

```json
{
  "targets": {
    "vm1": { "ip": "192.168.1.33", "description": "Test VM 1", "os": "Windows" },
    "vm2": { "ip": "192.168.1.34", "description": "Test VM 2", "os": "Windows" }
  },
  "aliases": {},
  "managementIPs": ["192.168.1.1"]
}
```

### 4. Start the Bot

```bash
npm start
```

---

## Slack App Setup

### Required OAuth Scopes (Bot Token)

- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `commands`
- `files:write`

### Socket Mode

Enable Socket Mode in your Slack App settings. This uses WebSocket connection - **no ngrok or public URL needed**.

### Slash Command

Create `/ir` command pointing to your app.

---

## PowerShell Remoting Setup

On each target VM, run as Administrator:

```powershell
# Enable PSRemoting
Enable-PSRemoting -Force

# Add IR workstation to TrustedHosts
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.1.1" -Force

# Create IR Admin account
$pw = ConvertTo-SecureString "YourSecurePassword" -AsPlainText -Force
New-LocalUser -Name "IRAdmin" -Password $pw -PasswordNeverExpires
Add-LocalGroupMember -Group "Administrators" -Member "IRAdmin"
```

On your IR workstation:

```powershell
# Trust target VMs
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.1.33,192.168.1.34" -Force
```

---

## Available Commands

| Command | Description |
|---------|-------------|
| `/ir status <target>` | Get system info, processes, connections, quarantine status |
| `/ir quarantine <target>` | Isolate host (block all outbound except management IPs) |
| `/ir release <target>` | Remove quarantine and restore network |
| `/ir collect <target>` | Collect Security/System event logs |
| `/ir kill <target> <pid>` | Terminate a process by PID |

**Targets**: Use VM name (vm1, vm2) or IP address directly.

---

## Collected Logs

Downloaded logs are saved to: `ir-chatbot/collected-logs/`

Files are named: `INC-YYYYMMDD-HHMMSS_HOSTNAME_YYYYMMDD_HHMMSS.zip`

---

## Troubleshooting

### Bot not responding to commands

1. Check Socket Mode is enabled in Slack App settings
2. Verify `SLACK_APP_TOKEN` starts with `xapp-`
3. Check bot is invited to channel: `/invite @YourBotName`

### PowerShell connection errors

1. Test manually: `Enter-PSSession -ComputerName 192.168.1.33 -Credential (Get-Credential)`
2. Verify WinRM service running: `Get-Service WinRM`
3. Check firewall allows WinRM (port 5985/5986)

### N/A values in results

Ensure scripts return JSON: `$results | ConvertTo-Json -Depth 5 -Compress`

---

## Architecture

```
Slack <--WebSocket--> Node.js Bot <--WinRM--> Target VMs
                           |
                     collected-logs/
```

- **No ngrok needed** - Socket Mode uses outbound WebSocket
- **Logs stored locally** - Downloaded to host, not uploaded to Slack
- **Stateless** - Each command is independent, no session persistence
