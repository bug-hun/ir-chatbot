# Incident Response Playbook Bot - Deployment Guide

This guide covers the complete setup and deployment of the IR Playbook Bot, including VirtualBox VM configuration, Slack App setup, and PowerShell Remoting configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VirtualBox Network Setup](#virtualbox-network-setup)
3. [Target VM Configuration](#target-vm-configuration)
4. [PowerShell Remoting Setup](#powershell-remoting-setup)
5. [Slack App Setup](#slack-app-setup)
6. [Bot Configuration](#bot-configuration)
7. [Running the Bot](#running-the-bot)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Windows 10/11** (Host machine)
- **Node.js 18+** - Download from https://nodejs.org/
- **VirtualBox 7.x** - Download from https://www.virtualbox.org/
- **Windows 10/11 Enterprise Evaluation ISO** - Download from https://www.microsoft.com/en-us/evalcenter/

### Verify Installation

```powershell
# Check Node.js
node --version
# Should output: v18.x.x or higher

# Check VirtualBox
VBoxManage --version
# Should output version number
```

---

## VirtualBox Network Setup

### Step 1: Create Host-Only Network

1. Open **VirtualBox**
2. Go to **File > Host Network Manager** (or press Ctrl+H)
3. Click the **Create** button (green + icon)
4. Configure the new adapter:
   - **Adapter Tab:**
     - Configure Adapter Manually: Yes
     - IPv4 Address: `192.168.100.1`
     - IPv4 Network Mask: `255.255.255.0`
   - **DHCP Server Tab:**
     - Enable Server: **Unchecked** (we'll use static IPs)
5. Click **Apply** and **Close**

### Step 2: Verify Network Adapter

```powershell
# Check the adapter was created
ipconfig | findstr "192.168.100"
# Should show: IPv4 Address: 192.168.100.1
```

---

## Target VM Configuration

### Step 1: Create Virtual Machine

1. In VirtualBox, click **New**
2. Configure:
   - Name: `IR-Target-01`
   - Type: Microsoft Windows
   - Version: Windows 10/11 (64-bit)
   - Memory: 4096 MB
   - Hard disk: Create a virtual hard disk now (60 GB, VDI, Dynamically allocated)

3. Before starting, go to **Settings**:
   - **System > Processor:** 2 CPUs
   - **Network > Adapter 1:**
     - Attached to: **Host-only Adapter**
     - Name: Select the adapter created earlier

4. Mount Windows ISO and install Windows

### Step 2: Post-Installation Configuration

After Windows is installed:

1. **Set Static IP Address:**
   - Open **Settings > Network & Internet > Ethernet > Properties**
   - Edit IP settings:
     - IP address: `192.168.100.10`
     - Subnet mask: `255.255.255.0`
     - Gateway: `192.168.100.1`
     - DNS: `192.168.100.1`

2. **Set Workgroup:**
   ```powershell
   # Run as Administrator
   Add-Computer -WorkGroupName "IRLAB" -Force
   Restart-Computer
   ```

3. **Create Admin Account:**
   ```powershell
   # Run as Administrator
   $Password = Read-Host "Enter password" -AsSecureString
   New-LocalUser "IRAdmin" -Password $Password -FullName "IR Admin" -Description "IR Bot Service Account"
   Add-LocalGroupMember -Group "Administrators" -Member "IRAdmin"
   ```

### Step 3: Repeat for Additional VMs

Create additional VMs with different IPs:
- `IR-Target-02`: 192.168.100.11
- `IR-Target-03`: 192.168.100.12

---

## PowerShell Remoting Setup

### On Each Target VM (Run as Administrator)

```powershell
# Enable PowerShell Remoting
Enable-PSRemoting -SkipNetworkProfileCheck -Force

# Enable remote admin access for local accounts
New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' `
    -Name 'LocalAccountTokenFilterPolicy' -Value 1 -PropertyType DWORD -Force

# Restrict WinRM to management IP only (security best practice)
Set-NetFirewallRule -DisplayName "Windows Remote Management (HTTP-In)" `
    -RemoteAddress 192.168.100.1

# Restart WinRM service
Restart-Service WinRM

# Verify WinRM is listening
winrm enumerate winrm/config/listener
```

### On Host Machine (Run as Administrator)

```powershell
# Enable PowerShell Remoting on host
Enable-PSRemoting -SkipNetworkProfileCheck -Force

# Add target VMs to TrustedHosts
Set-Item WSMan:\localhost\Client\TrustedHosts `
    -Value "192.168.100.10,192.168.100.11,192.168.100.12" -Force

# Verify TrustedHosts
Get-Item WSMan:\localhost\Client\TrustedHosts
```

### Test Connectivity

```powershell
# Test WinRM
Test-WSMan 192.168.100.10

# Test remote session
$cred = Get-Credential -UserName "192.168.100.10\IRAdmin"
Enter-PSSession -ComputerName 192.168.100.10 -Credential $cred

# If connected, run a test command
hostname

# Exit the session
Exit-PSSession
```

---

## Slack App Setup

### Step 1: Create Slack Workspace (if needed)

1. Go to https://slack.com/get-started#/createnew
2. Enter your email and create a workspace
3. Name it (e.g., "IR-Lab-Workspace")

### Step 2: Create Slack App

1. Go to https://api.slack.com/apps
2. Click **Create New App > From scratch**
3. Enter:
   - App Name: `IR-Playbook-Bot`
   - Workspace: Select your workspace
4. Click **Create App**

### Step 3: Enable Socket Mode

1. Go to **Settings > Socket Mode** (left sidebar)
2. Toggle **Enable Socket Mode** to ON
3. When prompted, create an App-Level Token:
   - Token Name: `socket-mode-token`
   - Add Scope: `connections:write`
4. Click **Generate**
5. **Copy and save the token** (starts with `xapp-`)

### Step 4: Add Slash Command

1. Go to **Features > Slash Commands**
2. Click **Create New Command**
3. Fill in:
   - Command: `/ir`
   - Short Description: `Execute incident response actions`
   - Usage Hint: `[quarantine|status|collect|kill|memdump|help] [target]`
4. Click **Save**

### Step 5: Enable Interactivity

1. Go to **Features > Interactivity & Shortcuts**
2. Toggle **Interactivity** to ON
3. Click **Save Changes**

### Step 6: Configure OAuth Scopes

1. Go to **Features > OAuth & Permissions**
2. Scroll to **Scopes > Bot Token Scopes**
3. Click **Add an OAuth Scope** and add:
   - `chat:write`
   - `chat:write.public`
   - `commands`
   - `users:read`
   - `files:write`

### Step 7: Install App to Workspace

1. Go to **Settings > Install App**
2. Click **Install to Workspace**
3. Click **Allow** to authorize
4. **Copy the Bot User OAuth Token** (starts with `xoxb-`)

### Step 8: Get Signing Secret

1. Go to **Settings > Basic Information**
2. Scroll to **App Credentials**
3. **Copy the Signing Secret**

---

## Bot Configuration

### Step 1: Create Environment File

```bash
cd ir-chatbot
copy .env.example .env
```

### Step 2: Edit .env File

Open `.env` and fill in your values:

```env
# Slack Bot Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here

# PowerShell Remoting Credentials
IR_USERNAME=IRAdmin
IR_PASSWORD=your-vm-admin-password

# Management IPs (allowed during quarantine)
ALLOWED_MANAGEMENT_IPS=192.168.100.1

# Settings
COMMAND_TIMEOUT=300000
LOG_LEVEL=info
AUDIT_LOG_PATH=./logs/audit.log
```

### Step 3: Configure User Roles (Optional)

Edit `src/config/roles.json` to add authorized users:

```json
{
  "users": {
    "U01ABC123XY": {
      "role": "ADMIN",
      "name": "Your Name"
    }
  }
}
```

To find your Slack User ID:
1. Click on your profile in Slack
2. Click the three dots menu
3. Select "Copy member ID"

---

## Running the Bot

### Start the Bot

```bash
cd ir-chatbot
npm start
```

Expected output:
```
[2025-01-01 12:00:00] info: Starting IR Playbook Bot...
[2025-01-01 12:00:01] info: Loaded roles configuration
[2025-01-01 12:00:01] info: IR Playbook Bot is running!
[2025-01-01 12:00:01] info: Commands available: /ir help, /ir status, /ir quarantine, /ir collect, /ir kill, /ir memdump
```

### Development Mode (auto-restart)

```bash
npm run dev
```

---

## Testing

### Test 1: Help Command

In Slack, type:
```
/ir help
```

Expected: Bot responds with available commands.

### Test 2: Status Check

```
/ir status 192.168.100.10
```

Expected: Bot returns system information from the target VM.

### Test 3: Quarantine (Use with Caution)

```
/ir quarantine 192.168.100.10
```

Expected: Bot asks for confirmation, then isolates the host.

### Test 4: Release Quarantine

Click the "Release Quarantine" button after quarantine.

Expected: Network connectivity is restored.

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Access is denied" | LocalAccountTokenFilterPolicy not set | Run registry command on target VM |
| "WinRM client cannot process request" | TrustedHosts not configured | Add target IP to TrustedHosts |
| "The connection was refused" | WinRM not running | Run `Enable-PSRemoting -Force` on target |
| "Target not reachable" | Network issue | Check VM network adapter and IP config |
| "Missing required environment variables" | .env not configured | Copy .env.example to .env and fill values |

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

### Check Logs

```bash
# View combined logs
type logs\combined.log

# View error logs
type logs\error.log

# View audit logs
type logs\audit.log
```

### Test WinRM Manually

```powershell
$cred = Get-Credential
Invoke-Command -ComputerName 192.168.100.10 -Credential $cred -ScriptBlock { hostname }
```

---

## Security Recommendations

1. **Never commit .env file** - It contains secrets
2. **Use strong passwords** for VM admin accounts
3. **Restrict WinRM firewall rules** to management IPs only
4. **Enable RBAC** by setting `requireAuthentication: true` in roles.json
5. **Review audit logs** regularly
6. **Keep VMs isolated** on host-only network

---

## Quick Reference

### Commands

| Command | Description |
|---------|-------------|
| `/ir help` | Show available commands |
| `/ir status <target>` | Get system information |
| `/ir quarantine <target>` | Isolate host from network |
| `/ir collect <target>` | Collect forensic logs |
| `/ir kill <target> <pid>` | Terminate a process |
| `/ir memdump <target> <pid>` | Capture memory dump |

### File Locations

| File | Purpose |
|------|---------|
| `index.js` | Entry point |
| `src/slack/slackApp.js` | Slack handlers |
| `src/services/powershellService.js` | PowerShell execution |
| `src/scripts/*.ps1` | IR PowerShell scripts |
| `src/config/roles.json` | User roles and permissions |
| `src/config/targets.json` | Known targets |
| `logs/audit.log` | Audit trail |
