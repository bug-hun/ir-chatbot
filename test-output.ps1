$password = ConvertTo-SecureString "IRLabPass123!" -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("IRAdmin", $password)

Write-Host "Testing script output..."

$result = Invoke-Command -ComputerName "192.168.1.33" -Credential $cred -ScriptBlock {
    # Simulate what Collect-Logs.ps1 returns
    @{
        Path           = "C:\Users\IRAdmin\AppData\Local\Temp\IR-Logs-test.zip"
        Hostname       = $env:COMPUTERNAME
        EventCount     = 1500
        DaysCollected  = 7
        Size           = "3.5 MB"
        Items          = @("SecurityEvents.csv", "SystemEvents.csv", "Processes.csv")
        Timestamp      = (Get-Date).ToString('o')
    } | ConvertTo-Json -Compress
}

Write-Host "Raw result type: $($result.GetType().FullName)"
Write-Host "Raw result:"
Write-Host $result
Write-Host ""
Write-Host "Trying to parse as JSON..."
$parsed = $result | ConvertFrom-Json
Write-Host "Parsed EventCount: $($parsed.EventCount)"
Write-Host "Parsed Path: $($parsed.Path)"
