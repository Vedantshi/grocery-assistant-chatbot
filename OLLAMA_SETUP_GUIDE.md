# 🤖 Ollama Integration Guide for Grocerly

This guide will help you set up Ollama AI to power the Grocerly chatbot with natural language responses.

---

## 📋 What You'll Get

**Before (Rule-Based):**
- Keyword matching responses
- Rigid, template-based replies
- Limited conversational ability

**After (Ollama-Powered):**
- Natural, conversational responses
- Context-aware conversations
- More human-like interactions
- Fallback to rule-based if Ollama fails

---

## 🔧 Step 1: Install Ollama

### Windows Installation

1. **Download Ollama**
   - Go to: https://ollama.com/download
   - Download `OllamaSetup.exe` for Windows
   - File size: ~500MB

2. **Run the Installer**
   - Double-click `OllamaSetup.exe`
   - Follow installation wizard
   - Ollama will install as a Windows service

3. **Verify Installation**
   ```powershell
   ollama --version
   ```
   You should see: `ollama version is 0.x.x`

---

## 🧠 Step 2: Install AI Models

Ollama needs to download language models. Choose one based on your needs:

### Recommended Models:

#### **Option A: Mistral (RECOMMENDED) ⭐**
Best balance of quality and speed for this chatbot.

```powershell
ollama pull mistral
```
- Size: ~4.1 GB
- Speed: Fast
- Quality: Excellent for recipe suggestions
- Best for: Most users

#### **Option B: Llama 3.2**
Latest model from Meta, very capable.

```powershell
ollama pull llama3.2
```
- Size: ~2 GB
- Speed: Very fast
- Quality: Great
- Best for: Newer, efficient model

#### **Option C: Phi-3 (Lightweight)**
Smaller model, faster but less capable.

```powershell
ollama pull phi3
```
- Size: ~2.2 GB
- Speed: Very fast
- Quality: Good
- Best for: Older/slower computers

### Download Time:
- Depends on your internet speed
- Mistral: 5-15 minutes on average connection

---

## ✅ Step 3: Verify Ollama is Running

### Check Service Status:

```powershell
# Check if Ollama is accessible
curl http://localhost:11434
```

**Expected output:** `Ollama is running`

### Test the Model:

```powershell
ollama run mistral "Tell me about healthy recipes"
```

You should see a response from the AI. Type `/bye` to exit.

### Check Installed Models:

```powershell
ollama list
```

---

## 🚀 Step 4: Start Your Application

Your code is already updated! Now just start the backend:

```powershell
cd "d:\Projects\Updated Grocery Site\backend"
npm start
```

The chatbot will now:
1. Use **Ollama** for natural language responses
2. Keep the **smart recipe matching** algorithm
3. **Fallback** to rule-based responses if Ollama fails

---

## 🔍 Troubleshooting

### Problem: "ECONNREFUSED" Error

**Cause:** Ollama service is not running

**Solution:**
```powershell
# Manually start Ollama
ollama serve
```

Or restart the Ollama service:
1. Open Task Manager
2. Find "Ollama" service
3. Restart it

---

### Problem: Slow Responses

**Causes:**
- Model is too large for your hardware
- First request is slow (model loading)

**Solutions:**
1. Try a smaller model (phi3 instead of mistral)
2. First response is always slower - subsequent ones are faster
3. Increase timeout in code if needed

---

### Problem: Model Not Found

**Error:** `model 'mistral' not found`

**Solution:**
```powershell
ollama pull mistral
```

Make sure the model name in `ollamaService.js` matches what you pulled.

---

## ⚙️ Customization

### Change the Model

Edit `backend/src/ollamaService.js` line 31:

```javascript
model: 'mistral',  // Change to 'llama3.2', 'phi3', etc.
```

### Adjust Response Length

In `ollamaService.js`:

```javascript
options: {
    temperature: 0.7,      // Creativity (0.0-1.0)
    num_predict: 150       // Max response length
}
```

### Modify Personality

Edit the `SYSTEM_PROMPT` in `ollamaService.js` to change Bloom's personality!

---

## 🧪 Testing the Integration

### Test Queries:

1. **Simple greeting:**
   - User: "hi"
   - Should get warm, natural greeting

2. **Recipe request:**
   - User: "quick healthy dinner"
   - Should mention specific recipe names naturally

3. **More button:**
   - User: "more"
   - Should suggest additional recipes conversationally

4. **Context awareness:**
   - User: "something with chicken"
   - Then: "make it healthy"
   - Should remember the chicken context

---

## 📊 Performance Expectations

### First Request:
- **Time:** 5-15 seconds (model loading)
- **Normal behavior**

### Subsequent Requests:
- **Time:** 1-3 seconds
- **Much faster**

### Model Memory Usage:
- **Mistral:** ~4 GB RAM
- **Llama 3.2:** ~2 GB RAM
- **Phi-3:** ~2 GB RAM

---

## 🔄 Switching Between Rule-Based and Ollama

The system has built-in fallback:

1. **Ollama working:** Natural AI responses
2. **Ollama fails:** Automatic fallback to rule-based
3. **No interruption:** User never sees errors

---

## 💡 Advanced: Running Multiple Models

You can have multiple models installed:

```powershell
ollama pull mistral
ollama pull llama3.2
ollama pull phi3
```

Then switch by changing the model name in code.

---

## 📝 Quick Command Reference

```powershell
# Check version
ollama --version

# List installed models
ollama list

# Pull a model
ollama pull mistral

# Run model interactively
ollama run mistral

# Check if Ollama is running
curl http://localhost:11434

# Start Ollama service
ollama serve

# Remove a model
ollama rm mistral
```

---

## ✨ Benefits of This Integration

✅ **Hybrid Approach:**
- Smart recipe matching (existing logic)
- Natural language responses (Ollama)
- Best of both worlds!

✅ **Reliable:**
- Automatic fallback to rule-based
- No breaking changes

✅ **Contextual:**
- Remembers conversation
- More engaging interactions

✅ **Offline:**
- No API keys needed
- No internet required (after model download)
- Free forever!

---

## 🎉 Success Checklist

- [ ] Ollama installed and running
- [ ] Model downloaded (mistral recommended)
- [ ] Test query returns natural response
- [ ] Recipe names mentioned in responses
- [ ] Backend starts without errors
- [ ] Chatbot responds conversationally

---

## 🆘 Need Help?

**Ollama not starting?**
- Check Windows Services for "Ollama"
- Try `ollama serve` manually

**Out of memory?**
- Use phi3 instead of mistral
- Close other applications

**Wrong model?**
- Check model name: `ollama list`
- Update `ollamaService.js` to match

---

## 🚀 You're All Set!

Your Grocerly chatbot now has AI superpowers! Enjoy natural, contextual conversations with Bloom 🌱!

**Next steps:**
1. Start your backend: `npm start`
2. Open the app in browser
3. Chat with the new and improved Bloom!
