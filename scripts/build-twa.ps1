# Lorflux — Build TWA (Trusted Web Activity) para Google Play
#
# Uso:
#   .\scripts\build-twa.ps1                  # build padrão (lê versão do twa-manifest.json)
#   .\scripts\build-twa.ps1 -BumpVersion     # incrementa versionCode automaticamente
#   .\scripts\build-twa.ps1 -SkipAssetCheck  # pula validação remota do assetlinks.json
#
# Pré-requisitos (já instalados nesta máquina em 2026-05-28):
#   - JDK 17 (Temurin)
#   - Bubblewrap CLI global
#   - Android SDK em %USERPROFILE%\.bubblewrap\android_sdk
#   - Keystore em %USERPROFILE%\.android-keystores\lorflux-release.keystore
#
# Antes de rodar pela primeira vez, na pasta de trabalho TWA:
#   bubblewrap init --manifest https://www.lorflux.com/manifest.json
# (responder os prompts conforme a tabela no ANDROID_BUILD.md)

[CmdletBinding()]
param(
  [switch]$BumpVersion,
  [switch]$SkipAssetCheck,
  [string]$TwaDir = "$env:USERPROFILE\lorflux-twa",
  [string]$ManifestUrl = "https://www.lorflux.com/manifest.json",
  [string]$AssetLinksUrl = "https://www.lorflux.com/.well-known/assetlinks.json",
  [string]$ExpectedFingerprint = "84:3C:6D:B5:F6:50:8E:B4:E3:4B:76:52:F1:C5:CB:9B:13:C8:D8:73:41:11:D1:51:A5:CA:A1:78:8D:2E:43:76"
)

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "    ERR $msg" -ForegroundColor Red; exit 1 }

# 1. AMBIENTE
Step "Validando ambiente"
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:ANDROID_HOME = "$env:USERPROFILE\.bubblewrap\android_sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { Fail "JDK 17 não encontrado em $env:JAVA_HOME" }
if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) { Fail "Bubblewrap CLI não encontrado no PATH (npm install -g @bubblewrap/cli)" }

$keystore = "$env:USERPROFILE\.android-keystores\lorflux-release.keystore"
if (-not (Test-Path $keystore)) { Fail "Keystore ausente em $keystore" }
Ok "JDK, Bubblewrap e keystore presentes"

# 2. ASSETLINKS REMOTO
if (-not $SkipAssetCheck) {
  Step "Validando $AssetLinksUrl em produção"
  try {
    $resp = Invoke-WebRequest -Uri $AssetLinksUrl -UseBasicParsing -TimeoutSec 15
    $body = $resp.Content
    if ($body -notmatch [regex]::Escape($ExpectedFingerprint)) {
      Write-Host $body
      Fail "SHA-256 esperado NÃO está presente no assetlinks.json remoto. Faça o deploy do site com o assetlinks correto antes de buildar."
    }
    Ok "Fingerprint SHA-256 bate"
  } catch {
    Fail "Não foi possível buscar $AssetLinksUrl — $($_.Exception.Message)"
  }
} else {
  Write-Host "    (assetlinks check pulado por -SkipAssetCheck)" -ForegroundColor Yellow
}

# 3. PASTA DO PROJETO TWA
Step "Entrando em $TwaDir"
if (-not (Test-Path $TwaDir)) {
  Fail @"
Pasta TWA não existe. Crie e rode init primeiro:
  mkdir $TwaDir
  cd $TwaDir
  bubblewrap init --manifest $ManifestUrl
Responder os prompts conforme tabela em ANDROID_BUILD.md.
"@
}
Set-Location $TwaDir

$twaManifest = Join-Path $TwaDir "twa-manifest.json"
if (-not (Test-Path $twaManifest)) {
  Fail @"
twa-manifest.json não encontrado em $TwaDir.
Rode primeiro:
  cd $TwaDir
  bubblewrap init --manifest $ManifestUrl
"@
}
Ok "twa-manifest.json presente"

# 4. BUMP DE VERSÃO (opcional)
if ($BumpVersion) {
  Step "Incrementando versionCode"
  $manifest = Get-Content $twaManifest -Raw | ConvertFrom-Json
  $oldCode = [int]$manifest.appVersionCode
  $newCode = $oldCode + 1
  $manifest.appVersionCode = $newCode
  $manifest.appVersion = "$newCode"
  ($manifest | ConvertTo-Json -Depth 20) | Out-File -FilePath $twaManifest -Encoding utf8
  Ok "versionCode: $oldCode -> $newCode"
}

# 5. BUILD
Step "Rodando bubblewrap build"
bubblewrap build
if ($LASTEXITCODE -ne 0) { Fail "bubblewrap build falhou" }

$aab = Join-Path $TwaDir "app-release-bundle.aab"
$apk = Join-Path $TwaDir "app-release-signed.apk"

Write-Host ""
Write-Host "=== BUILD CONCLUIDO ===" -ForegroundColor Green
if (Test-Path $aab) { Write-Host "AAB : $aab  ($([math]::Round((Get-Item $aab).Length / 1MB, 2)) MB)" -ForegroundColor White }
if (Test-Path $apk) { Write-Host "APK : $apk  ($([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB)" -ForegroundColor White }
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Cyan
Write-Host "  1. Testar no Android: adb install `"$apk`""
Write-Host "  2. Subir o .aab em Play Console -> Produção -> Criar nova versão"
