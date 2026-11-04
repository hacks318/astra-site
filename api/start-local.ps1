$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ollamaHealthUrl = "http://127.0.0.1:11434/api/tags"
$apiHealthUrl = "http://127.0.0.1:8080/health"
$apiHost = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $apiHost) {
    throw "Não encontrei um endereço IPv4 privado para conectar o celular à API."
}

try {
    Invoke-RestMethod -Uri $ollamaHealthUrl -TimeoutSec 3 | Out-Null
} catch {
    $ollama = Get-Command ollama -ErrorAction Stop
    Start-Process -FilePath $ollama.Source -ArgumentList "serve" -WindowStyle Hidden
    $ollamaReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 2
        try {
            Invoke-RestMethod -Uri $ollamaHealthUrl -TimeoutSec 3 | Out-Null
            $ollamaReady = $true
            break
        } catch {
            continue
        }
    }
    if (-not $ollamaReady) {
        throw "Ollama não iniciou. Abra o Ollama e tente novamente."
    }
}

$models = (Invoke-RestMethod -Uri $ollamaHealthUrl -TimeoutSec 5).models |
    ForEach-Object { $_.name }
if ($models -notcontains "qwen2.5:3b") {
    throw "O modelo qwen2.5:3b não está instalado. Instale-o com: ollama pull qwen2.5:3b"
}

try {
    Invoke-RestMethod -Uri $apiHealthUrl -TimeoutSec 3 | Out-Null
    Write-Output "A API da Astra já está ativa em http://${apiHost}:8080/v1"
    exit 0
} catch {
    $node = Get-Command node -ErrorAction Stop
    $env:OLLAMA_URL = "http://127.0.0.1:11434"
    $env:ASTRA_MODEL = "qwen2.5:3b"
    $env:PORT = "8080"
    $env:HOST = $apiHost
    Start-Process -FilePath $node.Source `
        -ArgumentList "api/server.mjs" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden | Out-Null
}

$apiReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 2
    try {
        Invoke-RestMethod -Uri $apiHealthUrl -TimeoutSec 3 | Out-Null
        $apiReady = $true
        break
    } catch {
        continue
    }
}
if (-not $apiReady) {
    throw "A API da Astra não iniciou. Confirme se a porta 8080 está livre."
}

Write-Output "A API da Astra está ativa em http://${apiHost}:8080/v1"
Write-Output "Deixe este computador ligado e conecte o celular ao mesmo Wi-Fi."
