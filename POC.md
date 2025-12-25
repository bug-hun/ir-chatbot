# IR Playbook Bot - Proof of Concept Guide

## Overview

The IR Playbook Bot is a Slack-integrated incident response tool that enables security teams to remotely execute forensic and containment actions on Windows endpoints via PowerShell Remoting.

**Key Capabilities:**
- Host quarantine/isolation (blocks all network traffic except management)
- Forensic log collection (Security events, PowerShell history, Prefetch, etc.)
- System status checks (processes, connections, persistence, admins)
- Process termination
- Memory dumps

---

## Prerequisites

### Infrastructure
| Component | Details |
|-----------|---------|
| Control Host | Windows machine running the bot (e.g., 192.168.1.32) |
| Target VM(s) | Windows VMs with WinRM enabled (e.g., vm1 = 192.168.1.33) |
| Slack Workspace | Bot installed with Socket Mode enabled |

### Target VM Requirements
```powershell
# Enable WinRM on target VMs (run as Administrator)
Enable-PSRemoting -Force
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "*" -Force

# Ensure firewall allows WinRM
Enable-NetFirewallRule -DisplayGroup "Windows Remote Management"
```

### Environment Variables (.env)
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
IR_USERNAME=DOMAIN\admin
IR_PASSWORD=YourPassword
ALLOWED_MANAGEMENT_IPS=192.168.1.32,192.168.1.1
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

---

## VM-Side Verification Commands

Run these commands on the target VM to verify quarantine status:

### Check Firewall Status
```powershell
# Check firewall profile settings
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction

# Expected output when QUARANTINED:
# Name    Enabled DefaultInboundAction DefaultOutboundAction
# ----    ------- -------------------- ---------------------
# Domain     True                Block                 Block
# Private    True                Block                 Block
# Public     True                Block                 Block
```

### Check IR Isolation Rules
```powershell
# List all IR isolation firewall rules
Get-NetFirewallRule -DisplayName "IR-ISOLATION*" | Format-Table DisplayName, Enabled, Direction, Action

# Expected output when QUARANTINED (5 rules):
# DisplayName                            Enabled Direction Action
# -----------                            ------- --------- ------
# IR-ISOLATION-Allow-Mgmt-Inbound          True   Inbound  Allow
# IR-ISOLATION-Allow-Mgmt-Outbound         True  Outbound  Allow
# IR-ISOLATION-Block-TCP-Out               True  Outbound  Block
# IR-ISOLATION-Block-UDP-Out               True  Outbound  Block
# IR-ISOLATION-Block-ICMP-Out              True  Outbound  Block
```

### Test Network Connectivity
```powershell
# Test ping (should FAIL when quarantined)
ping google.com
ping 8.8.8.8

# Test web connection (should FAIL when quarantined)
Test-NetConnection -ComputerName google.com -Port 443
```

### Check DNS Settings
```powershell
# Check DNS server configuration
Get-DnsClientServerAddress | Select InterfaceAlias, ServerAddresses

# When quarantined: DNS is redirected to 127.0.0.127 (invalid)
```

---

## Demo Flow

### Phase 1: Before Quarantine (Normal State)

**On Target VM (192.168.1.33):**
```powershell
# 1. Verify network connectivity works
ping google.com
# Result: Reply from 142.250.xxx.xxx

# 2. Check no isolation rules exist
Get-NetFirewallRule -DisplayName "IR-ISOLATION*"
# Result: (empty)

# 3. Check firewall defaults
Get-NetFirewallProfile | Select Name, DefaultOutboundAction
# Result: DefaultOutboundAction = Allow
```

**In Slack:**
```
/ir status vm1
```
Expected: Shows "QUARANTINE STATUS: NOT ISOLATED"

---

### Phase 2: Execute Quarantine

**In Slack:**
```
/ir quarantine vm1
```
1. Review the confirmation dialog
2. Click "Confirm Quarantine"
3. Wait for success message

**Expected Response:**
- Status: ISOLATED
- Shows menu buttons: Release, Collect Logs, View Status

---

### Phase 3: Verify Quarantine (on VM)

**On Target VM (192.168.1.33):**
```powershell
# 1. Test ping - should FAIL
ping google.com
# Result: Request timed out / Transmit failed

ping 8.8.8.8
# Result: Request timed out / Transmit failed

# 2. Check isolation rules exist
Get-NetFirewallRule -DisplayName "IR-ISOLATION*" | Select DisplayName, Action
# Result: Shows 6 rules (2 Allow for management, 4 Block)

# 3. Check firewall defaults
Get-NetFirewallProfile | Select Name, DefaultOutboundAction
# Result: DefaultOutboundAction = Block

# 4. Verify WinRM still works (from control host)
# This proves management access is preserved
```

**In Slack:**
```
/ir status vm1
```
Expected: Shows "QUARANTINE STATUS: ISOLATED" with evidence:
- "IR-ISOLATION firewall rules found: 6 rules"
- "Outbound traffic BLOCKED on: Domain, Private, Public"

---

### Phase 4: Release Quarantine

**In Slack:**
```
/ir release vm1
```
OR click "Release Quarantine" button from the quarantine success message.

**Expected Response:**
- Status: ONLINE
- Shows actions performed (rules removed, DNS reset, etc.)

---

### Phase 5: Verify Release (on VM)

**On Target VM (192.168.1.33):**
```powershell
# 1. Test ping - should WORK again
ping google.com
# Result: Reply from 142.250.xxx.xxx

# 2. Check isolation rules removed
Get-NetFirewallRule -DisplayName "IR-ISOLATION*"
# Result: (empty)

# 3. Check firewall defaults restored
Get-NetFirewallProfile | Select Name, DefaultOutboundAction
# Result: DefaultOutboundAction = Allow
```

**In Slack:**
```
/ir status vm1
```
Expected: Shows "QUARANTINE STATUS: NOT ISOLATED"

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

## Collect Logs Demo

**In Slack:**
```
/ir collect vm1
```

**Expected:**
- Progress indicator while collecting
- Success message showing:
  - Event count (e.g., 598 events)
  - Archive size (e.g., 4.66 MB)
  - Local path where logs are saved

**Collected Artifacts:**
- Security Event Logs (logons, process creation)
- System and Application Logs
- PowerShell Command History
- Prefetch Files
- Network Configuration

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
| Ping still works after quarantine | Ensure explicit block rules are created (check IR-ISOLATION rules) |
| Cannot connect to VM after quarantine | Ensure your IP is in ALLOWED_MANAGEMENT_IPS |
| Bot not responding | Check `npm start` is running, verify Slack tokens |
| WinRM connection failed | Run `Enable-PSRemoting -Force` on target VM |

---

## Security Considerations

1. **Credentials**: Store IR credentials securely; use service accounts with minimal privileges
2. **Network Segmentation**: Management IPs should be on a separate VLAN
3. **Audit Logging**: All actions are logged to `logs/` directory
4. **Role-Based Access**: Configure user roles in Slack for authorization
5. **Recovery**: Always have console access to VMs for emergency recovery

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/scripts/Quarantine-Host.ps1` | Isolates/releases hosts |
| `src/scripts/Get-SystemInfo.ps1` | Collects system status |
| `src/scripts/Collect-Logs.ps1` | Gathers forensic artifacts |
| `src/slack/slackApp.js` | Slack command handlers |
| `config/targets.json` | Target VM configuration |
| `collected-logs/` | Downloaded log archives |
