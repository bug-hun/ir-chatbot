# Get-MemoryDump.ps1
# Captures a memory dump of a process
# Parameters: $ProcessId (int or string - PID or process name)

# Parameter validation
if (-not $ProcessId) {
    throw "ProcessId parameter is required"
}

$ErrorActionPreference = 'Stop'

# Output directory
$dumpDir = "$env:TEMP\IR-MemDumps"
if (-not (Test-Path $dumpDir)) {
    New-Item -Path $dumpDir -ItemType Directory -Force | Out-Null
}

Write-Output "[*] Memory dump request for: $ProcessId"

# Resolve process
$targetPid = $null
$processName = $null

if ($ProcessId -match '^\d+$') {
    # It's a PID
    $targetPid = [int]$ProcessId
    $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    if ($proc) {
        $processName = $proc.ProcessName
    } else {
        throw "No process found with PID: $targetPid"
    }
} else {
    # It's a process name - get the first matching process
    $proc = Get-Process -Name $ProcessId -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
        $targetPid = $proc.Id
        $processName = $proc.ProcessName
    } else {
        throw "No process found with name: $ProcessId"
    }
}

Write-Output "[*] Target process: $processName (PID: $targetPid)"

# Generate dump filename
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpFile = "$dumpDir\$processName`_$targetPid`_$timestamp.dmp"

Write-Output "[*] Dump file: $dumpFile"

# Method 1: Try using comsvcs.dll (built-in, works for most processes)
Write-Output "[*] Attempting memory dump using comsvcs.dll..."

try {
    # Create minidump using rundll32 and comsvcs.dll
    # This requires the process to be accessible and running as admin
    $rundllPath = "$env:SystemRoot\System32\rundll32.exe"
    $comsvcsPath = "$env:SystemRoot\System32\comsvcs.dll"

    if (Test-Path $comsvcsPath) {
        # The MiniDump export requires: PID, DumpFile, FullDump flag
        $arguments = "$comsvcsPath, MiniDump $targetPid $dumpFile full"

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $rundllPath
        $psi.Arguments = $arguments
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $psi
        $process.Start() | Out-Null
        $process.WaitForExit(120000)  # 2 minute timeout

        if (Test-Path $dumpFile) {
            $dumpSize = (Get-Item $dumpFile).Length
            $dumpSizeMB = [math]::Round($dumpSize / 1MB, 2)

            Write-Output "[+] Memory dump created successfully"
            Write-Output "[+] Size: $dumpSizeMB MB"

            @{
                Status      = "Success"
                Hostname    = $env:COMPUTERNAME
                ProcessName = $processName
                ProcessId   = $targetPid
                Path        = $dumpFile
                Size        = "$dumpSizeMB MB"
                Method      = "comsvcs.dll"
                Timestamp   = (Get-Date).ToString('o')
            }
        } else {
            throw "Dump file was not created"
        }

    } else {
        throw "comsvcs.dll not found"
    }

} catch {
    Write-Output "[-] comsvcs.dll method failed: $($_.Exception.Message)"

    # Method 2: Try using Out-Minidump from PowerShell (requires .NET)
    Write-Output "[*] Attempting alternative method using .NET..."

    try {
        # Define MiniDumpWriteDump signature
        $signature = @"
[DllImport("dbghelp.dll", SetLastError = true)]
public static extern bool MiniDumpWriteDump(
    IntPtr hProcess,
    uint ProcessId,
    IntPtr hFile,
    uint DumpType,
    IntPtr ExceptionParam,
    IntPtr UserStreamParam,
    IntPtr CallbackParam
);
"@

        Add-Type -MemberDefinition $signature -Name 'DbgHelp' -Namespace 'Win32'

        # Open process
        $proc = Get-Process -Id $targetPid
        $processHandle = $proc.Handle

        # Create dump file
        $fileStream = New-Object System.IO.FileStream($dumpFile, [System.IO.FileMode]::Create)

        # MiniDumpWithFullMemory = 0x00000002
        $dumpType = 2

        $success = [Win32.DbgHelp]::MiniDumpWriteDump(
            $processHandle,
            $targetPid,
            $fileStream.SafeFileHandle.DangerousGetHandle(),
            $dumpType,
            [IntPtr]::Zero,
            [IntPtr]::Zero,
            [IntPtr]::Zero
        )

        $fileStream.Close()

        if ($success -and (Test-Path $dumpFile)) {
            $dumpSize = (Get-Item $dumpFile).Length
            $dumpSizeMB = [math]::Round($dumpSize / 1MB, 2)

            Write-Output "[+] Memory dump created successfully"

            @{
                Status      = "Success"
                Hostname    = $env:COMPUTERNAME
                ProcessName = $processName
                ProcessId   = $targetPid
                Path        = $dumpFile
                Size        = "$dumpSizeMB MB"
                Method      = "DbgHelp.dll"
                Timestamp   = (Get-Date).ToString('o')
            }
        } else {
            throw "MiniDumpWriteDump failed"
        }

    } catch {
        Write-Output "[-] .NET method failed: $($_.Exception.Message)"

        # Method 3: Use Task Manager style approach via WMI
        Write-Output "[*] Attempting WMI method..."

        try {
            $wmiProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid"
            if ($wmiProcess) {
                # Get process memory info
                $memoryInfo = @{
                    WorkingSetSize    = $wmiProcess.WorkingSetSize
                    VirtualSize       = $wmiProcess.VirtualSize
                    PeakWorkingSet    = $wmiProcess.PeakWorkingSetSize
                    CommandLine       = $wmiProcess.CommandLine
                    ExecutablePath    = $wmiProcess.ExecutablePath
                    CreationDate      = $wmiProcess.CreationDate
                }

                # Save process info as a partial dump (metadata only)
                $infoFile = $dumpFile -replace '\.dmp$', '_info.json'
                $memoryInfo | ConvertTo-Json | Out-File $infoFile -Encoding UTF8

                Write-Output "[!] Full memory dump not available, saved process metadata instead"

                @{
                    Status      = "Partial"
                    Hostname    = $env:COMPUTERNAME
                    ProcessName = $processName
                    ProcessId   = $targetPid
                    Path        = $infoFile
                    Size        = "N/A"
                    Method      = "WMI (metadata only)"
                    Message     = "Full memory dump requires elevated privileges or procdump.exe"
                    Timestamp   = (Get-Date).ToString('o')
                }
            } else {
                throw "Process not found via WMI"
            }

        } catch {
            throw "All memory dump methods failed. Consider installing procdump.exe from Sysinternals for reliable dumps."
        }
    }
}
