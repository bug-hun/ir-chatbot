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

    # Step 3: Set DEFAULT actions to Block FIRST
    # This is the key - Default actions are overridden by explicit Allow rules
    # But explicit Block rules would override Allow rules (which we don't want)
    Write-Host "[*] Setting default firewall actions to Block..."
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultOutboundAction Block
    Set-NetFirewallProfile -Profile Domain, Public, Private -DefaultInboundAction Block

    # Step 4: Create ALLOW rules for management IPs
    # These Allow rules will override the Default Block action
    Write-Host "[*] Creating allow rules for management IPs: $($AllowedHosts -join ', ')..."

    # Allow inbound from management (for WinRM, RDP, SSH)
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Inbound" -Direction Inbound `
        -Action Allow -RemoteAddress $AllowedHosts -Enabled True -Profile Any | Out-Null

    # Allow outbound to management
    New-NetFirewallRule -DisplayName "IR-ISOLATION-Allow-Mgmt-Outbound" -Direction Outbound `
        -Action Allow -RemoteAddress $AllowedHosts -Enabled True -Profile Any | Out-Null

    # NOTE: We do NOT create explicit Block rules because they would override our Allow rules.
    # The DefaultOutboundAction = Block handles blocking everything except whitelisted IPs.

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
            "Default outbound/inbound actions set to Block",
            "Management IPs whitelisted: $($AllowedHosts -join ', ')",
            "DNS cache cleared and redirected to localhost",
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
