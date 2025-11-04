const request = require('supertest');
const express = require('express');
const cors = require('cors');
const path = require('path');

// Mock dependencies
jest.mock('../src/dataLoader', () => ({
  loadData: jest.fn(() => ({
    products: [
      { item: 'Chicken', category: 'Meat', price: 5.99, _normalized: 'chicken', unit: 'per lb' },
      { item: 'Rice', category: 'Grains', price: 2.99, _normalized: 'rice', unit: 'per bag' }
    ],
    recipes: [
      {
        name: 'Chicken Stir Fry',
        ingredients: [{ name: 'chicken', quantity: '1 lb' }],
        steps: 'Cook chicken',
        mealType: 'dinner'
      }
    ]
  }))
}));

jest.mock('../src/chatLogic', () => ({
  processMessage: jest.fn(async (message, data, context) => {
    // Handle flow triggers with appropriate responses
    if (message === '__BUDGET_START__') {
      return {
        reply: '💰 **Budget Planner**\n\nWhat I do: I help you find recipes within your budget.',
        recipes: [],
        context: {
          budgetFlow: 'awaiting_input',
          seenRecipes: new Set(),
          messages: [
            { from: 'user', text: message },
            { from: 'bot', text: '💰 **Budget Planner**' }
          ]
        }
      };
    }
    
    // Default response for other messages
    return {
      reply: `Processed: ${message}`,
      recipes: [{
        name: 'Test Recipe',
        ingredients: [{ name: 'ingredient1' }],
        steps: ['step1'],
        mealType: 'dinner'
      }],
      context: {
        seenRecipes: new Set(['Test Recipe']),
        messages: [
          { from: 'user', text: message },
          { from: 'bot', text: 'Reply' }
        ]
      }
    };
  })
}));

jest.mock('../src/ollamaService', () => ({
  chatWithOllama: jest.fn(async () => 'Mock LLM response')
}));

// Create test app
function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  
  const { loadData } = require('../src/dataLoader');
  const { processMessage } = require('../src/chatLogic');
  const { chatWithOllama } = require('../src/ollamaService');
  
  const data = loadData(path.join(__dirname, '..', 'data'));
  const sessions = new Map();
  
  function createSession() {
    const id = Math.random().toString(36).slice(2, 10);
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
      greeting: "Hi! I'm Sage 🌿, your grocery assistant.",
      mascot: { name: 'Sage', emoji: '🌿', tagline: 'Your smart grocery companion' }
    });
  });
  
  app.get('/api/llm/health', async (req, res) => {
    try {
      const provider = 'ollama';
      const info = { provider, openaiConfigured: false };
      if (req.query.probe === '1') {
        try {
          const reply = await chatWithOllama('ping', [], [], []);
          info.probe = { ok: true, preview: String(reply || '').slice(0, 40) };
        } catch (e) {
          info.probe = { ok: false, error: e?.message || String(e) };
        }
      }
      res.json(info);
    } catch (e) {
      res.status(500).json({ error: 'Health check failed', details: e?.message });
    }
  });
  
  app.post('/api/log', (req, res) => {
    res.sendStatus(204);
  });
  
  app.post('/api/chat', async (req, res) => {
    const { message } = req.body || {};
    let { sessionId } = req.body || {};
    
    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }
    
    let session = sessions.get(sessionId);
    if (!session) {
      const newId = createSession();
      session = sessions.get(newId);
      sessionId = newId;
    }
    
    try {
      const result = await processMessage(message, data, session.context);
      session.context = result.context || {};
      
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
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  });
  
  return app;
}

describe('API Endpoints', () => {
  let app;
  
  beforeEach(() => {
    jest.clearAllMocks();
    app = createTestApp();
  });
  
  describe('GET /api/products', () => {
    test('should return list of products', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('item');
      expect(response.body[0]).toHaveProperty('price');
    });
    
    test('should return products with correct structure', async () => {
      const response = await request(app).get('/api/products');
      
      const product = response.body[0];
      expect(product).toHaveProperty('item');
      expect(product).toHaveProperty('category');
      expect(product).toHaveProperty('price');
      expect(product).toHaveProperty('_normalized');
    });
  });
  
  describe('GET /api/recipes', () => {
    test('should return list of recipes', async () => {
      const response = await request(app)
        .get('/api/recipes')
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('ingredients');
    });
    
    test('should return recipes with correct structure', async () => {
      const response = await request(app).get('/api/recipes');
      
      const recipe = response.body[0];
      expect(recipe).toHaveProperty('name');
      expect(recipe).toHaveProperty('ingredients');
      expect(recipe).toHaveProperty('steps');
      expect(Array.isArray(recipe.ingredients)).toBe(true);
    });
  });
  
  describe('GET /api/welcome', () => {
    test('should return welcome message', async () => {
      const response = await request(app)
        .get('/api/welcome')
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('greeting');
      expect(response.body).toHaveProperty('mascot');
      expect(response.body.greeting).toContain('Sage');
    });
    
    test('should return mascot information', async () => {
      const response = await request(app).get('/api/welcome');
      
      expect(response.body.mascot).toHaveProperty('name');
      expect(response.body.mascot).toHaveProperty('emoji');
      expect(response.body.mascot).toHaveProperty('tagline');
      expect(response.body.mascot.name).toBe('Sage');
    });
  });
  
  describe('GET /api/llm/health', () => {
    test('should return LLM provider info', async () => {
      const response = await request(app)
        .get('/api/llm/health')
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('provider');
      expect(response.body).toHaveProperty('openaiConfigured');
    });
    
    test('should probe LLM when requested', async () => {
      const response = await request(app)
        .get('/api/llm/health?probe=1')
        .expect(200);
      
      expect(response.body).toHaveProperty('probe');
      expect(response.body.probe).toHaveProperty('ok');
    });
    
    test('should handle probe errors gracefully', async () => {
      const { chatWithOllama } = require('../src/ollamaService');
      chatWithOllama.mockRejectedValueOnce(new Error('Connection failed'));
      
      const response = await request(app)
        .get('/api/llm/health?probe=1')
        .expect(200);
      
      expect(response.body.probe.ok).toBe(false);
      expect(response.body.probe).toHaveProperty('error');
    });
  });
  
  describe('POST /api/log', () => {
    test('should accept client logs', async () => {
      await request(app)
        .post('/api/log')
        .send({ level: 'error', message: 'Test error' })
        .expect(204);
    });
    
    test('should handle empty log payload', async () => {
      await request(app)
        .post('/api/log')
        .send({})
        .expect(204);
    });
  });
  
  describe('POST /api/chat', () => {
    test('should process chat message successfully', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'give me recipes' })
        .expect(200)
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('reply');
      expect(response.body).toHaveProperty('recipes');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('context');
    });
    
    test('should create new session if not provided', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'hello' })
        .expect(200);
      
      expect(response.body.sessionId).toBeDefined();
      expect(typeof response.body.sessionId).toBe('string');
    });
    
    test('should maintain session context', async () => {
      const firstResponse = await request(app)
        .post('/api/chat')
        .send({ message: 'first message' })
        .expect(200);
      
      const sessionId = firstResponse.body.sessionId;
      
      const secondResponse = await request(app)
        .post('/api/chat')
        .send({ message: 'second message', sessionId })
        .expect(200);
      
      expect(secondResponse.body.sessionId).toBe(sessionId);
    });
    
    test('should return error for missing message', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('message required');
    });
    
    test('should return recipes array', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'show me recipes' })
        .expect(200);
      
      expect(Array.isArray(response.body.recipes)).toBe(true);
      expect(response.body.recipes.length).toBeGreaterThan(0);
    });
    
    test('should convert Set to array in context', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'test' })
        .expect(200);
      
      expect(response.body.context.seenRecipes).toBeDefined();
      expect(Array.isArray(response.body.context.seenRecipes)).toBe(true);
    });
    
    test('should handle processing errors', async () => {
      const { processMessage } = require('../src/chatLogic');
      processMessage.mockRejectedValueOnce(new Error('Processing failed'));
      
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'error test' })
        .expect(500);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Internal server error');
    });
    
    test('should handle special flow triggers', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: '__NUTRITION_START__' })
        .expect(200);
      
      expect(response.body.reply).toBeDefined();
    });
  });
  
  describe('CORS', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);
      
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });
  
  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('Content-Type', 'application/json')
        .send('{"malformed": ')
        .expect(400);
    });
    
    test('should handle invalid endpoints', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });
  });
  
  describe('Session Management', () => {
    test('should persist context across multiple requests', async () => {
      const first = await request(app)
        .post('/api/chat')
        .send({ message: 'first' });
      
      const sessionId = first.body.sessionId;
      
      const second = await request(app)
        .post('/api/chat')
        .send({ message: 'second', sessionId });
      
      expect(second.body.sessionId).toBe(sessionId);
      expect(second.body.context).toBeDefined();
    });
    
    test('should handle invalid sessionId', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'test', sessionId: 'invalid123' })
        .expect(200);
      
      expect(response.body.sessionId).toBeDefined();
      // Should create new session
      expect(response.body.sessionId).not.toBe('invalid123');
    });
  });
});

describe('API Integration Tests', () => {
  let app;
  
  beforeAll(() => {
    app = createTestApp();
  });
  
  test('should complete a full conversation flow', async () => {
    // Step 1: Get welcome message
    const welcome = await request(app).get('/api/welcome').expect(200);
    expect(welcome.body.greeting).toBeDefined();
    
    // Step 2: Start chat
    const chat1 = await request(app)
      .post('/api/chat')
      .send({ message: 'hello' })
      .expect(200);
    
    const sessionId = chat1.body.sessionId;
    
    // Step 3: Ask for recipes
    const chat2 = await request(app)
      .post('/api/chat')
      .send({ message: 'give me recipes', sessionId })
      .expect(200);
    
    expect(chat2.body.recipes).toBeDefined();
    expect(chat2.body.recipes.length).toBeGreaterThan(0);
    
    // Step 4: Get products
    const products = await request(app).get('/api/products').expect(200);
    expect(products.body.length).toBeGreaterThan(0);
  });
  
  test('should handle budget flow end-to-end', async () => {
    const step1 = await request(app)
      .post('/api/chat')
      .send({ message: '__BUDGET_START__' })
      .expect(200);
    
    expect(step1.body.reply).toContain('Budget Planner');
    
    const sessionId = step1.body.sessionId;
    
    const step2 = await request(app)
      .post('/api/chat')
      .send({ message: '$20 for 2 servings', sessionId })
      .expect(200);
    
    expect(step2.body.recipes).toBeDefined();
  });
});
