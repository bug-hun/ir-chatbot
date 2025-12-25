# Get-SystemInfo.ps1
# Collects comprehensive system information for incident response
# Returns: Hashtable with Processes, Connections, Autoruns, Admins

$ErrorActionPreference = 'SilentlyContinue'
$results = @{}

# =====================
# RUNNING PROCESSES
# =====================
$results.Processes = Get-CimInstance Win32_Process | ForEach-Object {
    $owner = try {
        $ownerInfo = Invoke-CimMethod -InputObject $_ -MethodName GetOwner
        if ($ownerInfo.Domain) {
            "$($ownerInfo.Domain)\$($ownerInfo.User)"
        } else {
            $ownerInfo.User
        }
    } catch {
        "Unknown"
    }

    [PSCustomObject]@{
        ProcessId   = $_.ProcessId
        Name        = $_.Name
        Path        = $_.ExecutablePath
        CommandLine = $_.CommandLine
        Owner       = $owner
        ParentPid   = $_.ParentProcessId
    }
} | Where-Object { $_.Name }

# =====================
# NETWORK CONNECTIONS
# =====================
$results.Connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ForEach-Object {
    $processName = try {
        (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    } catch {
        "Unknown"
    }

    [PSCustomObject]@{
        LocalAddress  = $_.LocalAddress
        LocalPort     = $_.LocalPort
        RemoteAddress = $_.RemoteAddress
        RemotePort    = $_.RemotePort
        State         = $_.State
        Process       = $processName
        ProcessId     = $_.OwningProcess
    }
}

# =====================
# PERSISTENCE (AUTORUNS)
# =====================
$results.Autoruns = @()

# Registry Run keys
$runKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"
)

foreach ($key in $runKeys) {
    if (Test-Path $key) {
        $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
        if ($props) {
            $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object {
                $results.Autoruns += [PSCustomObject]@{
                    Location = $key
                    Name     = $_.Name
                    Value    = $_.Value
                    Type     = "Registry"
                }
            }
        }
    }
}

# Scheduled Tasks (non-Microsoft)
$tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.TaskPath -notmatch '^\\Microsoft' -and $_.State -ne 'Disabled'
}

foreach ($task in $tasks) {
    $results.Autoruns += [PSCustomObject]@{
        Location = $task.TaskPath
        Name     = $task.TaskName
        Value    = ($task.Actions | Select-Object -First 1).Execute
        Type     = "ScheduledTask"
    }
}

# Services (non-Microsoft, auto-start)
$services = Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object {
    $_.StartMode -eq 'Auto' -and $_.PathName -notmatch 'Windows\\System32|svchost\.exe'
}

foreach ($svc in $services) {
    $results.Autoruns += [PSCustomObject]@{
        Location = "Services"
        Name     = $svc.Name
        Value    = $svc.PathName
        Type     = "Service"
    }
}

# =====================
# LOCAL ADMINISTRATORS
# =====================
$results.Admins = Get-LocalGroupMember -Group "Administrators" -ErrorAction SilentlyContinue | ForEach-Object {
    [PSCustomObject]@{
        Name        = $_.Name
        ObjectClass = $_.ObjectClass
        Source      = $_.PrincipalSource
    }
}

# =====================
# ADDITIONAL INFO
# =====================
$results.SystemInfo = [PSCustomObject]@{
    Hostname     = $env:COMPUTERNAME
    Domain       = $env:USERDOMAIN
    CurrentUser  = $env:USERNAME
    OS           = (Get-CimInstance Win32_OperatingSystem).Caption
    OSVersion    = (Get-CimInstance Win32_OperatingSystem).Version
    LastBoot     = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    Architecture = $env:PROCESSOR_ARCHITECTURE
}

# =====================
# QUARANTINE STATUS CHECK
# =====================
$quarantineRules = Get-NetFirewallRule -DisplayName "IR-ISOLATION*" -ErrorAction SilentlyContinue
$firewallProfile = Get-NetFirewallProfile -ErrorAction SilentlyContinue

$isQuarantined = $false
$quarantineEvidence = @()

if ($quarantineRules) {
    $isQuarantined = $true
    $quarantineEvidence += "IR-ISOLATION firewall rules found: $($quarantineRules.Count) rules"
}

$blockedProfiles = $firewallProfile | Where-Object { $_.DefaultOutboundAction -eq 'Block' }
if ($blockedProfiles) {
    $isQuarantined = $true
    $quarantineEvidence += "Outbound traffic BLOCKED on: $($blockedProfiles.Name -join ', ')"
}

$results.QuarantineStatus = [PSCustomObject]@{
    IsQuarantined = $isQuarantined
    Evidence      = $quarantineEvidence
    FirewallRules = $quarantineRules | Select-Object DisplayName, Enabled, Direction, Action
    ProfileStatus = $firewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction
}

# =====================
# RECENT SECURITY EVENTS (last 24 hours)
# =====================
$oneDayAgo = (Get-Date).AddDays(-1)
$securityEvents = Get-WinEvent -FilterHashtable @{
    LogName   = 'Security'
    StartTime = $oneDayAgo
    Id        = @(4624, 4625, 4648, 4672, 4688)
} -MaxEvents 100 -ErrorAction SilentlyContinue

$results.RecentSecurityEvents = $securityEvents | ForEach-Object {
    [PSCustomObject]@{
        TimeCreated = $_.TimeCreated
        EventId     = $_.Id
        Message     = ($_.Message -split "`n")[0]  # First line only
    }
}

# Return results as JSON
$results | ConvertTo-Json -Depth 5 -Compress
