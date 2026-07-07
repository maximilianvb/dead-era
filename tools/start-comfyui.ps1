# Starts the local ComfyUI (installed at I:\dead-era-ai) used for card art generation.
# Run this, wait for "To see the GUI go to: http://127.0.0.1:8188", then:
#   node tools/generate-art.mjs
$portable = "I:\dead-era-ai\ComfyUI_windows_portable"
if (-not (Test-Path $portable)) { Write-Error "ComfyUI not found at $portable"; exit 1 }
Set-Location $portable
& ".\python_embeded\python.exe" -s ComfyUI\main.py --windows-standalone-build
