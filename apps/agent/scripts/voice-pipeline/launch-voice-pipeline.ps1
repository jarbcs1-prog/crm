param(
    [string]$LlamaServer = "F:\llama-win-cuda-13.3\llama-server.exe",
    [string]$Gguf = "F:\.cache\huggingface\hub\models\meta-llama--Llama-3.2-1B\Llama-3.2-1B-f16.gguf",
    [string]$KokoroDir = "F:\.cache\huggingface\hub\models\Kokoro-82M\snapshots\f3ff3571791e39611d31c381e3a41a3af07b4987"
)

# Make CUDA 12 cuBLAS available to CTranslate2/faster-whisper. 
$env:PATH = "F:\llama_cpp\llama-whisper-cublas-12.4\Release;$env:PATH"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$voicePipeline = Join-Path $scriptDir "voice-pipeline.py"

$requiredPackages = @("kokoro", "soundfile", "torch", "numpy", "sounddevice", "faster-whisper", "requests")
$missingPackages = @()

foreach ($package in $requiredPackages) {
    $importName = $package -replace "-", "_"
    $result = python -c "import $importName" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $missingPackages += $package
    }
}

if ($missingPackages.Count -gt 0) {
    Write-Host "Missing Python packages: $($missingPackages -join ', ')" -ForegroundColor Red
    Write-Host "Install with: pip install $($missingPackages -join ' ')"
    exit 1
}

if (-not (Test-Path $LlamaServer)) {
    Write-Error "llama-server not found: $LlamaServer"
    exit 1
}

if (-not (Test-Path $Gguf)) {
    Write-Error "GGUF model not found: $Gguf"
    exit 1
}

if (-not (Test-Path $KokoroDir)) {
    Write-Error "Kokoro directory not found: $KokoroDir"
    exit 1
}

& python $voicePipeline `
    --llama-server "$LlamaServer" `
    --gguf "$Gguf" `
    --kokoro-dir "$KokoroDir"
