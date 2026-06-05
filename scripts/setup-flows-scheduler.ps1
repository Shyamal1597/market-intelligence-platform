# setup-flows-scheduler.ps1
# Run once as Administrator to schedule daily FII/DII collection at 7:30 PM.
# The script fires every trading day after NSE publishes EOD FII/DII data.

$TaskName = "Sunidhi-CollectFlows"
$ProjectDir = "D:\Sunidhi-Intranet-Futuristic"
$NodeBin = (Get-Command npx -ErrorAction Stop).Source

$Action = New-ScheduledTaskAction `
    -Execute $NodeBin `
    -Argument "tsx scripts/collect-flows.ts" `
    -WorkingDirectory $ProjectDir

# Mon-Fri at 19:30
$Trigger = New-ScheduledTaskTrigger `
    -Weekly `
    -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
    -At "7:30 PM"

$Settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -StartWhenAvailable `       # catch up if PC was off at trigger time
    -RunOnlyIfNetworkAvailable

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Daily FII/DII data collection for Sunidhi Research Dashboard" `
    -RunLevel Highest `
    -Force

Write-Host "`nTask '$TaskName' registered successfully."
Write-Host "Fires Mon-Fri at 19:30 from $ProjectDir"
Write-Host "Run manually: Start-ScheduledTask -TaskName '$TaskName'"
