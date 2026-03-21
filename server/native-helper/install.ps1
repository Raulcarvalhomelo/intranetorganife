param(
  [string]$ExtensionId = 'pnagjlmkofcpaljnfmpmmilfnkobbcfk',
  [ValidateSet('chrome', 'edge')]
  [string]$Browser = 'chrome'
)

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute o install.ps1 como Administrador para gravar em HKLM.'
}

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $baseDir "manifest.$Browser.template.json"
$hostPath = (Resolve-Path (Join-Path $baseDir 'host.cmd')).Path
if (-not (Test-Path $templatePath)) {
  throw "Template não encontrado: $templatePath"
}
if (-not (Test-Path $hostPath)) {
  throw "Host não encontrado: $hostPath"
}

if ($Browser -eq 'chrome') {
  $manifestDir = Join-Path $env:ProgramData 'Organife\NativeMessagingHosts\Chrome'
  $registryKey = 'HKLM\Software\Google\Chrome\NativeMessagingHosts\com.organife.filepicker'
} else {
  $manifestDir = Join-Path $env:ProgramData 'Organife\NativeMessagingHosts\Edge'
  $registryKey = 'HKLM\Software\Microsoft\Edge\NativeMessagingHosts\com.organife.filepicker'
}

New-Item -ItemType Directory -Path $manifestDir -Force | Out-Null
$manifestPath = Join-Path $manifestDir 'com.organife.filepicker.json'
$rawTemplate = Get-Content -LiteralPath $templatePath -Raw
$escapedHostPath = $hostPath.Replace('\', '\\')
$normalizedExtensionId = $ExtensionId.Trim().ToLowerInvariant()
if (-not $normalizedExtensionId) {
  throw 'ExtensionId inválido.'
}
$manifestJson = $rawTemplate.Replace('__HOST_PATH__', $escapedHostPath).Replace('__EXTENSION_ID__', $normalizedExtensionId)
Set-Content -LiteralPath $manifestPath -Value $manifestJson -Encoding UTF8
& reg.exe add $registryKey /ve /t REG_SZ /d $manifestPath /f | Out-Null
Write-Output "INSTALADO|$Browser|$manifestPath"
