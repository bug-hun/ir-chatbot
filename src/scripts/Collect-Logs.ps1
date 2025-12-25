# Collect-Logs.ps1
# Collects forensic artifacts from the target system
# Parameters: $OutputPath (string), $DaysBack (int)

# Default parameters
if (-not $PSBoundParameters.ContainsKey('DaysBack')) { $DaysBack = 7 }
if (-not $PSBoundParameters.ContainsKey('OutputPath')) {
    $OutputPath = "$env:TEMP\IR-Logs-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "[*] Starting log collection on $env:COMPUTERNAME..."
Write-Host "[*] Output path: $OutputPath"
Write-Host "[*] Days back: $DaysBack"

# Create output directory
New-Item -Path $OutputPath -ItemType Directory -Force | Out-Null

$startDate = (Get-Date).AddDays(-$DaysBack)
$collectedItems = @()

# =====================
# SECURITY EVENTS
# =====================
Write-Host "[*] Collecting Security events..."

# Key security Event IDs for IR
$securityIDs = @(
    4624,  # Successful logon
    4625,  # Failed logon
    4634,  # Logoff
    4648,  # Explicit credential logon
    4672,  # Special privileges assigned
    4688,  # Process creation
    4689,  # Process termination
    4697,  # Service installed
    4698,  # Scheduled task created
    4699,  # Scheduled task deleted
    4700,  # Scheduled task enabled
    4701,  # Scheduled task disabled
    4702,  # Scheduled task updated
    4720,  # User account created
    4722,  # User account enabled
    4723,  # Password change attempted
    4724,  # Password reset attempted
    4725,  # User account disabled
    4726,  # User account deleted
    4732,  # Member added to security-enabled local group
    4733,  # Member removed from security-enabled local group
    4738,  # User account changed
    4740,  # User account locked out
    4756,  # Member added to security-enabled universal group
    4768,  # Kerberos TGT requested
    4769,  # Kerberos service ticket requested
    4776   # NTLM authentication
)

try {
    $secEvents = Get-WinEvent -FilterHashtable @{
        LogName   = 'Security'
        StartTime = $startDate
        Id        = $securityIDs
    } -MaxEvents 10000

    $secEvents | Select-Object TimeCreated, Id, LevelDisplayName, Message |
        Export-Csv "$OutputPath\SecurityEvents.csv" -NoTypeInformation

    $collectedItems += "SecurityEvents.csv ($($secEvents.Count) events)"
    Write-Host "[+] Collected $($secEvents.Count) security events"
} catch {
    Write-Host "[-] Failed to collect security events: $($_.Exception.Message)"
}

# =====================
# SYSTEM EVENTS
# =====================
Write-Host "[*] Collecting System events..."

try {
    $sysEvents = Get-WinEvent -FilterHashtable @{
        LogName   = 'System'
        StartTime = $startDate
        Level     = @(1, 2, 3)  # Critical, Error, Warning
    } -MaxEvents 5000

    $sysEvents | Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message |
        Export-Csv "$OutputPath\SystemEvents.csv" -NoTypeInformation

    $collectedItems += "SystemEvents.csv ($($sysEvents.Count) events)"
    Write-Host "[+] Collected $($sysEvents.Count) system events"
} catch {
    Write-Host "[-] Failed to collect system events: $($_.Exception.Message)"
}

# =====================
# POWERSHELL EVENTS
# =====================
Write-Host "[*] Collecting PowerShell events..."

try {
    $psEvents = Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-PowerShell/Operational'
        StartTime = $startDate
    } -MaxEvents 5000

    $psEvents | Select-Object TimeCreated, Id, LevelDisplayName, Message |
        Export-Csv "$OutputPath\PowerShellEvents.csv" -NoTypeInformation

    $collectedItems += "PowerShellEvents.csv ($($psEvents.Count) events)"
    Write-Host "[+] Collected $($psEvents.Count) PowerShell events"
} catch {
    Write-Host "[-] Failed to collect PowerShell events: $($_.Exception.Message)"
}

# =====================
# RAW EVTX EXPORTS
# =====================
Write-Host "[*] Exporting raw EVTX files..."

$evtxExports = @(
    @{ Name = 'Security'; Path = "$OutputPath\Security.evtx" },
    @{ Name = 'System'; Path = "$OutputPath\System.evtx" },
    @{ Name = 'Application'; Path = "$OutputPath\Application.evtx" },
    @{ Name = 'Microsoft-Windows-PowerShell/Operational'; Path = "$OutputPath\PowerShell-Operational.evtx" },
    @{ Name = 'Microsoft-Windows-Sysmon/Operational'; Path = "$OutputPath\Sysmon.evtx" }
)

foreach ($export in $evtxExports) {
    try {
        wevtutil epl $export.Name $export.Path /ow:true 2>$null
        if (Test-Path $export.Path) {
            $collectedItems += (Split-Path $export.Path -Leaf)
            Write-Host "[+] Exported $($export.Name)"
        }
    } catch {
        Write-Host "[-] Failed to export $($export.Name)"
    }
}

# =====================
# POWERSHELL HISTORY
# =====================
Write-Host "[*] Collecting PowerShell history..."

$historyCount = 0
Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $histPath = Join-Path $_.FullName "AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
    if (Test-Path $histPath) {
        $destName = "PSHistory_$($_.Name).txt"
        Copy-Item $histPath "$OutputPath\$destName" -Force
        $historyCount++
    }
}
if ($historyCount -gt 0) {
    $collectedItems += "PowerShell history files ($historyCount users)"
    Write-Host "[+] Collected PowerShell history from $historyCount users"
}

# =====================
# PREFETCH FILES
# =====================
Write-Host "[*] Collecting Prefetch files..."

$prefetchPath = "C:\Windows\Prefetch"
if (Test-Path $prefetchPath) {
    $prefetchDest = "$OutputPath\Prefetch"
    New-Item -Path $prefetchDest -ItemType Directory -Force | Out-Null

    $prefetchFiles = Get-ChildItem $prefetchPath -Filter "*.pf" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $startDate }

    $prefetchFiles | ForEach-Object {
        Copy-Item $_.FullName $prefetchDest -Force
    }

    $collectedItems += "Prefetch files ($($prefetchFiles.Count) files)"
    Write-Host "[+] Collected $($prefetchFiles.Count) Prefetch files"
}

# =====================
# BROWSER HISTORY (Chrome, Edge)
# =====================
Write-Host "[*] Collecting browser history..."

Get-ChildItem "C:\Users" -Directory -ErrorAction SilentlyContinue | ForEach-Object {
    $userName = $_.Name
    $userPath = $_.FullName

    # Chrome
    $chromePath = Join-Path $userPath "AppData\Local\Google\Chrome\User Data\Default\History"
    if (Test-Path $chromePath) {
        $destName = "ChromeHistory_$userName.sqlite"
        Copy-Item $chromePath "$OutputPath\$destName" -Force -ErrorAction SilentlyContinue
    }

    # Edge
    $edgePath = Join-Path $userPath "AppData\Local\Microsoft\Edge\User Data\Default\History"
    if (Test-Path $edgePath) {
        $destName = "EdgeHistory_$userName.sqlite"
        Copy-Item $edgePath "$OutputPath\$destName" -Force -ErrorAction SilentlyContinue
    }
}

# =====================
# NETWORK CONFIGURATION
# =====================
Write-Host "[*] Collecting network configuration..."

$netInfo = @{
    IPConfig     = ipconfig /all 2>&1
    Netstat      = netstat -ano 2>&1
    ARPTable     = arp -a 2>&1
    RoutingTable = route print 2>&1
    DNSCache     = Get-DnsClientCache | Select-Object Entry, RecordName, Data
}

$netInfo | ConvertTo-Json -Depth 5 | Out-File "$OutputPath\NetworkInfo.json" -Encoding UTF8
$collectedItems += "NetworkInfo.json"

# =====================
# RUNNING PROCESSES SNAPSHOT
# =====================
Write-Host "[*] Collecting process snapshot..."

Get-CimInstance Win32_Process | Select-Object ProcessId, Name, ExecutablePath, CommandLine, CreationDate |
    Export-Csv "$OutputPath\Processes.csv" -NoTypeInformation
$collectedItems += "Processes.csv"

# =====================
# SERVICES
# =====================
Write-Host "[*] Collecting services information..."

Get-CimInstance Win32_Service | Select-Object Name, DisplayName, State, StartMode, PathName |
    Export-Csv "$OutputPath\Services.csv" -NoTypeInformation
$collectedItems += "Services.csv"

# =====================
# COMPRESS RESULTS
# =====================
Write-Host "[*] Compressing collected artifacts..."

$archivePath = "$OutputPath.zip"
try {
    Compress-Archive -Path $OutputPath -DestinationPath $archivePath -Force
    Write-Host "[+] Archive created: $archivePath"

    # Get archive size
    $archiveSize = (Get-Item $archivePath).Length
    $archiveSizeMB = [math]::Round($archiveSize / 1MB, 2)

    # Cleanup uncompressed folder
    Remove-Item -Path $OutputPath -Recurse -Force

} catch {
    $archivePath = $OutputPath
    $archiveSizeMB = "Unknown"
    Write-Host "[-] Failed to compress: $($_.Exception.Message)"
}

Write-Host "[+] Log collection complete"

# Calculate total events
$totalEvents = 0
if ($secEvents) { $totalEvents += $secEvents.Count }
if ($sysEvents) { $totalEvents += $sysEvents.Count }
if ($psEvents) { $totalEvents += $psEvents.Count }

# Return results as JSON string (survives remote session serialization)
@{
    Path           = $archivePath
    Hostname       = $env:COMPUTERNAME
    EventCount     = $totalEvents
    DaysCollected  = $DaysBack
    Size           = "$archiveSizeMB MB"
    Items          = $collectedItems
    Timestamp      = (Get-Date).ToString('o')
} | ConvertTo-Json -Compress
