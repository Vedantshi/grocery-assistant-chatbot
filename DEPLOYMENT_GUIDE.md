# 🚀 Free Deployment Guide - Option A

## **100% Free Demo Deployment**
**Host frontend on Vercel/Cloudflare + Expose local backend via tunnel**

This guide shows you how to deploy your Grocery Assistant Chatbot **completely free** by:
1. Hosting the **frontend** (HTML/CSS/JS) on free static hosting (Vercel, Cloudflare Pages, or GitHub Pages)
2. Running your **backend + Ollama LLM** locally on your laptop
3. Exposing your local backend with a **Cloudflare Tunnel**

---

## **📋 Prerequisites**

- ✅ Node.js 16+ installed
- ✅ Ollama installed with model `gpt-oss:120b-cloud` (or your preferred model)
- ✅ Git installed and project pushed to GitHub
- ✅ Your laptop stays on during demo/testing

---

## **Part 1: Set Up Cloudflare Tunnel (Expose Local Backend)**

### **Step 1: Install Cloudflared**

**Windows (PowerShell as Administrator):**
```powershell
# Download cloudflared
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$env:USERPROFILE\cloudflared.exe"

# Move to a permanent location
Move-Item "$env:USERPROFILE\cloudflared.exe" "C:\Program Files\cloudflared.exe" -Force

# Add to PATH (restart PowerShell after this)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files", "Machine")

# Verify installation
cloudflared --version
```

**Mac/Linux:**
```bash
# Mac (Homebrew)
brew install cloudflared

# Linux (Debian/Ubuntu)
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
sudo mv cloudflared-linux-amd64 /usr/local/bin/cloudflared
sudo chmod +x /usr/local/bin/cloudflared

# Verify
cloudflared --version
```

### **Step 2: Start Your Backend Server**

```powershell
cd "d:\Projects\Updated Grocery Site\backend"

# Make sure Ollama is running
ollama serve

# Start your backend (in a new terminal)
node index.js
```

You should see: `Backend listening on http://127.0.0.1:3333`

### **Step 3: Create Cloudflare Tunnel**

**Quick Tunnel (No login, temporary URL):**
```powershell
# This creates a temporary public URL
cloudflared tunnel --url http://localhost:3333
```

You'll see output like:
```
2025-10-31T12:34:56Z INF +--------------------------------------------------------------------------------------------+
2025-10-31T12:34:56Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2025-10-31T12:34:56Z INF |  https://random-word-1234.trycloudflare.com                                                |
2025-10-31T12:34:56Z INF +--------------------------------------------------------------------------------------------+
```

**📝 Copy this URL!** This is your `BACKEND_URL`.

**Permanent Tunnel (Recommended for longer demos):**
```powershell
# Login to Cloudflare (opens browser)
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create grocery-backend

# Route tunnel to local port 3333
cloudflared tunnel route dns grocery-backend grocery-backend.yourdomain.com

# Run the tunnel
cloudflared tunnel run grocery-backend
```

---

## **Part 2: Deploy Frontend to Hosting**

### **Option A: Vercel (Easiest)**

1. **Go to https://vercel.com/new**
2. **Import your GitHub repository**: `Vedantshi/grocery-assistant-chatbot`
3. **Configure build settings:**
   - Framework Preset: **Other**
   - Root Directory: `.` (leave default)
   - Output Directory: `backend/public`
   - Install Command: `echo "No build needed"`
   - Build Command: `echo "Static files"`
4. **Add Environment Variable:**
   - Name: `BACKEND_URL`
   - Value: `https://random-word-1234.trycloudflare.com` (your tunnel URL)
5. **Click "Deploy"**

Your site will be live at: `https://your-app.vercel.app`

### **Option B: Cloudflare Pages**

1. **Go to https://dash.cloudflare.com/ → Pages**
2. **Click "Create a project" → "Connect to Git"**
3. **Select your GitHub repo**: `grocery-assistant-chatbot`
4. **Build settings:**
   - Build command: `echo "Static"`
   - Build output directory: `backend/public`
5. **Click "Save and Deploy"**

Your site will be live at: `https://your-app.pages.dev`

### **Option C: GitHub Pages**

1. **In your GitHub repo** `Vedantshi/grocery-assistant-chatbot`
2. **Go to Settings → Pages**
3. **Source**: Deploy from a branch
4. **Branch**: `main` → `/ (root)` → Save
5. **Wait 1-2 minutes**

Your site will be at: `https://vedantshi.github.io/grocery-assistant-chatbot/`

**Note**: GitHub Pages serves from root, so you may need to copy `backend/public/*` to root or configure routes.

---

## **Part 3: Configure Frontend to Use Tunnel**

### **Method 1: Update index.html directly (For GitHub Pages)**

Edit `backend/public/index.html`:

```html
<script>
  window.env = {
    BACKEND_URL: 'https://your-tunnel-url.trycloudflare.com' // Your actual tunnel URL
  };
</script>
```

Commit and push:
```powershell
cd "d:\Projects\Updated Grocery Site"
git add .
git commit -m "Configure backend URL for deployment"
git push
```

### **Method 2: Use Build Environment Variables (Vercel/Cloudflare)**

Vercel and Cloudflare Pages automatically replace environment variables at build time.

---

## **Part 4: Test Your Deployment**

1. **Open your deployed frontend**:
   - Vercel: `https://your-app.vercel.app`
   - Cloudflare: `https://your-app.pages.dev`
   - GitHub Pages: `https://vedantshi.github.io/grocery-assistant-chatbot/`

2. **Check browser console** (F12) for any errors

3. **Test the chat**:
   - Type: "give me 3 protein rich recipes"
   - Should connect to your local backend via tunnel

4. **Verify tunnel is working**:
   ```powershell
   # In terminal running cloudflared, you should see:
   # GET /api/chat 200
   ```

---

## **🔧 Troubleshooting**

### **CORS Errors**

If you see `CORS policy blocked` in browser console:

1. **Add your hosting domain to CORS allowlist in `backend/index.js`**:

```javascript
const allowedOrigins = [
  'http://localhost:3333',
  'http://127.0.0.1:3333',
  'https://your-app.vercel.app',        // Add your Vercel domain
  'https://your-app.pages.dev',         // Add your Cloudflare domain
  'https://vedantshi.github.io'         // Add your GitHub Pages domain
];
```

2. **Restart your backend server**

### **Tunnel Connection Failed**

- ✅ Check if `cloudflared` is still running
- ✅ Check if backend is running on port 3333
- ✅ Try creating a new tunnel (quick tunnel URLs expire)
- ✅ Check firewall settings

### **Backend Not Responding**

- ✅ Verify Ollama is running: `ollama list`
- ✅ Check backend logs for errors
- ✅ Test locally first: `curl http://localhost:3333/api/llm/health`

### **Frontend Shows "localhost" Error**

- ✅ Make sure you updated `window.env.BACKEND_URL` in index.html
- ✅ Clear browser cache (Ctrl+Shift+R)
- ✅ Check browser DevTools → Network tab for actual request URLs

---

## **💰 Cost Breakdown**

| Service | Free Tier | Your Cost |
|---------|-----------|-----------|
| **Vercel** | 100 GB bandwidth/month | **$0** |
| **Cloudflare Pages** | Unlimited bandwidth | **$0** |
| **GitHub Pages** | 100 GB bandwidth/month | **$0** |
| **Cloudflare Tunnel** | Unlimited | **$0** |
| **Ollama (Local)** | Free, uses your GPU | **$0** |
| **Total** | | **$0/month** 🎉 |

---

## **📊 Performance Expectations**

- **Latency**: 100-500ms (depends on your internet speed)
- **Uptime**: Only when your laptop is on
- **Concurrent Users**: 10-20 (limited by your laptop + internet)

---

## **🎯 Quick Start Commands**

**Start everything:**
```powershell
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Backend
cd "d:\Projects\Updated Grocery Site\backend"
node index.js

# Terminal 3: Start Tunnel
cloudflared tunnel --url http://localhost:3333
```

**Stop everything:**
```powershell
# Press Ctrl+C in each terminal
```

---

## **🚀 Next Steps (Production)**

For a production deployment (24/7 uptime without your laptop):

1. **Option B**: Deploy backend to cloud VM (AWS EC2, Google Cloud, DigitalOcean)
2. **Option C**: Use OpenAI API instead of local Ollama (requires API key)
3. **Option D**: Deploy Ollama to a VPS with GPU support

See `TECHNICAL_STACK.md` for more deployment options.

---

## **📝 Deployment Checklist**

- [ ] Cloudflared installed and tested
- [ ] Backend running locally on port 3333
- [ ] Ollama running with model loaded
- [ ] Tunnel created and URL copied
- [ ] Frontend deployed to Vercel/Cloudflare/GitHub Pages
- [ ] `window.env.BACKEND_URL` updated with tunnel URL
- [ ] CORS configured in backend/index.js
- [ ] Tested chat functionality end-to-end
- [ ] Shared link with friends/demo audience

---

**🎉 Congratulations!** Your Grocery Assistant Chatbot is now live and accessible worldwide while running on your laptop!

**Share your link**: `https://your-app.vercel.app`

---

**Last Updated**: October 31, 2025  
**Maintainer**: Vedantshi  
**Repository**: https://github.com/Vedantshi/grocery-assistant-chatbot
