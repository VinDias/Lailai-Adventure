# Lorflux — Setup + Build TWA all-in-one
#
# Roda bubblewrap init (com respostas pré-preenchidas) e bubblewrap build
# numa única execução, pra evitar prompts interativos exceto a senha do keystore.
#
# Uso:
#   .\scripts\setup-twa.ps1
#
# O script vai pedir a senha do keystore UMA VEZ (mascarada) e usa pra ambos os
# steps. Saída: %USERPROFILE%\lorflux-twa\app-release-bundle.aab

[CmdletBinding()]
param(
  [string]$TwaDir = "$env:USERPROFILE\lorflux-twa",
  [string]$ManifestUrl = "https://www.lorflux.com/manifest.json",
  [string]$KeystorePath = "$env:USERPROFILE\.android-keystores\lorflux-release.keystore"
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

if (-not (Test-Path "$env:JAVA_HOME\bin\java.exe")) { Fail "JDK 17 não encontrado." }
if (-not (Get-Command bubblewrap -ErrorAction SilentlyContinue)) { Fail "Bubblewrap CLI não encontrado." }
if (-not (Test-Path $KeystorePath)) { Fail "Keystore ausente em $KeystorePath" }
Ok "JDK, Bubblewrap e keystore presentes"

# 2. SENHA (mascarada)
Step "Senha do keystore"
$securePwd = Read-Host -Prompt "Cole a senha do keystore (input mascarado)" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
$plainPwd = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
if ($plainPwd.Length -lt 6) { Fail "Senha muito curta (min 6 chars)." }
Ok "Senha lida ($($plainPwd.Length) chars)"

# 3. PASTA TWA
Step "Preparando pasta TWA"
if (-not (Test-Path $TwaDir)) { New-Item -ItemType Directory -Path $TwaDir | Out-Null }
Set-Location $TwaDir
$twaManifest = Join-Path $TwaDir "twa-manifest.json"

# 4. INIT (se ainda não foi feito)
if (-not (Test-Path $twaManifest)) {
  Step "Rodando bubblewrap init (respostas pré-preenchidas)"

  # Sequência de respostas pros prompts do init.
  # Cada linha responde um prompt na ordem em que aparece.
  $answers = @(
    "www.lorflux.com",                                          # Domain (host)
    "/",                                                         # Start URL
    "Lorflux - Cinematic Comics",                                # App name
    "Lorflux",                                                   # Launcher name (max 12)
    "com.lorflux.twa",                                           # Application ID / package name
    "1",                                                         # App version code
    "standalone",                                                # Display mode
    "portrait",                                                  # Orientation
    "#000000",                                                   # Theme color
    "#000000",                                                   # Background color
    "https://www.lorflux.com/icons/icon-512.png",                # Icon URL
    "https://www.lorflux.com/icons/icon-maskable-512.png",       # Maskable icon URL
    "N",                                                         # Add shortcuts?
    "",                                                          # Monochrome icon URL (skip)
    "N",                                                         # Play Billing
    "N",                                                         # Location Delegation
    "N",                                                         # First Run Flag
    "N",                                                         # ARCore (Augmented Reality)
    "N",                                                         # Notifications
    "N",                                                         # AppsFlyer
    $KeystorePath,                                               # Keystore path
    "lorflux",                                                   # Key alias
    $plainPwd,                                                   # Keystore password
    $plainPwd                                                    # Key password
  )
  $inputs = ($answers -join "`n") + "`n"

  # Pipe inputs pro bubblewrap init
  $inputs | bubblewrap init --manifest $ManifestUrl
  if ($LASTEXITCODE -ne 0) { Fail "bubblewrap init falhou (exit $LASTEXITCODE)" }
  Ok "init concluído"
} else {
  Ok "twa-manifest.json já existe — pulando init"
}

# 5. BUILD (passwords via env vars)
Step "Rodando bubblewrap build"
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = $plainPwd
$env:BUBBLEWRAP_KEY_PASSWORD = $plainPwd
bubblewrap build
$buildExit = $LASTEXITCODE
# Limpa env vars de senha logo após uso
Remove-Item env:BUBBLEWRAP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
Remove-Item env:BUBBLEWRAP_KEY_PASSWORD -ErrorAction SilentlyContinue
$plainPwd = $null  # melhor esforço; PowerShell pode reter

if ($buildExit -ne 0) { Fail "bubblewrap build falhou (exit $buildExit)" }

# 6. RESULTADO
$aab = Join-Path $TwaDir "app-release-bundle.aab"
$apk = Join-Path $TwaDir "app-release-signed.apk"

Write-Host ""
Write-Host "=== BUILD CONCLUIDO ===" -ForegroundColor Green
if (Test-Path $aab) { Write-Host "AAB : $aab  ($([math]::Round((Get-Item $aab).Length / 1MB, 2)) MB)" }
if (Test-Path $apk) { Write-Host "APK : $apk  ($([math]::Round((Get-Item $apk).Length / 1MB, 2)) MB)" }
Write-Host ""
Write-Host "Proximo passo: upload do .aab no Play Console -> Teste interno." -ForegroundColor Cyan
