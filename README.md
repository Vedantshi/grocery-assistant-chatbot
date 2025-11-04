# 🛒 AI-Powered Grocery Assistant Chatbot

[![Tests](https://img.shields.io/badge/tests-95%20passing-brightgreen)](backend/TEST_SUMMARY.md)
[![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-4.18.2-blue)](https://expressjs.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> An intelligent grocery shopping assistant that combines AI-powered conversational guidance with personalized recipe recommendations, helping users save money, eat healthier, and reduce food waste.

## 🎯 Business Problem

**The Challenge:**
- 📊 **Food waste crisis**: Americans waste $1,600 worth of food annually per household
- 💰 **Budget struggles**: Families struggle to meal plan within grocery budgets  
- ⏰ **Time constraints**: Busy professionals need quick, healthy meal solutions
- 🥗 **Health concerns**: Growing need for personalized nutrition guidance
- 🤔 **Decision fatigue**: Overwhelming choices in modern grocery shopping

**The Solution:**
This AI-powered grocery assistant provides:
- 🎤 **Natural conversation** - Chat with an AI that understands your needs
- 💵 **Budget optimization** - Find recipes within your exact budget constraints
- ⏱️ **Time-saving recipes** - Filter by cooking time for busy schedules
- 🍎 **Nutrition coaching** - Personalized calorie/macro calculations based on your profile
- 🥕 **Pantry management** - Get recipe suggestions from what you already have
- 🍽️ **Meal planning** - Full day menus (breakfast, lunch, dinner)
- 💪 **Healthy swaps** - Smart substitutions without feeling restricted

---

## ✨ Key Features

### 🤖 **7 Specialized AI Assistants**

1. **💰 Budget Planner** - Strict budget filtering for recipes under your price cap
2. **⏰ Quick Recipes** - Find meals based on available cooking time
3. **🥗 Nutrition Coach** - Calculate personalized daily calorie & macro needs (BMR/TDEE)
4. **🍅 Pantry Helper** - Get recipe suggestions from your existing ingredients
5. **🍽️ Meal Prep Planner** - Generate full-day menus (breakfast/lunch/dinner)
6. **💚 Healthy Options** - Smart nutrition swaps and mindful eating guidance
7. **📅 Full Day Menu** - Complete daily meal plans

### 🛍️ **Smart Shopping Features**

- **Interactive Shopping List** - Add/remove items with quantity management
- **One-click Recipe Import** - Add all recipe ingredients instantly
- **CSV Export** - Export shopping lists for offline use
- **Price Tracking** - Real-time total cost calculation
- **Unit Display** - See product measurements (per lb, per bottle, etc.)

### 🧠 **Intelligent Conversations**

- **Context-Aware Responses** - AI remembers your conversation history
- **Natural Language Processing** - Ask questions conversationally
- **Multi-format Input** - Handles various ways to express budgets, time, ingredients
- **Flow State Management** - Seamlessly switch between different assistance modes
- **LLM Integration** - Powered by Ollama (gpt-oss:120b-cloud model)

---

## 🏗️ Technical Architecture

### **Stack**
```
Frontend:  React-style Vanilla JavaScript + Custom CSS
Backend:   Node.js + Express.js
AI/LLM:    Ollama (gpt-oss:120b-cloud)
Data:      CSV-based (100 products, 10 recipes)
Testing:   Jest + Supertest (95 tests, 100% passing)
```

### **Project Structure**
```
grocery-assistant-chatbot/
├── backend/
│   ├── src/
│   │   ├── chatLogic.js         # Core AI conversation engine (2,600+ lines)
│   │   ├── ollamaService.js     # LLM integration & prompt engineering
│   │   ├── dataLoader.js        # CSV data processing
│   │   └── budgetUtils.js       # Budget parsing & filtering logic
│   ├── public/
│   │   ├── app.js              # Frontend React-style app (676 lines)
│   │   ├── index.html          # Single-page application
│   │   └── styles.css          # Custom styling
│   ├── data/
│   │   ├── Synthetic_Grocery_Dataset.csv    # 100 products with nutrition
│   │   └── Sample_Recipes_Data.csv          # 10 diverse recipes
│   ├── tests/
│   │   ├── chatLogic.test.js              # Core logic tests (40 tests)
│   │   ├── api.test.js                    # API endpoint tests (31 tests)
│   │   ├── chatLogic.parsing.test.js      # Parsing tests (44 tests)
│   │   └── budgetUtils.test.js            # Utility tests (5 tests)
│   ├── index.js                # Express server setup
│   └── package.json
├── TEST_SUMMARY.md             # Comprehensive test documentation
└── README.md
```

---

## 🚀 Getting Started

### **Prerequisites**
- Node.js (v16 or higher)
- Ollama installed and running locally ([Installation Guide](https://ollama.ai))
- Pull the model: `ollama pull gpt-oss:120b-cloud`

### **Installation**

1. **Clone the repository**
   ```bash
   git clone https://github.com/Vedantshi/grocery-assistant-chatbot.git
   cd grocery-assistant-chatbot
   ```

2. **Install dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Start Ollama** (in a separate terminal)
   ```bash
   ollama serve
   ```

4. **Run the application**
   ```bash
   npm start
   ```

5. **Open your browser**
   ```
   http://localhost:3333
   ```

---

## 🧪 Testing

### **Run Test Suite**
```bash
cd backend
npm test
```

### **Test Coverage**
- ✅ **95 tests, 100% passing**
- ✅ All 7 interactive flows tested
- ✅ All API endpoints validated
- ✅ Comprehensive parsing & edge case tests
- ✅ Error handling & session management

**Test Files:**
- `chatLogic.test.js` - Core message processing (40 tests)
- `api.test.js` - REST API endpoints (31 tests)  
- `chatLogic.parsing.test.js` - Input parsing (44 tests)
- `budgetUtils.test.js` - Budget utilities (5 tests)

See [TEST_SUMMARY.md](backend/TEST_SUMMARY.md) for detailed coverage report.

---

## 📡 API Documentation

### **Endpoints**

#### `GET /api/products`
Returns all grocery products with nutrition data
```json
[
  {
    "item": "Chicken",
    "category": "Meat",
    "price": 5.99,
    "unit": "per lb",
    "nutrition": { "calories": 165, "protein_g": 31, ... }
  }
]
```

#### `GET /api/recipes`
Returns all available recipes
```json
[
  {
    "name": "Chicken Stir Fry",
    "ingredients": [...],
    "steps": "Cook chicken...",
    "mealType": "dinner"
  }
]
```

#### `POST /api/chat`
Send messages to the AI assistant
```json
{
  "message": "I need recipes under $20",
  "sessionId": "optional-session-id"
}
```

Response:
```json
{
  "reply": "AI response text",
  "recipes": [...],
  "sessionId": "session-identifier",
  "context": { ... }
}
```

#### `GET /api/welcome`
Get welcome message and mascot info

#### `GET /api/llm/health`
Check LLM service health status

---

## 💡 Usage Examples

### **Budget-Conscious Shopping**
```
User: "Show me recipes under $15 for 2 people"
AI: [Filters recipes strictly under $15, sorted by cost]
```

### **Quick Weeknight Dinner**
```
User: "I only have 20 minutes to cook"
AI: [Shows recipes ≤20 minutes with time-sorted results]
```

### **Nutrition Planning**
```
User: "Calculate my daily calories"
AI: "What's your height and weight?"
User: "5'9\", 165 lbs"
AI: "What's your activity level?"
User: "moderate"
AI: [Calculates BMR, TDEE, suggests macro breakdown]
```

### **Pantry Cleanup**
```
User: "I have chicken, rice, and broccoli"
AI: [Suggests recipes, then asks if you want recipe cards]
```

### **Meal Prep Sunday**
```
User: [Clicks "Meal Prep" button]
AI: "Choose preference: 1=Protein-rich, 2=Vegetarian..."
User: "2"
AI: [Returns 3 vegetarian recipes: breakfast, lunch, dinner]
```

---

## 🎨 Features in Detail

### **Budget Filtering (Strict Implementation)**
- Parses budget in multiple formats: "$20", "under $15", "$25 for 4 servings"
- **Strict filtering**: Only returns recipes ≤ budget cap (no approximations)
- Estimates recipe cost by matching ingredients to product prices
- Sorts results by cost (cheapest first)

### **Nutrition Coach (BMR/TDEE Calculator)**
- Accepts height/weight in metric or imperial
- Recognizes 5 activity levels (sedentary → extremely active)
- Calculates Basal Metabolic Rate (BMR)
- Computes Total Daily Energy Expenditure (TDEE)
- Provides personalized macro breakdowns

### **Pantry Helper (Conversational Flow)**
- Extracts ingredients from natural language
- Supports comma-separated, newline, or "and" separated lists
- Limits to 12 ingredients for focused results
- Provides food guidance BEFORE recipes (storage tips, freshness, pairings)
- Ensures ALL user ingredients appear in conversation

### **Smart Context Management**
- Maintains conversation history across requests
- Tracks seen recipes to avoid repetition
- Handles "more" requests intelligently
- Session-based state persistence
- Automatic flow reset when switching features

---

## 🔧 Configuration

### **Environment Variables** (Optional)
```bash
PORT=3333                           # Server port
OLLAMA_URL=http://localhost:11434   # Ollama service URL
MODEL_NAME=gpt-oss:120b-cloud       # LLM model name
```

### **Data Files**
- `backend/data/Synthetic_Grocery_Dataset.csv` - Product database
- `backend/data/Sample_Recipes_Data.csv` - Recipe collection

---

## 🏆 Quality & Best Practices

✅ **100% Test Coverage** - All features comprehensively tested  
✅ **Error Handling** - Graceful degradation for edge cases  
✅ **Input Validation** - Multiple format support with fallbacks  
✅ **Session Management** - Stateful conversations with proper cleanup  
✅ **Responsive Design** - Mobile-friendly interface  
✅ **Performance** - Optimized scoring algorithms for fast recipe matching  
✅ **Code Quality** - Modular architecture with clear separation of concerns  

---

## 🚧 Development

### **Run in Development Mode**
```bash
npm run dev
```

### **Run Tests in Watch Mode**
```bash
npm test -- --watch
```

### **Generate Coverage Report**
```bash
npm test -- --coverage
```

---

## 📊 Technical Highlights

- **2,600+ lines** of core AI logic in `chatLogic.js`
- **95 comprehensive tests** ensuring reliability
- **7 distinct interactive flows** with state management
- **Session-based architecture** for multi-turn conversations
- **Intelligent scoring algorithms** for recipe relevance
- **Strict budget filtering** with cost estimation
- **BMR/TDEE calculations** for nutrition coaching
- **Natural language parsing** for flexible input formats

---

## 🎯 Future Enhancements

- [ ] User authentication & personalized profiles
- [ ] Recipe favorites & history tracking
- [ ] Dietary restriction filters (gluten-free, keto, etc.)
- [ ] Store location & price comparison
- [ ] Meal plan calendar integration
- [ ] Mobile app (React Native)
- [ ] Recipe image generation
- [ ] Voice interface integration
- [ ] Social sharing features

---

## 👤 Author

**Vedantshi**
- GitHub: [@Vedantshi](https://github.com/Vedantshi)
- Repository: [grocery-assistant-chatbot](https://github.com/Vedantshi/grocery-assistant-chatbot)

---

## 📄 License

This project is licensed under the MIT License.

---

## 🙏 Acknowledgments

- Ollama team for the LLM infrastructure
- Open-source community for inspiration
- Users providing valuable feedback

---

**Built with ❤️ to solve real-world grocery shopping challenges**
