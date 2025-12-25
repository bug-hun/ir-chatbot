# Kill-Process.ps1
# Terminates a process by PID or name
# Parameters: $ProcessIdentifier (string - can be PID or process name)

# Parameter validation
if (-not $ProcessIdentifier) {
    throw "ProcessIdentifier parameter is required"
}

$ErrorActionPreference = 'Stop'

Write-Output "[*] Attempting to terminate process: $ProcessIdentifier"

$terminated = @()
$failed = @()

# Check if input is a PID (numeric) or process name
if ($ProcessIdentifier -match '^\d+$') {
    # It's a PID
    $pid = [int]$ProcessIdentifier

    Write-Output "[*] Looking for process with PID: $pid"

    $process = Get-Process -Id $pid -ErrorAction SilentlyContinue

    if ($process) {
        $processInfo = @{
            PID         = $process.Id
            Name        = $process.ProcessName
            Path        = $process.Path
            StartTime   = $process.StartTime
            CommandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $pid").CommandLine
        }

        Write-Output "[*] Found process: $($process.ProcessName) (PID: $pid)"
        Write-Output "[*] Path: $($process.Path)"

        try {
            # Get child processes first
            $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $pid }

            # Stop the main process
            Stop-Process -Id $pid -Force
            Write-Output "[+] Process terminated successfully"

            $terminated += $processInfo

            # Optionally terminate child processes
            foreach ($child in $children) {
                try {
                    Stop-Process -Id $child.ProcessId -Force -ErrorAction SilentlyContinue
                    Write-Output "[+] Child process terminated: $($child.Name) (PID: $($child.ProcessId))"
                    $terminated += @{
                        PID  = $child.ProcessId
                        Name = $child.Name
                        Type = "Child Process"
                    }
                } catch {
                    Write-Output "[-] Failed to terminate child: $($child.ProcessId)"
                }
            }

        } catch {
            $failed += @{
                PID   = $pid
                Error = $_.Exception.Message
            }
            throw "Failed to terminate process $pid : $($_.Exception.Message)"
        }

    } else {
        throw "No process found with PID: $pid"
    }

} else {
    # It's a process name
    $processName = $ProcessIdentifier

    Write-Output "[*] Looking for processes with name: $processName"

    $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue

    if ($processes) {
        Write-Output "[*] Found $($processes.Count) process(es) matching '$processName'"

        foreach ($process in $processes) {
            $processInfo = @{
                PID       = $process.Id
                Name      = $process.ProcessName
                Path      = $process.Path
                StartTime = $process.StartTime
            }

            try {
                Stop-Process -Id $process.Id -Force
                Write-Output "[+] Terminated: $($process.ProcessName) (PID: $($process.Id))"
                $terminated += $processInfo
            } catch {
                Write-Output "[-] Failed to terminate PID $($process.Id): $($_.Exception.Message)"
                $failed += @{
                    PID   = $process.Id
                    Name  = $process.ProcessName
                    Error = $_.Exception.Message
                }
            }
        }

    } else {
        throw "No processes found with name: $processName"
    }
}

# Return results
@{
    Status     = if ($terminated.Count -gt 0) { "Success" } else { "Failed" }
    Hostname   = $env:COMPUTERNAME
    Terminated = $terminated
    Failed     = $failed
    Timestamp  = (Get-Date).ToString('o')
}
