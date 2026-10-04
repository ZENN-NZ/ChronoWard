# Deterministic ICM Verification Script
Write-Host "Running ChronoWard Frontend Unit Tests..." -ForegroundColor Cyan
npm test

if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend tests failed!"
    exit 1
}

Write-Host "All frontend tests passed successfully." -ForegroundColor Green
