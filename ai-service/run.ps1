# Start the ResQMe AI service (run from ai-service/)
Set-Location $PSScriptRoot
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8100
