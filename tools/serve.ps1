# Serves the game at http://localhost:8123 — required for the LLM opponent mode,
# because Ollama accepts browser requests from localhost origins by default
# (opening index.html via file:// works fine for the scripted AI).
Set-Location (Split-Path $PSScriptRoot -Parent)
Start-Process "http://localhost:8123"
python -m http.server 8123
