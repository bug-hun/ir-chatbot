# Quarantine-Host.ps1
# Isolates a host from the network while allowing management access
# Parameters: $Isolate (bool), $AllowedHosts (string[])

# Default parameters - only set if not already defined by caller
if ($null -eq $Isolate) { $Isolate = $true }
if ($null -eq $AllowedHosts -or $AllowedHosts.Count -eq 0) { $AllowedHosts = @("192.168.100.1") }

$ErrorActionPreference = 'Stop'

if ($Isolate) {
    Write-Host "[*] Starting host isolation on $env:COMPUTERNAME..."

    # Step 1: Enable Windows Firewall on all profiles
    Write-Host "[*] Enabling Windows Firewall..."
    Set-NetFirewallProfile -Profile Domain, Public, Private -Enabled True

    # Step 2: Remove any existing isolation rules
    Write-Host "[*] Removing existing isolation rules..."
    Get-NetFirewallRule -DisplayName "IR-ISOLATION*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

    # Step 3: Create ALLOW rules for management IPs FIRST (Windows evaluates Allow before Block)
    Write-Host "[*] Creating allow rules for management IPs: $($AllowedHosts -join ', ')..."

    # Allow inbound from management (for WinRM, RDP, SSH)
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Inbound" -Direction Inbound `
        -Action Allow -RemoteAddress $AllowedHosts -Enabled True -Profile Any | Out-Null

    # Allow outbound to management
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Outbound" -Direction Outbound `
        -Action Allow -RemoteAddress $AllowedHosts -Enabled True -Profile Any | Out-Null

    # Step 4: Create EXPLICIT BLOCK rules for ALL traffic (these apply to non-whitelisted IPs)
    Write-Host "[*] Creating explicit block rules for all other traffic..."

    # Block ALL outbound TCP
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Block-TCP-Out" -Direction Outbound `
        -Action Block -Protocol TCP -Enabled True -Profile Any | Out-Null

    # Block ALL outbound UDP
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Block-UDP-Out" -Direction Outbound `
        -Action Block -Protocol UDP -Enabled True -Profile Any | Out-Null

    # Block ALL outbound ICMP (ping)
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Block-ICMP-Out" -Direction Outbound `
        -Action Block -Protocol ICMPv4 -Enabled True -Profile Any | Out-Null

    # NOTE: We do NOT create an explicit "Block All Inbound" rule because it would
    # override our "Allow Management Inbound" rule. Instead, we rely on the
    # DefaultInboundAction = Block setting, which works WITH explicit Allow rules.

    # Step 5: Set default actions to Block (this works WITH Allow rules)
    Write-Host "[*] Setting default firewall actions to Block..."
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultOutboundAction Block
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultInboundAction Block

    # Step 6: Clear DNS cache to prevent cached lookups
    Write-Host "[*] Clearing DNS cache..."
    Clear-DnsClientCache

    # Step 7: Set DNS to localhost to prevent new DNS resolutions
    Write-Host "[*] Redirecting DNS..."
    Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object {
        if ($_.ServerAddresses) {
            Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ServerAddresses "127.0.0.127"
        }
    }

    # Step 8: Stop SMB services to prevent lateral movement
    Write-Host "[*] Stopping SMB services..."
    Stop-Service -Name LanmanWorkstation -Force -ErrorAction SilentlyContinue
    Stop-Service -Name LanmanServer -Force -ErrorAction SilentlyContinue

    Write-Host "[+] Host isolation complete"

    # Get rule count for verification
    $ruleCount = (Get-NetFirewallRule -DisplayName "IR-ISOLATION*" -ErrorAction SilentlyContinue | Measure-Object).Count

    # Return status as JSON
    @{
        Status       = "Isolated"
        Hostname     = $env:COMPUTERNAME
        AllowedHosts = $AllowedHosts
        RulesCreated = $ruleCount
        Timestamp    = (Get-Date).ToString('o')
        Actions      = @(
            "Firewall enabled on all profiles",
            "Explicit block rules created for TCP/UDP/ICMP",
            "Management IPs whitelisted",
            "Default actions set to Block",
            "DNS cache cleared and redirected",
            "SMB services stopped"
        )
    } | ConvertTo-Json -Compress

} else {
    Write-Host "[*] Restoring connectivity on $env:COMPUTERNAME..."

    # Step 1: Remove ALL isolation firewall rules
    Write-Host "[*] Removing all isolation rules..."
    Get-NetFirewallRule -DisplayName "IR-ISOLATION*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

    # Step 2: Set default actions back to allow
    Write-Host "[*] Restoring firewall defaults..."
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultOutboundAction Allow
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultInboundAction Block

    # Step 3: Reset DNS to DHCP
    Write-Host "[*] Resetting DNS configuration..."
    Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object {
        Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ResetServerAddresses
    }

    # Step 4: Clear DNS cache
    Clear-DnsClientCache

    # Step 5: Restart SMB services
    Write-Host "[*] Restarting SMB services..."
    Start-Service -Name LanmanWorkstation -ErrorAction SilentlyContinue
    Start-Service -Name LanmanServer -ErrorAction SilentlyContinue

    Write-Host "[+] Connectivity restored"

    # Return status as JSON
    @{
        Status    = "Released"
        Hostname  = $env:COMPUTERNAME
        Timestamp = (Get-Date).ToString('o')
        Actions   = @(
            "All IR-ISOLATION firewall rules removed",
            "Default outbound action set to Allow",
            "DNS configuration reset to DHCP",
            "SMB services restarted"
        )
    } | ConvertTo-Json -Compress
}
