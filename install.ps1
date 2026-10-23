$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

Write-Host "Instalando dependencias do Astra..."
& npm.cmd install --fetch-retries=5 --fetch-timeout=120000
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel instalar as dependencias."
}

Write-Host "Gerando o instalador do Astra..."
& npm.cmd run dist
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel gerar o instalador."
}

$installer = Get-ChildItem (Join-Path $PSScriptRoot "release") -Filter "Astra Setup *.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "O instalador nao foi encontrado na pasta release."
}

Write-Host "Abrindo o instalador: $($installer.FullName)"
Start-Process -FilePath $installer.FullName
