# Pack-Portable.ps1 — Splitwriter portable packer
param(
  [string]$Version = "0.9.0-beta.1"
)

$Root   = Get-Location
$OutDir = Join-Path $Root ("release\splitwriter_v{0}_portable" -f $Version)
$Zip    = Join-Path $Root ("release\splitwriter_v{0}_portable_win64.zip" -f $Version)

# 1) 산출물 확인
$ExePath = Join-Path $Root "src-tauri\target\release\Splitwriter.exe"
if (!(Test-Path $ExePath)) {
  Write-Host "❌ 빌드 산출물이 없습니다. 먼저 'npx tauri build'를 실행하세요." -ForegroundColor Red
  exit 1
}

# 2) 배포 폴더 준비
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# 3) 파일 복사 (exe + 필요한 dll)
Copy-Item $ExePath $OutDir -Force
Get-ChildItem (Join-Path $Root "src-tauri\target\release") -Filter *.dll -ErrorAction SilentlyContinue | `
  Copy-Item -Destination $OutDir -Force

# 4) runtime 폴더가 있으면 같이 포함 (오타 폴더도 케어)
$runtA = Join-Path $OutDir  "runtime"
$runtB = Join-Path $Root    "runtime"
$runtTypo = Join-Path $Root "rumtime"
if (Test-Path $runtB)      { Copy-Item $runtB -Destination $OutDir -Recurse -Force }
elseif (Test-Path $runtTypo) { Copy-Item $runtTypo -Destination $runtA -Recurse -Force }

# 5) README/CHANGELOG가 루트나 OutDir에 있으면 포함
foreach($name in @("README_kr_en.txt","CHANGELOG.txt")) {
  if (Test-Path (Join-Path $Root $name)) { Copy-Item (Join-Path $Root $name) $OutDir -Force }
}

# 6) ZIP으로 묶기(기존 파일 있으면 교체)
if (Test-Path $Zip) { Remove-Item $Zip -Force }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $Zip -Force

# 7) SHA256 출력
$hash = (Get-FileHash $Zip -Algorithm SHA256).Hash
Write-Host "✅ Pack OK:" $Zip
Write-Host "SHA256:" $hash
