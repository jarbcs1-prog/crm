$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "agent\scripts\voice-pipeline\stt-server.py"
$host_ = if ($env:STT_HOST) { $env:STT_HOST } else { "127.0.0.1" }
$port = if ($env:STT_PORT) { $env:STT_PORT } else { "8000" }

if (-not (Test-Path -LiteralPath $server)) {
	throw "stt-server.py not found at $server"
}

$candidates = @()
if ($env:STT_PYTHON) { $candidates += $env:STT_PYTHON }
$candidates += @(
	"C:\Program Files\Python311\python.exe",
	"C:\Program Files\Python312\python.exe",
	"C:\Program Files\Python310\python.exe",
	"python"
)

$python = $null
foreach ($candidate in $candidates) {
	$probe = Get-Command $candidate -ErrorAction SilentlyContinue
	if (-not $probe) { continue }
	try {
		& $candidate -c "import faster_whisper, uvicorn, fastapi" 2>$null | Out-Null
		if ($LASTEXITCODE -eq 0) {
			$python = $candidate
			break
		}
	} catch {
		continue
	}
}

if (-not $python) {
	throw "No python with faster_whisper found. Install faster-whisper or set STT_PYTHON."
}

Write-Host "stt-server: $python -> http://${host_}:${port}"
Write-Host "model dir : $(if ($env:STT_MODEL_DIR) { $env:STT_MODEL_DIR } else { '(cached default)' })"
Write-Host "endpoint  : POST http://${host_}:${port}/v1/audio/transcriptions"

$env:STT_HOST = $host_
$env:STT_PORT = $port
& $python $server
