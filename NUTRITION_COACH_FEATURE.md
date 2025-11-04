# 📊 Nutrition Coach Feature

## Overview
An interactive, multi-step conversation flow that provides personalized nutrition guidance and recipe recommendations based on user's body metrics and activity level.

## How It Works

### Step 1: Initiation
User clicks the "📊 Nutrition Coach" quick button, which sends a special trigger `__NUTRITION_START__`.

### Step 2: Height & Weight Collection
- Bot asks for height (cm or ft/in) and weight (kg or lbs)
- Supports multiple formats:
  - `170 cm, 70 kg`
  - `5'7", 150 lbs`
  - `5 feet 7 inches, 65 kg`
- Smart parsing handles mixed units and various input styles

### Step 3: BMI Calculation & Analysis
- Calculates BMI using: `BMI = weight(kg) / height(m)²`
- Provides category classification:
  - **Underweight**: BMI < 18.5
  - **Normal weight**: BMI 18.5-24.9
  - **Overweight**: BMI 25-29.9
  - **Obese**: BMI ≥ 30
- Gives personalized advice based on category
- Asks if user wants macro calculations (Yes/No)

### Step 4: Activity Level (Optional)
If user wants macros:
- Bot asks for activity level (1-5 scale):
  1. **Sedentary** - Little/no exercise
  2. **Lightly Active** - Exercise 1-3 days/week
  3. **Moderately Active** - Exercise 3-5 days/week
  4. **Very Active** - Exercise 6-7 days/week
  5. **Extremely Active** - Intense exercise daily

### Step 5: Macro Calculation
- Calculates BMR using Mifflin-St Jeor equation
- Applies TDEE multiplier based on activity level
- Provides daily targets:
  - **Total Calories** (TDEE)
  - **Protein** (30% of calories, 4 cal/g)
  - **Carbs** (35% of calories, 4 cal/g)
  - **Fat** (35% of calories, 9 cal/g)

### Step 6: Recipe Suggestions (Optional)
- Asks if user wants personalized recipes (Yes/No)
- If yes, generates recipes tailored to BMI category:
  - **Underweight**: High-protein, high-calorie recipes
  - **Normal**: Balanced, nutritious recipes
  - **Overweight/Obese**: Low-calorie, high-protein recipes
- Uses AI to generate 3 personalized recipes with calorie estimates
- Recipes are grounded in available products from database

## Technical Implementation

### Frontend Changes
**File**: `backend/public/app.js`
- Replaced "🥘 Comfort Food" button with "📊 Nutrition Coach"
- Button sends `__NUTRITION_START__` trigger instead of regular query

### Backend Changes
**File**: `backend/src/chatLogic.js`

#### New Functions:
1. **`handleNutritionFlow(message, context, data)`**
   - Main state machine for nutrition conversation flow
   - Manages 5 conversation states
   - Returns appropriate responses and recipes

2. **`parseHeightWeight(text)`**
   - Parses height/weight from natural language
   - Supports metric (cm, kg) and imperial (ft, in, lbs)
   - Smart fallback for bare numbers

3. **`parseActivityLevel(text)`**
   - Extracts activity level from number (1-5) or keywords
   - Returns standardized activity level string

#### Flow States:
- `awaiting_height_weight` - Waiting for user's height/weight
- `awaiting_macro_decision` - Asking if user wants macro calculations
- `awaiting_activity_level` - Asking for activity level
- `awaiting_recipe_decision` - Asking if user wants recipes
- `null` - Flow complete or cancelled

#### Context Storage:
```javascript
context.nutritionFlow = 'current_state'
context.nutritionData = {
  heightCm: number,
  weightKg: number,
  bmi: number,
  activityLevel: string,
  tdee: number,
  calories: number,
  protein: number,
  carbs: number,
  fat: number
}
```

## Example Conversation

**User**: *Clicks "📊 Nutrition Coach"*

**Bot**: Hi! I'm your nutrition coach 🥗

Let's start by understanding your body metrics.

Please tell me your **height** (in cm or feet/inches) and **weight** (in kg or lbs).

Example: "170 cm, 70 kg" or "5'7", 150 lbs"

**User**: 175 cm, 75 kg

**Bot**: 📊 **Your BMI Analysis**

**Height:** 175 cm (5.7 ft)
**Weight:** 75 kg (165.4 lbs)
**BMI:** 24.5
**Category:** Normal weight

Great news! Your BMI is in the healthy range. Maintain your current lifestyle with balanced nutrition and regular activity.

Would you like me to calculate your **daily calorie and macronutrient needs** based on your metrics? (Yes/No)

**User**: Yes

**Bot**: Perfect! To calculate your daily needs, I need to know your **activity level**:

1️⃣ **Sedentary** - Little to no exercise
2️⃣ **Lightly Active** - Exercise 1-3 days/week
3️⃣ **Moderately Active** - Exercise 3-5 days/week
4️⃣ **Very Active** - Exercise 6-7 days/week
5️⃣ **Extremely Active** - Intense exercise daily

Just reply with the number (1-5) or the activity level name.

**User**: 3

**Bot**: 🎯 **Your Daily Nutrition Targets**

**Activity Level:** Moderately active
**Daily Calories:** 2600 kcal

**Macronutrients:**
🥩 **Protein:** 195g (780 kcal)
🍞 **Carbs:** 228g (910 kcal)
🥑 **Fat:** 101g (910 kcal)

*Note: These are estimates. For personalized advice, consult a nutritionist or dietitian.*

Would you like me to suggest **recipes that align with your nutrition goals**? (Yes/No)

**User**: Yes

**Bot**: 🍽️ **Personalized Recipe Suggestions**

Based on your nutrition profile (BMI: 24.5, 2600kcal/day), here are recipes tailored for you:

*[3 recipe cards with ingredients and steps]*

## Benefits

1. **Interactive**: Guides users through a natural conversation
2. **Personalized**: Tailored advice based on individual metrics
3. **Educational**: Teaches users about BMI, TDEE, and macros
4. **Actionable**: Connects nutrition goals to recipe suggestions
5. **Flexible**: Users can skip steps or exit at any time
6. **Smart Parsing**: Understands various input formats (metric/imperial)

## Future Enhancements

1. **Age & Gender**: More accurate BMR calculations
2. **Goal Setting**: Weight loss/gain/maintenance preferences
3. **Meal Planning**: Generate full day/week meal plans
4. **Progress Tracking**: Save metrics over time
5. **Dietary Restrictions**: Filter recipes by allergies/preferences
6. **Calorie Tracking**: Calculate meal calories from shopping list
7. **Export**: Download nutrition plan as PDF

## Testing

To test the feature:
1. Ensure backend is running: `cd backend && node index.js`
2. Open http://127.0.0.1:3333
3. Click "📊 Nutrition Coach" button
4. Follow the conversation prompts
5. Try various input formats (metric, imperial, mixed)
6. Test skipping optional steps (say "no" to macros or recipes)

## Notes

- BMI is a simplified health indicator; users are advised to consult healthcare providers
- Calculations assume average age (30) and male gender for BMR; can be enhanced
- Nutrition data persists in session context but not across page refreshes
- Flow resets after recipe suggestions or if user exits early
