# Ollama Setup Script for Grocerly
# Run this script to verify and setup Ollama

Write-Host "🤖 Grocerly Ollama Setup Script" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Green

# Step 1: Check if Ollama is installed
Write-Host "Step 1: Checking if Ollama is installed..." -ForegroundColor Yellow
$ollamaInstalled = Get-Command ollama -ErrorAction SilentlyContinue

if ($ollamaInstalled) {
    Write-Host "✅ Ollama is installed!" -ForegroundColor Green
    $version = & ollama --version
    Write-Host "   Version: $version`n" -ForegroundColor Cyan
} else {
    Write-Host "❌ Ollama is NOT installed" -ForegroundColor Red
    Write-Host "   Please download from: https://ollama.com/download`n" -ForegroundColor Yellow
    exit 1
}

# Step 2: Check if Ollama service is running
Write-Host "Step 2: Checking if Ollama is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:11434" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Ollama service is running!`n" -ForegroundColor Green
} catch {
    Write-Host "❌ Ollama service is NOT running" -ForegroundColor Red
    Write-Host "   Starting Ollama service..." -ForegroundColor Yellow
    Start-Process "ollama" -ArgumentList "serve" -NoNewWindow
    Start-Sleep -Seconds 3
    Write-Host "   Service started!`n" -ForegroundColor Green
}

# Step 3: Check installed models
Write-Host "Step 3: Checking installed models..." -ForegroundColor Yellow
$models = & ollama list

if ($models -match "mistral") {
    Write-Host "✅ Mistral model is installed!`n" -ForegroundColor Green
} elseif ($models -match "llama") {
    Write-Host "⚠️  Llama model found (not Mistral)" -ForegroundColor Yellow
    Write-Host "   You can use it, but update ollamaService.js line 31`n" -ForegroundColor Yellow
} elseif ($models -match "phi") {
    Write-Host "⚠️  Phi model found (not Mistral)" -ForegroundColor Yellow
    Write-Host "   You can use it, but update ollamaService.js line 31`n" -ForegroundColor Yellow
} else {
    Write-Host "❌ No suitable model installed" -ForegroundColor Red
    Write-Host "   Would you like to install Mistral? (Recommended)" -ForegroundColor Yellow
    Write-Host "   This will download ~4GB of data`n" -ForegroundColor Yellow
    
    $choice = Read-Host "Install Mistral? (y/n)"
    if ($choice -eq "y" -or $choice -eq "Y") {
        Write-Host "`n   Downloading Mistral model..." -ForegroundColor Cyan
        Write-Host "   This may take 5-15 minutes depending on your connection...`n" -ForegroundColor Cyan
        & ollama pull mistral
        Write-Host "`n✅ Mistral installed!`n" -ForegroundColor Green
    } else {
        Write-Host "`n   Skipping model installation" -ForegroundColor Yellow
        Write-Host "   Run 'ollama pull mistral' manually when ready`n" -ForegroundColor Yellow
    }
}

# Step 4: Test Ollama
Write-Host "Step 4: Testing Ollama connection..." -ForegroundColor Yellow
Write-Host "   Sending test query..." -ForegroundColor Cyan

try {
    $testBody = @{
        model = "mistral"
        messages = @(
            @{
                role = "user"
                content = "Say 'Hello from Grocerly!' in 5 words or less"
            }
        )
        stream = $false
    } | ConvertTo-Json -Depth 10

    $testResponse = Invoke-RestMethod -Uri "http://localhost:11434/api/chat" -Method Post -Body $testBody -ContentType "application/json" -TimeoutSec 30
    
    Write-Host "✅ Ollama is responding!" -ForegroundColor Green
    Write-Host "   Test response: $($testResponse.message.content)`n" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Ollama test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure the model is installed and running`n" -ForegroundColor Yellow
}

# Summary
Write-Host "================================" -ForegroundColor Green
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Green

Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Start your backend:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Cyan
Write-Host "   npm start`n" -ForegroundColor Cyan

Write-Host "2. Open your app in browser" -ForegroundColor White
Write-Host "   http://localhost:3333`n" -ForegroundColor Cyan

Write-Host "3. Chat with Bloom and enjoy AI-powered responses!`n" -ForegroundColor White

Write-Host "📖 Full guide: OLLAMA_SETUP_GUIDE.md`n" -ForegroundColor Gray
