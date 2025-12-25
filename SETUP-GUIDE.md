# IR Playbook Bot - Complete Setup Guide

A step-by-step guide to set up and run the Incident Response Playbook Bot.

---

## Table of Contents

1. [How It All Works](#how-it-all-works)
2. [Quick Overview](#quick-overview)
3. [Step 1: Slack App Configuration](#step-1-slack-app-configuration)
4. [Step 2: Configure the Bot](#step-2-configure-the-bot)
5. [Step 3: VirtualBox VM Setup](#step-3-virtualbox-vm-setup)
6. [Step 4: PowerShell Remoting](#step-4-powershell-remoting)
7. [Step 5: Run the Bot](#step-5-run-the-bot)
8. [Command Reference](#command-reference)
9. [Troubleshooting](#troubleshooting)

---

## How It All Works

### The Big Picture

This bot allows you to perform **Incident Response actions** on remote Windows machines directly from Slack. Here's how each component works together:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           IR PLAYBOOK BOT ARCHITECTURE                           │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   YOU (Slack)              YOUR PC                    TARGET VMs                 │
│   ┌─────────┐         ┌─────────────────┐         ┌─────────────────┐           │
│   │  /ir    │         │   Node.js Bot   │         │  Windows VM     │           │
│   │ command │────────▶│   (index.js)    │────────▶│  192.168.1.33   │           │
│   │         │   ①     │        │        │   ③     │                 │           │
│   └─────────┘         │        ▼        │         └─────────────────┘           │
│        ▲              │  ┌───────────┐  │                                       │
│        │              │  │PowerShell │  │         ┌─────────────────┐           │
│        │              │  │ Scripts   │  │────────▶│  Windows VM     │           │
│        │              │  └───────────┘  │   ③     │  192.168.1.34   │           │
│        │      ②      │        │        │         │                 │           │
│        └──────────────│────────┘        │         └─────────────────┘           │
│                       └─────────────────┘                                       │
│                                                                                  │
│   ① Slack sends your command to the bot via Socket Mode (WebSocket)             │
│   ② Bot processes command and sends response back to Slack                      │
│   ③ Bot executes PowerShell remotely on target VMs via WinRM                    │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### What is WinRM (Windows Remote Management)?

**WinRM** is Windows' built-in remote management protocol. Think of it like SSH for Windows.

| Feature | Description |
|---------|-------------|
| **Protocol** | HTTP-based (port 5985) or HTTPS (port 5986) |
| **Purpose** | Execute PowerShell commands on remote Windows machines |
| **Security** | Uses Windows authentication (username/password or Kerberos) |
| **Used For** | Remote administration, automation, configuration management |

**Why we use WinRM:**
- Built into Windows (no extra software needed)
- Executes PowerShell natively on remote machines
- Returns structured results (not just text)
- Supports encrypted communication

### What We Configured and Why

#### On Target VMs (the machines you'll investigate):

| Command | What It Does | Why It's Needed |
|---------|--------------|-----------------|
| `Enable-PSRemoting -Force` | Starts WinRM service, creates firewall rule, enables remote connections | VMs must accept incoming PowerShell connections |
| `LocalAccountTokenFilterPolicy = 1` | Allows local admin accounts to have full privileges remotely | Without this, even admin accounts get restricted tokens |
| `New-LocalUser "IRAdmin"` | Creates a dedicated account for the bot | Security best practice - don't use your personal account |
| `Add-LocalGroupMember -Group "Administrators"` | Gives IRAdmin full admin rights | IR actions need admin privileges (kill processes, access logs) |

#### On Your Main PC (where the bot runs):

| Command | What It Does | Why It's Needed |
|---------|--------------|-----------------|
| `Enable-PSRemoting -Force` | Enables your PC to make remote connections | Your PC initiates connections to VMs |
| `Set-Item TrustedHosts -Value "192.168.1.33,192.168.1.34"` | Tells your PC to trust these IPs | WinRM requires explicit trust for non-domain machines |

### What is Socket Mode (Slack)?

**Socket Mode** allows your bot to receive Slack events via WebSocket instead of HTTP webhooks.

| Traditional Method | Socket Mode |
|-------------------|-------------|
| Requires public URL (ngrok) | No public URL needed |
| Slack pushes to your server | Bot pulls from Slack |
| Firewall issues | Works behind any firewall |
| Complex setup | Simple setup |

**How it works:**
1. Your bot connects to Slack via WebSocket (outbound connection)
2. Slack sends commands through this connection
3. Your bot processes and responds through the same connection

### The Three Slack Tokens Explained

| Token | Prefix | Purpose | Where to Find |
|-------|--------|---------|---------------|
| **Bot Token** | `xoxb-` | Authenticates your bot to send messages | OAuth & Permissions page |
| **Signing Secret** | (no prefix) | Verifies requests are actually from Slack | Basic Information page |
| **App Token** | `xapp-` | Enables Socket Mode connection | App-Level Tokens page |

### Network Configuration Explained

We're using **Bridged Networking** in VirtualBox:

```
┌─────────────────────────────────────────────────────────────────┐
│                     YOUR HOME NETWORK                           │
│                        192.168.1.x                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   Router    │    │  Your PC    │    │  Target VMs │        │
│   │ 192.168.1.1 │◄──▶│ 192.168.1.? │◄──▶│ .33 and .34 │        │
│   │             │    │  (Bot runs  │    │             │        │
│   │             │    │   here)     │    │             │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Bridged Mode** = VMs get real IPs from your router, just like physical devices on your network.

---

## Quick Overview

### What This Bot Does

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Slack     │────▶│   Node.js   │────▶│  PowerShell  │────▶│  Target VM  │
│  (You type  │     │   Bot       │     │  (WinRM)     │     │  (Windows)  │
│   /ir cmd)  │     │             │     │              │     │             │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
```

### Available Commands

| Command | What It Does |
|---------|--------------|
| `/ir help` | Shows all available commands |
| `/ir status <target>` | Gets system info (processes, connections, persistence) |
| `/ir quarantine <target>` | Isolates host from network |
| `/ir collect <target>` | Collects forensic logs |
| `/ir kill <target> <pid>` | Terminates a process |
| `/ir memdump <target> <pid>` | Dumps process memory |

---

## Step 1: Slack App Configuration

You've already created the Slack App! Here's what you need to collect:

### 1.1 Get Your Bot Token (xoxb-...)

1. Go to https://api.slack.com/apps
2. Click on your app **"IR-Playbook-Bot"**
3. Go to **OAuth & Permissions** (left sidebar)
4. Copy the **Bot User OAuth Token**
   - It looks like: `xoxb-1234567890123-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx`

### 1.2 Get Your Signing Secret

1. Go to **Basic Information** (left sidebar)
2. Scroll to **App Credentials**
3. Click **Show** next to **Signing Secret**
4. Copy the secret
   - It looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### 1.3 You Already Have Your App Token

From your Notes.txt:
```
xapp-1-A0A5F1M7EE9-10216798284720-2d0249ad5daf228d678354aa6aa61ea8283b261e229298df2d360e1b0b73f06a
```

### 1.4 Verification Checklist

Make sure you have enabled:

- [x] **Socket Mode** - Settings > Socket Mode > Enabled
- [x] **Slash Command** - Features > Slash Commands > `/ir` created
- [x] **Interactivity** - Features > Interactivity & Shortcuts > Enabled
- [x] **OAuth Scopes**:
  - `chat:write`
  - `chat:write.public`
  - `commands`
  - `users:read`
  - `files:write`
- [x] **App Installed** - Settings > Install App > Installed to Workspace

---

## Step 2: Configure the Bot

### 2.1 Create Your .env File

Navigate to the bot directory and create your configuration:

```powershell
# Open the directory
cd "C:\Users\thunder\Desktop\research\tools\Incident Response Playbook Bot\ir-chatbot"

# Copy the example file
copy .env.example .env

# Open in notepad to edit
notepad .env
```

### 2.2 Fill In Your Tokens

Edit `.env` and replace the placeholder values:

```env
# ========================================
# SLACK CONFIGURATION
# ========================================

# Bot User OAuth Token (from OAuth & Permissions page)
# Starts with xoxb-
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN-HERE

# Signing Secret (from Basic Information page)
SLACK_SIGNING_SECRET=YOUR-SIGNING-SECRET-HERE

# App-Level Token for Socket Mode (you already have this!)
SLACK_APP_TOKEN=xapp-1-A0A5F1M7EE9-10216798284720-2d0249ad5daf228d678354aa6aa61ea8283b261e229298df2d360e1b0b73f06a

# ========================================
# POWERSHELL REMOTING CREDENTIALS
# ========================================

# Username for connecting to target VMs
# This will be the admin account you create on VMs
IR_USERNAME=IRAdmin

# Password for the IR admin account
IR_PASSWORD=YourStrongPassword123!

# ========================================
# MANAGEMENT IPS
# ========================================

# IPs allowed during quarantine (comma-separated)
# This is your host machine's VirtualBox adapter IP
ALLOWED_MANAGEMENT_IPS=192.168.100.1

# ========================================
# OPTIONAL SETTINGS
# ========================================

# Command timeout in milliseconds (5 minutes default)
COMMAND_TIMEOUT=300000

# Log level: debug, info, warn, error
LOG_LEVEL=info

# Audit log location
AUDIT_LOG_PATH=./logs/audit.log
```

---

## Step 3: VirtualBox VM Setup

### 3.1 Network Options

We recommend **Bridged Adapter** as it's the simplest and most reliable:

| Network Type | Pros | Cons |
|--------------|------|------|
| **Bridged (Recommended)** | Just works, VMs get real IPs from router | VMs have internet access |
| Host-Only | Isolated network | Driver issues common on some systems |

### 3.2 Create Windows VM

1. In VirtualBox, click **New**
2. Configure:
   - **Name:** `IR-Target-01`
   - **Type:** Microsoft Windows
   - **Version:** Windows 10 (64-bit) or Windows 11 (64-bit)
   - **Memory:** 4096 MB
   - **Hard disk:** Create new, 60 GB, VDI, Dynamic

3. **Before starting**, go to **Settings > Network**:
   - **Adapter 1:** Attached to **Bridged Adapter**
   - **Name:** Select your real network adapter (Wi-Fi or Ethernet)

4. Mount Windows ISO and install Windows

5. **Clone for more VMs:** Right-click VM > Clone > Full Clone

### 3.3 Get VM IP Addresses

After Windows is installed, open PowerShell in each VM:

```powershell
ipconfig
```

Your VMs will get IPs from your router automatically (e.g., 192.168.1.33, 192.168.1.34).

**Write down your VM IPs:**
- VM1: `192.168.1.33`
- VM2: `192.168.1.34`

### 3.4 Test Connectivity

From your **main PC**, test ping:

```powershell
ping 192.168.1.33
ping 192.168.1.34
```

If ping fails, enable ICMP on each VM (PowerShell as Admin):

```powershell
New-NetFirewallRule -DisplayName "Allow ICMPv4" -Protocol ICMPv4 -IcmpType 8 -Enabled True -Direction Inbound -Action Allow
```

---

## Step 4: PowerShell Remoting

This is the **critical step** that enables remote command execution.

### 4.1 Configure Target VMs

Run these commands on **each target VM** (PowerShell as Administrator):

```powershell
# =====================================================
# RUN THIS ON EACH VM (192.168.1.33, 192.168.1.34, etc.)
# =====================================================

# Step 1: Set Network Profile to Private (IMPORTANT!)
# WinRM doesn't work on Public networks by default
# First, find your network interface name:
Get-NetAdapter | Select-Object Name, Status

# Then set it to Private (replace "Ethernet" with your actual interface name):
Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private

# Step 2: Enable PowerShell Remoting
# This starts the WinRM service and creates firewall rules
Enable-PSRemoting -SkipNetworkProfileCheck -Force

# Step 3: Allow remote admin access for local accounts
# Without this, local admin accounts get restricted tokens remotely
New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' `
    -Name 'LocalAccountTokenFilterPolicy' -Value 1 -PropertyType DWORD -Force

# Step 4: Create IR Admin Account (for the bot to use)
$Password = ConvertTo-SecureString "IRLabPass123!" -AsPlainText -Force
New-LocalUser "IRAdmin" -Password $Password -FullName "IR Admin" -Description "IR Bot Account"
Add-LocalGroupMember -Group "Administrators" -Member "IRAdmin"

# Step 5: Enable ping (for testing connectivity)
New-NetFirewallRule -DisplayName "Allow ICMPv4" -Protocol ICMPv4 -IcmpType 8 -Enabled True -Direction Inbound -Action Allow

# Step 6: Restart WinRM to apply changes
Restart-Service WinRM

# Step 7: Verify WinRM is listening
winrm enumerate winrm/config/listener
```

### 4.1.1 Troubleshooting Network Profile

If you get "Object not found" when setting network profile:

```powershell
# List all network connections to find correct name
Get-NetConnectionProfile

# Use the InterfaceAlias shown (e.g., "Ethernet 2", "Wi-Fi", etc.)
Set-NetConnectionProfile -InterfaceAlias "YOUR-INTERFACE-NAME" -NetworkCategory Private
```

### 4.2 Configure Your Host Machine (Main PC)

Run these commands on your **main PC** where the bot runs (PowerShell as Administrator):

```powershell
# =====================================================
# RUN THIS ON YOUR MAIN PC
# =====================================================

# Step 1: Enable PowerShell Remoting on host
Enable-PSRemoting -SkipNetworkProfileCheck -Force

# Step 2: Add VMs to TrustedHosts
# WinRM requires explicit trust for non-domain machines
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.1.33,192.168.1.34" -Force

# Step 3: Verify TrustedHosts is set
Get-Item WSMan:\localhost\Client\TrustedHosts
```

### 4.3 Test Connection

Test connectivity from your main PC to a VM:

```powershell
# Test WinRM service is reachable
Test-WSMan 192.168.1.33

# Test full connection (enter password: IRLabPass123!)
$cred = Get-Credential -UserName "IRAdmin"
Enter-PSSession -ComputerName 192.168.1.33 -Credential $cred

# If connected, run a test command
hostname
whoami

# Exit
Exit-PSSession
```

---

## Step 5: Run the Bot

### 5.1 Start the Bot

Open a new PowerShell window:

```powershell
# Navigate to bot directory
cd "C:\Users\thunder\Desktop\research\tools\Incident Response Playbook Bot\ir-chatbot"

# Start the bot
npm start
```

### 5.2 Expected Output

```
[2025-12-25 12:00:00] info: Starting IR Playbook Bot...
[2025-12-25 12:00:01] info: Loaded roles configuration
[2025-12-25 12:00:01] info: IR Playbook Bot is running!
[2025-12-25 12:00:01] info: Commands available: /ir help, /ir status, /ir quarantine, /ir collect, /ir kill, /ir memdump
```

### 5.3 Test in Slack

Open Slack and try:

```
/ir help
```

You should see a beautifully formatted help message!

---

## Command Reference

### Basic Commands

#### `/ir help`
Shows all available commands with examples.

#### `/ir status <target>`
**Purpose:** Get comprehensive system information from a remote host.

**What it collects:**
- Running processes with command lines
- Network connections (especially external)
- Persistence mechanisms (registry, scheduled tasks, services)
- Local administrator accounts
- Recent security events

**Example:**
```
/ir status 192.168.100.10
/ir status IR-Target-01
```

#### `/ir quarantine <target>`
**Purpose:** Isolate a compromised host from the network.

**What it does:**
1. Enables Windows Firewall on all profiles
2. Blocks all outbound traffic
3. Allows only management IPs (for continued access)
4. Clears DNS cache
5. Stops SMB services (prevents lateral movement)

**Example:**
```
/ir quarantine 192.168.100.10
```

**To reverse:**
Click the "Release Quarantine" button after quarantine completes.

#### `/ir collect <target>`
**Purpose:** Collect forensic artifacts for investigation.

**What it collects:**
- Security Event Logs (logons, process creation, privilege use)
- System and Application logs
- PowerShell command history
- Prefetch files
- Browser history (Chrome, Edge)
- Network configuration
- Running processes snapshot
- Services list

**Example:**
```
/ir collect 192.168.100.10
```

### Advanced Commands

#### `/ir kill <target> <pid|name>`
**Purpose:** Forcefully terminate a process.

**Examples:**
```
/ir kill 192.168.100.10 4532       # Kill by PID
/ir kill 192.168.100.10 notepad   # Kill by process name
/ir kill 192.168.100.10 malware.exe
```

#### `/ir memdump <target> <pid>`
**Purpose:** Capture memory dump of a process for analysis.

**Example:**
```
/ir memdump 192.168.100.10 1234
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Access is denied` | LocalAccountTokenFilterPolicy not set | Run registry command on target VM |
| `WinRM cannot process request` | TrustedHosts not configured | Add VM IP to TrustedHosts on host |
| `Connection refused` | WinRM not running | Run `Enable-PSRemoting -Force` on target |
| `Target not reachable` | Network issue | Check VM adapter is Host-only, verify IP config |
| `Missing environment variables` | .env not configured | Copy .env.example to .env and fill values |
| `Invalid token` | Wrong Slack token | Re-copy tokens from Slack app settings |

### Debug Mode

Enable verbose logging:

1. Edit `.env`:
   ```env
   LOG_LEVEL=debug
   ```

2. Restart the bot:
   ```powershell
   npm start
   ```

### View Logs

```powershell
# View all logs
type logs\combined.log

# View errors only
type logs\error.log

# View audit trail
type logs\audit.log
```

### Test WinRM Manually

```powershell
# Test basic connectivity
Test-WSMan 192.168.100.10

# Test with credentials
$cred = Get-Credential -UserName "192.168.100.10\IRAdmin"
Invoke-Command -ComputerName 192.168.100.10 -Credential $cred -ScriptBlock { hostname }
```

---

## File Structure

```
ir-chatbot/
├── .env                    # Your configuration (NEVER commit)
├── .env.example            # Template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies
├── index.js                # Entry point
├── SETUP-GUIDE.md          # This file
│
├── src/
│   ├── slack/
│   │   └── slackApp.js     # Slack command handlers
│   │
│   ├── services/
│   │   ├── powershellService.js  # Remote execution
│   │   ├── auditService.js       # Logging
│   │   └── incidentService.js    # Business logic
│   │
│   ├── middleware/
│   │   └── authMiddleware.js     # RBAC
│   │
│   ├── scripts/                  # PowerShell IR scripts
│   │   ├── Get-SystemInfo.ps1
│   │   ├── Quarantine-Host.ps1
│   │   ├── Collect-Logs.ps1
│   │   ├── Kill-Process.ps1
│   │   └── Get-MemoryDump.ps1
│   │
│   ├── config/
│   │   ├── roles.json           # User permissions
│   │   └── targets.json         # Known hosts
│   │
│   └── utils/
│       └── logger.js            # Logging utility
│
├── logs/                        # Generated logs
│   ├── combined.log
│   ├── error.log
│   └── audit.log
│
└── docs/
    ├── deployment-guide.md      # Detailed guide
    └── demo-transcript.md       # Demo examples
```

---

## Next Steps

1. **Get remaining Slack tokens** - You need the Bot Token (xoxb-) and Signing Secret
2. **Download Windows ISO** - From Microsoft Evaluation Center
3. **Set up VMs** - Create at least one target VM
4. **Configure WinRM** - Run PowerShell commands on both host and VMs
5. **Test the bot** - `/ir help` should work!

---

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Enable debug logging
3. Check the audit logs for details

Happy Incident Response!
