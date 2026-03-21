param(
  [ValidateSet('chrome', 'edge')]
  [string]$Browser = 'chrome'
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute o uninstall.ps1 como Administrador para remover do HKLM.'
}

if ($Browser -eq 'chrome') {
  $manifestPath = Join-Path $env:ProgramData 'Organife\NativeMessagingHosts\Chrome\com.organife.filepicker.json'
  $registryKeys = @('HKLM\Software\Google\Chrome\NativeMessagingHosts\com.organife.filepicker')
  if ([Environment]::Is64BitOperatingSystem) {
    $registryKeys += 'HKLM\Software\WOW6432Node\Google\Chrome\NativeMessagingHosts\com.organife.filepicker'
  }
} else {
  $manifestPath = Join-Path $env:ProgramData 'Organife\NativeMessagingHosts\Edge\com.organife.filepicker.json'
  $registryKeys = @('HKLM\Software\Microsoft\Edge\NativeMessagingHosts\com.organife.filepicker')
}

if (Test-Path -LiteralPath $manifestPath) {
  Remove-Item -LiteralPath $manifestPath -Force
}
foreach ($registryKey in $registryKeys) {
  & reg.exe delete $registryKey /f | Out-Null
}
Write-Output "REMOVIDO|$Browser"
