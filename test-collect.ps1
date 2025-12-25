$password = ConvertTo-SecureString "IRLabPass123!" -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("IRAdmin", $password)

Write-Host "Checking for IR logs on 192.168.1.33..."

$result = Invoke-Command -ComputerName "192.168.1.33" -Credential $cred -ScriptBlock {
    $logs = Get-ChildItem $env:TEMP -Filter "IR-Logs*" -ErrorAction SilentlyContinue
    if ($logs) {
        $logs | ForEach-Object {
            [PSCustomObject]@{
                Name = $_.Name
                LastWriteTime = $_.LastWriteTime
                SizeMB = [math]::Round($_.Length/1MB, 2)
            }
        }
    } else {
        Write-Host "No IR-Logs found in TEMP folder"
        Get-ChildItem $env:TEMP | Select-Object -First 10 Name
    }
}

$result | Format-Table -AutoSize
