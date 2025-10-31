# 🚀 Technical Stack & Project Architecture

## **Technology Stack**

### **Backend**
- **Runtime**: Node.js (v16+)
- **Framework**: Express.js 4.18.2
- **Language**: JavaScript (ES6+)
- **Package Manager**: npm

### **Frontend**
- **Framework**: Vanilla JavaScript (React-style)
- **UI**: HTML5 + CSS3
- **HTTP Client**: Axios
- **Styling**: Custom CSS with dark theme

### **AI/LLM Integration**
- **Primary**: Ollama (Local LLM hosting)
  - Model: `gpt-oss:120b-cloud` (configurable)
  - API: REST API (http://localhost:11434)

### **Data Layer**
- **Format**: CSV files
  - `Sample_Grocery_Data.csv` (products)
  - `Sample_Recipes_Data.csv` (recipes)
- **Parser**: csv-parse 5.4.0

### **Key Dependencies**
```json
{
  "axios": "^1.12.2",        // HTTP requests to Ollama/OpenAI
  "cors": "^2.8.5",          // Cross-Origin Resource Sharing
  "csv-parse": "^5.4.0",     // CSV data parsing
  "express": "^4.18.2",      // Web server framework
  "dotenv": "^16.4.5",       // Environment variable management
  "openai": "^4.56.0"        // OpenAI SDK (optional)
}
```

### **Development Tools**
- **Testing**: Jest 29.6.1
- **Hot Reload**: Nodemon 2.0.22
- **Version Control**: Git + GitHub

---

## **📂 Project Structure & File Flow**

```
Updated Grocery Site/
│
├── backend/                          # Server-side application
│   ├── index.js                      # ⭐ MAIN ENTRY POINT
│   ├── package.json                  # Dependencies & scripts
│   ├── .env                          # Environment config (NOT in Git)
│   ├── .env.example                  # Template for .env
│   │
│   ├── data/                         # Data source
│   │   ├── Sample_Grocery_Data.csv   # Product catalog
│   │   └── Sample_Recipes_Data.csv   # Recipe database
│   │
│   ├── src/                          # Core business logic
│   │   ├── dataLoader.js             # CSV parsing & caching
│   │   ├── ollamaService.js          # LLM provider abstraction
│   │   └── chatLogic.js              # Chat processing & recipe matching
│   │
│   ├── public/                       # Frontend files (served as static)
│   │   ├── index.html                # UI entry point
│   │   ├── app.js                    # Frontend JavaScript
│   │   └── styles.css                # Styling
│   │
│   ├── tests/                        # Unit tests
│   │   └── dataLoader.test.js
│   │
│   └── scripts/                      # Utility scripts
│       └── llm_probe.js              # LLM testing without server
│
├── OLLAMA_SETUP_GUIDE.md            # Ollama installation guide
├── README.md                         # Project overview
└── .gitignore                        # Git exclusion rules
```

---

## **🔄 Request Flow Diagram**

### **1. Application Startup**

```
User runs: npm start
    ↓
backend/index.js (Entry Point)
    ├── require('dotenv').config()               → Load .env variables
    ├── require('./src/dataLoader')              → Initialize data loader
    ├── require('./src/ollamaService')           → Initialize LLM service
    ├── require('./src/chatLogic')               → Initialize chat engine
    ↓
Express Server starts on port 3333
    ├── Serve static files from /public
    ├── Mount API routes:
    │   ├── GET  /api/products                   → Returns product catalog
    │   ├── GET  /api/recipes                    → Returns recipe database
    │   ├── POST /api/chat                       → Processes user messages
    │   └── GET  /api/llm/health                 → LLM health check
    ↓
Server listening on http://127.0.0.1:3333
```

---

### **2. User Opens Browser**

```
User navigates to: http://127.0.0.1:3333
    ↓
Express serves: backend/public/index.html
    ↓
Browser loads:
    ├── public/styles.css                        → UI styling
    └── public/app.js                            → Frontend logic
    ↓
Frontend initialization:
    ├── Fetch GET /api/products                  → Load product list
    ├── Fetch GET /api/recipes                   → Load recipe list
    └── Display welcome message
```

---

### **3. User Sends Chat Message**

```
User types: "give me 3 protein rich recipes"
    ↓
Frontend (app.js)
    ├── captureMessage()                         → Get user input
    ├── displayMessage(user, message)            → Show user message
    └── fetch POST /api/chat { message }         → Send to backend
    ↓
Backend (index.js) receives POST /api/chat
    ↓
Route handler calls: processMessage(message, context, loadedData)
    ↓
chatLogic.js → processMessage()
    ├── 1. Parse user intent
    │   ├── isGreeting? → Return friendly greeting
    │   ├── isShoppingList? → Return list items
    │   ├── needsRecipeSuggestion? → Continue
    │   └── Extract recipe count: "3"
    │
    ├── 2. Check if themed request
    │   └── isThemedRequest? → Skip dataset, use LLM only
    │
    ├── 3. Check if formatting request
    │   └── isFormattingRequest? → Extract previous recipe names
    │
    ├── 4. Call LLM for recipe generation
    │   ↓
    │   ollamaService.js → suggestWithOllama()
    │       ├── Build system prompt with JSON schema
    │       ├── Add conversation context
    │       ├── POST http://localhost:11434/api/chat
    │       │   {
    │       │     model: "gpt-oss:120b-cloud",
    │       │     messages: [...],
    │       │     format: "json",
    │       │     options: { num_predict: 2000 }
    │       │   }
    │       ↓
    │       Ollama LLM generates:
    │       {
    │         "reply": "Here are 3 protein-rich recipes!",
    │         "reasoning": "These recipes are high in protein...",
    │         "recipes": [
    │           {
    │             "name": "Protein Smoothie",
    │             "ingredients": ["..."],
    │             "steps": ["..."],
    │             "mealType": "breakfast",
    │             "autogenerated": true
    │           },
    │           // ... 2 more recipes
    │         ]
    │       }
    │       ↓
    │   Return parsed JSON
    │
    ├── 5. Process LLM response
    │   ├── Extract recipes array
    │   ├── Normalize ingredients/steps
    │   ├── Enrich with product availability
    │   └── Build final reply with reasoning
    │
    ├── 6. Update context
    │   ├── Add recipe names to seenRecipes
    │   ├── Store in allSuggestedRecipes
    │   └── Update conversation history
    │
    └── 7. Return response
        {
          reply: "Here are 3 protein-rich recipes!\n\n💡 These recipes...",
          recipes: [...],
          context: {...}
        }
    ↓
Backend sends JSON response to frontend
    ↓
Frontend (app.js) receives response
    ├── displayMessage(bot, reply)               → Show text response
    └── displayRecipeCards(recipes)              → Render recipe cards
        ├── For each recipe:
        │   ├── Show name, meal type
        │   ├── List ingredients (check availability)
        │   ├── "Add Ingredients" button
        │   └── "More" button (expand for steps)
        └── Update shopping list if needed
```

---

## **🧩 Key File Responsibilities**

### **backend/index.js** (Main Entry Point)
**Purpose**: Express server initialization and route definitions

**Key Functions**:
- `require('dotenv').config()` - Load environment variables
- `app.use(cors())` - Enable cross-origin requests
- `app.use(express.static('public'))` - Serve frontend files
- `app.post('/api/chat')` - Main chat endpoint
- `app.get('/api/products')` - Product catalog endpoint
- `app.get('/api/recipes')` - Recipe database endpoint
- `app.listen(PORT)` - Start HTTP server

**Flow**:
```javascript
1. Load environment config (.env)
2. Initialize Express app
3. Configure middleware (CORS, JSON parser)
4. Load CSV data via dataLoader
5. Mount API routes
6. Start server on port 3333
```

---

### **backend/src/dataLoader.js** (Data Management)
**Purpose**: Parse CSV files and cache data in memory

**Key Functions**:
- `loadProducts()` - Parse `Sample_Grocery_Data.csv`
- `loadRecipes()` - Parse `Sample_Recipes_Data.csv`
- `loadAllData()` - Load both datasets and cache

**Data Structures**:
```javascript
products: [
  { item: "Mozzarella Cheese", category: "Dairy", price: "$9.99" }
]

recipes: [
  { 
    name: "Chicken Stir Fry",
    ingredients: ["chicken", "soy sauce", ...],
    steps: "Heat oil...",
    mealType: "dinner"
  }
]
```

**Flow**:
```javascript
1. Read CSV files from /data folder
2. Parse using csv-parse library
3. Normalize and structure data
4. Cache in memory for fast access
5. Return to requesting module
```

---

### **backend/src/ollamaService.js** (LLM Provider)
**Purpose**: Abstract LLM interactions (Ollama/OpenAI)

**Key Functions**:
- `chatWithOllama(message, context)` - Natural language responses
- `suggestWithOllama({ message, requestedCount })` - Structured recipe generation
- `chatWithOpenAI()` - OpenAI alternative
- `suggestWithOpenAI()` - OpenAI recipe generation

**Provider Selection Logic**:
```javascript
const PROVIDER = process.env.LLM_PROVIDER || 
                 (hasValidOpenAIKey ? 'openai' : 'ollama');

if (PROVIDER === 'openai') {
  exports.chatWithLLM = chatWithOpenAI;
  exports.suggest = suggestWithOpenAI;
} else {
  exports.chatWithLLM = chatWithOllama;
  exports.suggest = suggestWithOllama;
}
```

**LLM Request Structure**:
```javascript
POST http://localhost:11434/api/chat
{
  "model": "gpt-oss:120b-cloud",
  "messages": [
    { "role": "system", "content": "You are a recipe assistant..." },
    { "role": "user", "content": "give me 3 protein rich recipes" }
  ],
  "format": "json",
  "options": { 
    "temperature": 0.5,
    "num_predict": 2000  // Max tokens to generate
  }
}
```

**Response Handling**:
```javascript
1. Receive JSON from Ollama
2. Validate JSON structure
3. If malformed:
   - Attempt JSON repair (remove trailing commas)
   - Extract partial recipes using regex
   - Return fallback response
4. If valid:
   - Parse recipes array
   - Extract reasoning
   - Return structured data
```

---

### **backend/src/chatLogic.js** (Chat Engine)
**Purpose**: Process user messages and orchestrate responses

**Key Functions**:
- `processMessage(message, context, data)` - Main chat handler
- `findRecipesForOccasion()` - Dataset-based recipe matching
- `enrichRecipesWithProducts()` - Add product availability
- `chooseBestRecipe()` - Select optimal recipe from candidates

**Decision Flow**:
```javascript
1. Intent Recognition
   ├── Greeting? → "Hi! I can help with recipes..."
   ├── Shopping list query? → Return list items
   ├── "More" request? → Generate additional recipes
   └── Recipe request? → Continue processing

2. Request Type Detection
   ├── isThemedRequest? (halloween, christmas)
   │   └── Force LLM generation, skip dataset
   ├── isFormattingRequest? ("give me the recipe of these")
   │   └── Extract previous recipe names, format as cards
   └── Regular request? → Continue

3. Recipe Count Extraction
   ├── Regex: /\b(\d+|one|two|three...ten)\b/i
   ├── Map number words: "three" → 3
   └── Default: 3 recipes

4. LLM Generation
   ├── Build prompt with:
   │   ├── User query
   │   ├── Recipe count requirement
   │   ├── Conversation context
   │   ├── Avoid list (seen recipes)
   │   └── Grounded mode (if requested)
   └── Call suggestWithOllama({ requestedCount })

5. Response Processing
   ├── Parse LLM JSON response
   ├── Extract: reply, reasoning, recipes[]
   ├── Normalize recipe structure
   ├── Enrich with product data
   └── Update conversation context

6. Return Format
   {
     reply: "text with 💡 reasoning",
     recipes: [{ name, ingredients, steps, mealType }],
     context: { messages, seenRecipes, shoppingList }
   }
```

**Context Management**:
```javascript
context = {
  messages: [
    { from: 'user', text: '...' },
    { from: 'bot', text: '...' }
  ],
  seenRecipes: Set(['Recipe1', 'Recipe2']),
  allSuggestedRecipes: [...],
  shoppingList: [],
  lastNonMoreQuery: "..."
}
```

---

### **backend/public/app.js** (Frontend Logic)
**Purpose**: Handle UI interactions and API communication

**Key Functions**:
- `loadInitialData()` - Fetch products and recipes on page load
- `sendMessage()` - POST user message to /api/chat
- `displayMessage()` - Render text messages in chat
- `displayRecipeCards()` - Render recipe cards with ingredients
- `addIngredientsToCart()` - Add recipe items to shopping list

**Event Flow**:
```javascript
User clicks "Send" button
    ↓
captureMessage()
    ├── Get input value
    ├── Validate non-empty
    └── Call sendMessage(message)
    ↓
sendMessage(message)
    ├── Display user message in chat
    ├── Show "typing..." indicator
    ├── POST /api/chat { message, context }
    ├── Receive JSON response
    ├── Hide typing indicator
    ├── displayMessage(bot, response.reply)
    └── displayRecipeCards(response.recipes)
    ↓
displayRecipeCards(recipes)
    ├── For each recipe:
    │   ├── Create card HTML
    │   ├── Map ingredients to products
    │   ├── Check availability (in stock?)
    │   ├── Add "Add Ingredients" button
    │   └── Add "More" button (expand steps)
    └── Append to chat container
```

---

## **⚙️ Environment Configuration**

### **backend/.env**
```bash
# LLM Provider Selection
LLM_PROVIDER=ollama                    # 'ollama' or 'openai'

# Ollama Configuration
OLLAMA_URL=http://localhost:11434      # Ollama API endpoint
OLLAMA_MODEL=gpt-oss:120b-cloud        # Model name (customizable)
OLLAMA_API_KEY=                        # Optional API key for cloud

# OpenAI Configuration (Alternative)
OPENAI_API_KEY=                        # Your OpenAI API key
OPENAI_MODEL=gpt-4o-mini               # OpenAI model

# Server Configuration
PORT=3333                              # Backend server port
HOST=127.0.0.1                         # Bind address
DEBUG=0                                # Debug logging
```

---

## **🔍 Special Features**

### **1. Themed Recipe Generation**
**Trigger**: Keywords like "halloween", "christmas", "romantic"
**Behavior**: Skip dataset fallback, force creative LLM generation
**Code**: `chatLogic.js` line 1367-1368

### **2. Recipe Count Honoring**
**Trigger**: "give me 3 recipes", "two breakfast ideas"
**Behavior**: Extract number, pass to LLM as `requestedCount`
**Code**: `chatLogic.js` line 1364-1377

### **3. Formatting Requests**
**Trigger**: "give me the recipe of these", "format previous recipes"
**Behavior**: Extract recipe names from last bot message, return as cards
**Code**: `chatLogic.js` line 1237-1333

### **4. Reasoning Display**
**Trigger**: Any recipe suggestion
**Behavior**: LLM explains why recipes were chosen
**Format**: `💡 These recipes are high in protein and quick to prepare.`
**Code**: `chatLogic.js` line 1491-1494

### **5. Product Availability**
**Behavior**: Check if recipe ingredients exist in product catalog
**Display**: Green "(in stock)" or red "(not found)"
**Code**: `chatLogic.js` enrichRecipesWithProducts()

---

## **🧪 Testing**

### **Run Tests**
```bash
cd backend
npm test
```

### **Test Files**
- `tests/dataLoader.test.js` - Validates CSV parsing

### **Manual Testing**
```bash
# Test LLM without server
node backend/scripts/llm_probe.js

# Health check
curl http://127.0.0.1:3333/api/llm/health?probe=1
```

---

## **📊 Data Flow Summary**

```
CSV Files → dataLoader.js → Cached in Memory
                                ↓
User Input → Frontend (app.js) → POST /api/chat
                                ↓
Backend (index.js) → chatLogic.js → Process Intent
                                ↓
                    ollamaService.js → Call Ollama LLM
                                ↓
                    Ollama generates JSON recipes
                                ↓
chatLogic.js ← Parse & Enrich ← Add product data
                                ↓
Backend sends JSON response → Frontend displays cards
```

---

## **🚀 Deployment Checklist**

1. ✅ Install Node.js 16+
2. ✅ Install Ollama + pull model (`ollama pull gpt-oss:120b-cloud`)
3. ✅ Clone repository
4. ✅ Run `npm install` in backend/
5. ✅ Create `.env` file from `.env.example`
6. ✅ Configure `OLLAMA_MODEL` in `.env`
7. ✅ Start server: `npm start`
8. ✅ Open browser: http://127.0.0.1:3333

---

## **📝 Quick Reference**

| Component | File | Port/URL |
|-----------|------|----------|
| Backend Server | `backend/index.js` | 3333 |
| Frontend UI | `backend/public/index.html` | http://127.0.0.1:3333 |
| Ollama API | External service | 11434 |
| Product Data | `backend/data/Sample_Grocery_Data.csv` | - |
| Recipe Data | `backend/data/Sample_Recipes_Data.csv` | - |

---

**Last Updated**: October 31, 2025
**Version**: 1.0.0
**Maintainer**: Vedantshi
