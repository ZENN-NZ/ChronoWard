# Deterministic ICM Verification Script
Write-Host "Running ChronoWard Frontend Unit Tests..." -ForegroundColor Cyan
npm test

if ($LASTEXITCODE -ne 0) {
    Write-Error "Frontend tests failed!"
    exit 1
}

Write-Host "All frontend tests passed successfully." -ForegroundColor Green

Write-Host "Running ChronoWard Backend Rust Unit Tests..." -ForegroundColor Cyan
cargo test --manifest-path src-tauri/Cargo.toml

if ($LASTEXITCODE -ne 0) {
    Write-Error "Backend Rust tests failed!"
    exit 1
}

Write-Host "All frontend and backend tests passed successfully." -ForegroundColor Green
