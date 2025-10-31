# Test the /api/welcome endpoint
# Run this after starting the server with: npm start

Write-Host "Testing /api/welcome endpoint..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "http://127.0.0.1:3333/api/welcome"
    
    Write-Host "✓ Success! Server returned:" -ForegroundColor Green
    Write-Host ""
    Write-Host "GREETING:" -ForegroundColor Yellow
    Write-Host $response.greeting
    Write-Host ""
    Write-Host "MASCOT:" -ForegroundColor Yellow
    Write-Host "  Name:    $($response.mascot.name)"
    Write-Host "  Emoji:   $($response.mascot.emoji)"
    Write-Host "  Tagline: $($response.mascot.tagline)"
    Write-Host ""
    Write-Host "✓ The welcome message is now live!" -ForegroundColor Green
    
} catch {
    Write-Host "✗ Failed to connect to server" -ForegroundColor Red
    Write-Host "  Make sure the server is running with: npm start" -ForegroundColor Yellow
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
}
