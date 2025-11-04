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
    console.error('!!! UNCAUGHT EXCEPTION !!!');
    console.error('Uncaught Exception:', err);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('!!! UNHANDLED REJECTION !!!');
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
    process.exit(1);
});

const app = express();

// CORS configuration for deployment - Allow all origins for now
app.use(cors({
  origin: true,
  credentials: true,
  optionsSuccessStatus: 200
}));
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
  // Dynamic greetings based on time of day
  const hour = new Date().getHours();
  let timeGreeting;
  let suggestionEmoji;
  let contextualMessage;
  
  if (hour < 12) {
    timeGreeting = "Good morning";
    suggestionEmoji = "☕";
    contextualMessage = "Ready to start your day with a nutritious breakfast? I can also share nutrition facts, explain food benefits, or help you understand what your body needs!";
  } else if (hour < 17) {
    timeGreeting = "Good afternoon";
    suggestionEmoji = "🥗";
    contextualMessage = "Looking for a healthy lunch idea? Or maybe you're curious about nutrition labels, food storage tips, or which ingredients pair well together?";
  } else {
    timeGreeting = "Good evening";
    suggestionEmoji = "🍽️";
    contextualMessage = "Let's find you something delicious for dinner! I can also explain healthy substitutions, teach you about meal timing, or answer any food-related questions.";
  }
  
  res.json({
    greeting: `${timeGreeting}! I'm Sage 🌿\n\n` +
              `I'm your personal food & health companion—here to make grocery shopping easier, ` +
              `help you eat better, and save time and money along the way.\n\n` +
              `I can guide you on **nutrition**, help you **understand your calorie needs**, suggest **smart food swaps**, ` +
              `and give you **practical tips** on meal planning, ingredient storage, and eating mindfully.\n\n` +
              `Whether you're **watching your budget**, **short on time**, **eating healthier**, ` +
              `or just **figuring out what to make with what you have**—I've got you covered.\n\n` +
              `${suggestionEmoji} **${contextualMessage}**\n\n` +
              `*Ask me anything about food, nutrition, or recipes—let's chat!*`,
    mascot: { 
      name: 'Sage', 
      emoji: '🌿', 
      tagline: 'Your personal food & health companion',
      timeOfDay: timeGreeting
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
      context: safeContext,
      // Optional extras from chat logic
      shopping: result.shopping || undefined,
      products: result.products || undefined
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
// For cloud deployment, bind to 0.0.0.0 (all interfaces). For local dev, use 127.0.0.1
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

try {
    const server = app.listen(port, host, () => {
        const addr = server.address();
        console.log(`Backend listening on http://${addr.address}:${addr.port} (bound to ${host})`);
    });

  server.on('error', (err) => {
    console.error('!!! SERVER ERROR OCCURRED !!!');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error stack:', err.stack);
    process.exit(1);
    });
} catch (err) {
    console.error('Failed to start server:', err);
    console.error(err.stack);
    process.exit(1);
}
