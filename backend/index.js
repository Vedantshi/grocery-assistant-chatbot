// Load environment variables early
try { require('dotenv').config(); } catch {}

// ...existing code...

const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadData } = require('./src/dataLoader');
const { processMessage } = require('./src/chatLogic');
const { chatWithOllama: chatWithLLM } = require('./src/ollamaService');

// Debug helper (disabled unless DEBUG=1 or NODE_ENV=development)
const DEBUG = process.env.DEBUG === '1' || process.env.NODE_ENV === 'development';
const debug = (...args) => { if (DEBUG) console.log(...args); };

// Global error handler
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
});

const app = express();

// CORS configuration for deployment
// Allows requests from your hosting domain and Cloudflare Tunnel
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    // Allowed origins
    const allowedOrigins = [
      'http://localhost:3333',
      'http://127.0.0.1:3333',
      // Add your deployment domains here:
      // 'https://your-app.vercel.app',
      // 'https://your-app.pages.dev',
      // 'https://your-tunnel-url.trycloudflare.com'
    ];
    
    // Also allow any *.vercel.app, *.pages.dev, *.trycloudflare.com domains
    const allowedPatterns = [
      /\.vercel\.app$/,
      /\.pages\.dev$/,
      /\.trycloudflare\.com$/
    ];
    
    const isAllowed = allowedOrigins.includes(origin) || 
                      allowedPatterns.some(pattern => pattern.test(new URL(origin).hostname));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(null, false); // Don't reject, just deny CORS
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// Set default charset for all responses
// Only set JSON content-type for API routes; let static assets define their own
app.use((req, res, next) => {
  if (req.path && req.path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  next();
});

// Add error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

let data;
try {
  debug('Loading data from:', path.join(__dirname, 'data'));
    data = loadData(path.join(__dirname, 'data'));
  debug('Loaded recipes:', data.recipes?.length || 0);
  debug('Loaded products:', data.products?.length || 0);
    if (!data.recipes || !data.products) {
        throw new Error('Failed to load recipes or products data');
    }
} catch (err) {
    console.error('Failed to load data:', err);
    console.error(err.stack);
    process.exit(1);
}

// simple in-memory session store (for demo only)
const sessions = new Map();
function createSession(){
  const id = Math.random().toString(36).slice(2,10);
  sessions.set(id, { created: Date.now(), context: {} });
  return id;
}

app.get('/api/products', (req, res) => {
  res.json(data.products);
});

app.get('/api/recipes', (req, res) => {
  res.json(data.recipes);
});

app.get('/api/welcome', (req, res) => {
  res.json({
    greeting: "Hi! I'm Bloom 🌱, your grocery assistant. I can help you:\n\n" +
              "🍳 Discover recipes for any meal or occasion\n" +
              "🛒 Find ingredients and check what's in stock\n" +
              "💡 Get cooking tips, substitutions, and alternatives\n" +
              "📅 Plan meals with dietary preferences in mind\n" +
              "🎯 Choose the best recipe when you need help deciding\n" +
              "💬 Have natural conversations about cooking and food\n\n" +
              "What would you like to cook today?",
    mascot: { 
      name: 'Bloom', 
      emoji: '🌱', 
      tagline: 'Your smart grocery companion' 
    }
  });
});

// LLM health/provider endpoint (no secrets exposed)
app.get('/api/llm/health', async (req, res) => {
  try {
    const provider = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? 'openai' : 'ollama');
    const info = { provider, openaiConfigured: !!process.env.OPENAI_API_KEY };
    if (req.query.probe === '1') {
      try {
        const reply = await chatWithLLM('Quick ping', [], [], []);
        info.probe = { ok: true, preview: String(reply || '').slice(0, 40) };
      } catch (e) {
        info.probe = { ok: false, error: e?.message || String(e) };
      }
    }
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: 'Health check failed', details: e?.message || String(e) });
  }
});

// client-side logging endpoint (helps capture browser errors)
app.post('/api/log', (req, res) => {
  try {
    debug('CLIENT LOG:', req.body);
  } catch (e) {
    console.error('Error logging client message', e);
  }
  res.sendStatus(204);
});

app.post('/api/chat', async (req, res) => {
  debug('\n--- Chat Request ---');
  debug('Request body:', req.body);
  
  const { message } = req.body || {};
  let { sessionId } = req.body || {};
  
  if (!message) {
    debug('Error: No message in request');
    return res.status(400).json({ error: 'message required' });
  }
  
  let session = sessions.get(sessionId);
  if (!session){
    debug('Creating new session:', sessionId);
    const newId = createSession();
    session = sessions.get(newId);
    sessionId = newId;
    debug('New session created:', sessionId);
  }
  
  try {
    debug('Processing message:', message);
    debug('Current session context:', session.context);

    // await the async chat logic
    const result = await processMessage(message, data, session.context);

    debug('Process result:', {
      reply: result.reply,
      numRecipes: result.recipes?.length || 0,
      // avoid logging large or non-serializable context directly
    });

    // Persist updated context in-memory
    session.context = result.context || {};

    // Prepare a JSON-safe context for the response (convert Sets to arrays)
    const safeContext = Object.assign({}, session.context);
    if (safeContext.seenRecipes && safeContext.seenRecipes instanceof Set) {
      safeContext.seenRecipes = Array.from(safeContext.seenRecipes);
    }

    const response = {
      reply: result.reply || '',
      recipes: result.recipes || [],
      sessionId,
      context: safeContext
    };

    debug('Sending response:', {
      replyPreview: (response.reply || '').slice(0, 120),
      numRecipes: response.recipes.length
    });

    res.json(response);
  } catch (error) {
    console.error('Error processing message:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
  debug('--- End Chat Request ---\n');
});

const port = process.env.PORT || 3333;
// bind to IPv4 loopback explicitly to avoid IPv6/::1 resolution issues on some Windows setups
const host = process.env.HOST || '127.0.0.1';

try {
    const server = app.listen(port, host, () => {
        const addr = server.address();
        console.log(`Backend listening on http://${addr.address}:${addr.port} (bound to ${host})`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err);
        console.error(err.stack);
        process.exit(1);
    });
} catch (err) {
    console.error('Failed to start server:', err);
    console.error(err.stack);
    process.exit(1);
}
