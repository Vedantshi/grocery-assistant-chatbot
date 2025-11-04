const { chatWithOllama, suggestWithOllama } = require('./ollamaService');
const { parseBudgetCap, filterRecipesByBudget, estimateRecipeCost, sortByCheapest } = require('./budgetUtils');

// Lightweight debug logger (disabled by default unless DEBUG=1 or NODE_ENV=development)
const DEBUG = process.env.DEBUG === '1' || process.env.NODE_ENV === 'development';
const debug = (...args) => { if (DEBUG) console.log(...args); };
const warn = (...args) => { if (DEBUG) console.warn(...args); };

async function generateResponse(message, recipes, context) {
    const msg = message.toLowerCase();
    
    // Analyze conversation history for context
    const conversationContext = analyzeConversationContext(context);
    
    // Handle greetings
    if (msg.includes('hi') || msg.includes('hello') || msg.includes('hey')) {
        return "Hi! I'm Bloom 🌱! I can help you find recipes and create shopping lists. What kind of food would you like to cook today?";
    }

    // Handle "more" requests with context awareness
    if (msg === 'more' || msg.includes('show me more') || msg.includes('give me more')) {
        if (conversationContext.lastCuisineType) {
            return recipes.length > 0 
                ? `Here ${recipes.length === 1 ? 'is 1' : `are ${recipes.length}`} more ${conversationContext.lastCuisineType} ${recipes.length === 1 ? 'recipe' : 'recipes'} for you! Let me know if you'd like to add any ingredients to your shopping list.` 
                : `I've shown you all the ${conversationContext.lastCuisineType} recipes I have. Would you like to try a different cuisine?`;
        }
        return recipes.length > 0 
            ? `Here ${recipes.length === 1 ? 'is 1' : `are ${recipes.length}`} more ${recipes.length === 1 ? 'recipe' : 'recipes'} for you! Let me know if you'd like to add any ingredients to your shopping list.` 
            : "I don't have any more recipes to suggest right now. Would you like to try a different type of dish?";
    }

    // Handle occasions/purposes with context
    if (msg.includes('girlfriend') || msg.includes('date') || msg.includes('romantic')) {
        const timeOfDay = conversationContext.timeOfDay || 'dinner';
        return `I've found some perfect romantic ${timeOfDay} recipes! ${formatRecipeSuggestions(recipes)} These dishes are sure to impress!`;
    }
    
    if (msg.includes('party') || msg.includes('gathering') || msg.includes('guests')) {
        const portion = conversationContext.guestCount ? `for ${conversationContext.guestCount} people` : 'that serve multiple people';
        return `Here are some crowd-pleasing recipes ${portion} that would be great for a gathering! ${formatRecipeSuggestions(recipes)}`;
    }
    
    if (msg.includes('quick') || msg.includes('fast') || msg.includes('easy')) {
        return `I've got some quick and easy recipes that you can make in under 30 minutes! ${formatRecipeSuggestions(recipes)}`;
    }

    if (msg.includes('healthy') || msg.includes('diet') || msg.includes('nutritious') || msg.includes('low calorie')) {
        const dietType = extractDietType(msg);
        return dietType 
            ? `Here are some ${dietType} recipes perfect for your health goals! ${formatRecipeSuggestions(recipes)}`
            : `Here are some healthy recipe options! ${formatRecipeSuggestions(recipes)}`;
    }

    // Handle budget-conscious requests
    if (msg.includes('cheap') || msg.includes('budget') || msg.includes('affordable') || msg.includes('inexpensive')) {
        return `I found these budget-friendly recipes that won't break the bank! ${formatRecipeSuggestions(recipes)}`;
    }

    // Handle cuisine-specific requests
    const cuisine = extractCuisine(msg);
    if (cuisine) {
        return `Great choice! Here are some delicious ${cuisine} recipes! ${formatRecipeSuggestions(recipes)}`;
    }

    // Handle meal time context
    const mealTime = extractMealTime(msg);
    if (mealTime) {
        return `Perfect ${mealTime} choice! ${formatRecipeSuggestions(recipes)}`;
    }

    // Context-aware default response
    if (recipes.length > 0) {
        if (conversationContext.preferences.length > 0) {
            const prefs = conversationContext.preferences.slice(-2).join(' and ');
            return `Based on your interest in ${prefs}, I think you'll love these recipes! ${formatRecipeSuggestions(recipes)}`;
        }
        return `I found these recipes that might work for you! ${formatRecipeSuggestions(recipes)}`;
    }
    
    return "I'm not sure I understood what kind of recipe you're looking for. Could you try describing it differently? For example, 'quick dinner', 'healthy breakfast', or 'romantic date night'?";
}

function analyzeConversationContext(context) {
    const analysis = {
        lastCuisineType: null,
        timeOfDay: null,
        preferences: [],
        avoidedIngredients: [],
        guestCount: null,
        dietaryRestrictions: [],
        wantsQuick: false,
        wantsBudget: false,
        wantsHealthy: false,
        timeLimitMinutes: null,
        focusMealType: null
    };
    
    if (!context || !context.messages) return analysis;
    
    // Analyze a longer history for better memory
    const recentMessages = context.messages.slice(-10).filter(m => m.from === 'user');
    
    for (const msg of recentMessages) {
        const text = (msg.text || '').toLowerCase();
        
        // Extract cuisine preferences
        const cuisine = extractCuisine(text);
        if (cuisine) analysis.lastCuisineType = cuisine;
        
        // Extract meal time
        const mealTime = extractMealTime(text);
        if (mealTime) analysis.timeOfDay = mealTime;
        if (!analysis.focusMealType && mealTime) analysis.focusMealType = mealTime;
        
        // Extract likes/preferences (single word after like/love/enjoy)
        if (/(love|like|enjoy)\b/.test(text)) {
            const words = text.split(/\s+/);
            const loveIndex = words.findIndex(w => /^(love|like|enjoy)/.test(w));
            if (loveIndex >= 0 && loveIndex < words.length - 1) {
                analysis.preferences.push(words[loveIndex + 1].replace(/[^a-z]/g, ''));
            }
        }
        
        // Extract avoids: "no onions", "don't like mushrooms", "allergic to nuts"
        const noMatch = text.match(/no\s+([a-z\s]+?)(,|\.|$)/i);
        if (noMatch && noMatch[1]) {
            const toks = noMatch[1].split(/\s+and\s+|,|\s+/).map(t=>t.trim()).filter(Boolean);
            analysis.avoidedIngredients.push(...toks);
        }
        if (/don't like|dislike|allergic to/.test(text)) {
            const m2 = text.match(/(?:don't like|dislike|allergic to)\s+([a-z\s]+?)(,|\.|$)/);
            if (m2 && m2[1]) analysis.avoidedIngredients.push(...m2[1].split(/\s+and\s+|,|\s+/).map(t=>t.trim()).filter(Boolean));
        }
        
        // Extract guest count / servings
        const guestMatch = text.match(/(\d+)\s+(people|persons|guests?|friends?|serve|servings?)/i);
        if (guestMatch) analysis.guestCount = guestMatch[1];
        
        // Extract dietary restrictions
        if (text.includes('vegetarian') || text.includes('vegan')) analysis.dietaryRestrictions.push('vegetarian');
        if (text.includes('gluten free') || text.includes('gluten-free')) analysis.dietaryRestrictions.push('gluten-free');

        // Time constraints like "under 20 min", "in 30 minutes"
        const t1 = text.match(/under\s*(\d{1,3})\s*(min|mins|minutes)/);
        const t2 = text.match(/in\s*(\d{1,3})\s*(min|mins|minutes)/);
        const limit = t1?.[1] || t2?.[1];
        if (limit) analysis.timeLimitMinutes = Math.min(180, parseInt(limit));

        // Meta preferences across the chat
        if (/(quick|fast|easy|under\s*\d+\s*min)/.test(text)) analysis.wantsQuick = true;
        if (/(cheap|budget|affordable|inexpensive|low cost|low-cost)/.test(text)) analysis.wantsBudget = true;
        if (/(healthy|diet|light|low calorie|low-calorie|nutritious)/.test(text)) analysis.wantsHealthy = true;
    }
    
    return analysis;
}

function extractDietType(msg) {
    if (msg.includes('keto')) return 'keto-friendly';
    if (msg.includes('vegan')) return 'vegan';
    if (msg.includes('vegetarian')) return 'vegetarian';
    if (msg.includes('paleo')) return 'paleo';
    if (msg.includes('low carb')) return 'low-carb';
    return null;
}

function extractCuisine(msg) {
    const cuisines = {
        'italian': ['italian', 'pasta', 'pizza', 'risotto'],
        'mexican': ['mexican', 'taco', 'burrito', 'quesadilla', 'enchilada'],
        'asian': ['asian', 'stir fry', 'stir-fry', 'wok'],
        'chinese': ['chinese', 'fried rice', 'lo mein'],
        'japanese': ['japanese', 'sushi', 'ramen', 'teriyaki'],
        'indian': ['indian', 'curry', 'tikka', 'masala'],
        'american': ['american', 'burger', 'bbq', 'barbecue'],
        'mediterranean': ['mediterranean', 'greek', 'falafel', 'hummus']
    };
    
    for (const [cuisine, keywords] of Object.entries(cuisines)) {
        if (keywords.some(kw => msg.includes(kw))) {
            return cuisine;
        }
    }
    return null;
}

function extractMealTime(msg) {
    if (msg.includes('breakfast') || msg.includes('morning')) return 'breakfast';
    if (msg.includes('lunch') || msg.includes('noon')) return 'lunch';
    if (msg.includes('dinner') || msg.includes('evening')) return 'dinner';
    if (msg.includes('snack') || msg.includes('appetizer')) return 'snack';
    if (msg.includes('dessert') || msg.includes('sweet')) return 'dessert';
    return null;
}

function formatRecipeSuggestions(recipes) {
    if (!recipes || recipes.length === 0) return '';
    
    const count = recipes.length;
    const recipeList = recipes.map(r => r.name).join(' and ');
    
    if (count === 1) {
        return `I found the perfect recipe for you: ${recipeList}! Click 'Add Ingredients' to add them to your shopping list, or 'More' to see other options.`;
    } else if (count === 2) {
        return `I found ${count} great recipes: ${recipeList}. You can click 'Add Ingredients' to add them to your shopping list, or 'More' to see more suggestions!`;
    } else {
        return `I suggest trying ${recipeList}. Each recipe card shows the ingredients needed. You can click 'Add Ingredients' to add them to your shopping list, or 'More' to see different suggestions!`;
    }
}

// Merge recipe arrays into a unique history by name, keeping latest details
function mergeRecipeHistory(existing, incoming) {
    const map = new Map();
    (Array.isArray(existing) ? existing : []).forEach(r => map.set(r.name, r));
    (Array.isArray(incoming) ? incoming : []).forEach(r => map.set(r.name, r));
    return Array.from(map.values());
}

// Remove markdown code fences and language hints from LLM replies
function stripCodeFences(text) {
    try {
        if (!text) return '';
        let s = String(text);
        // Remove triple backtick blocks
        s = s.replace(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g, '$1');
        // Remove stray backticks
        s = s.replace(/```/g, '').replace(/`/g, '');
        return s.trim();
    } catch {
        return String(text || '');
    }
}

// Try to extract a recipe-like JSON object from free-form text and convert to our internal structure
function extractRecipeFromJsonText(text) {
    if (!text) return [];
    const s = String(text);
    // Find the largest JSON-ish block containing ingredients and steps
    const match = s.match(/\{[\s\S]*?("ingredients"|"recipe_name"|"steps")[\s\S]*?\}/);
    if (!match) return [];
    let jsonStr = match[0];
    try {
        // Some models may add trailing commas; try to clean a bit
        jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');
        const obj = JSON.parse(jsonStr);
        const name = obj.recipe_name || obj.name || 'Untitled Recipe';
        const ingredients = Array.isArray(obj.ingredients)
            ? obj.ingredients.map(it => ({ name: typeof it === 'string' ? it : (it?.name || String(it?.ingredient || '')) }))
            : [];
        const steps = Array.isArray(obj.steps)
            ? obj.steps
            : (obj.steps ? String(obj.steps) : []);
        if (!name || ingredients.length === 0) return [];
        return [{ name, ingredients, steps }];
    } catch {
        return [];
    }
}

// Extract a protein keyword (fish, salmon, tuna, cod, shrimp, etc.)
// (Removed old hardcoded protein generators – all creative generation now comes from the LLM)
// Choose a best recipe from candidates using conversation context
function chooseBestRecipe(candidates, conversationContext, products) {
    if (!Array.isArray(candidates) || candidates.length === 0) return null;
    const quickHints = ['omelette','stir','smoothie','parfait','sandwich','wrap','tacos','salad','bowl','pizza'];
    const healthyHints = ['salad','quinoa','spinach','tofu','yogurt','berries','banana','veggie','fish','salmon','parfait'];
    const liked = new Set((conversationContext.preferences || []).map(p => (p||'').toLowerCase()));
    const avoided = new Set((conversationContext.avoidedIngredients || []).map(p => (p||'').toLowerCase()));

    const scoreRecipe = (r) => {
        let score = 0;
        const name = (r.name || '').toLowerCase();
        const allIng = (r.ingredients || []).map(i => (i.name || '').toLowerCase());
        const text = [name, ...allIng].join(' ');

        // Availability boost
        const total = Math.max(1, (r.ingredients || []).length);
        const found = (r.ingredients || []).filter(i => i && i.found).length;
        score += (found / total) * 100;

        // Quick preference
        if (conversationContext.wantsQuick) {
            const shortSteps = Array.isArray(r.steps) ? r.steps.length <= 4 : (typeof r.steps === 'string' ? r.steps.split(/[.!?]/).length <= 4 : false);
            if (shortSteps) score += 40;
            if (quickHints.some(h => text.includes(h))) score += 30;
        }

        // Healthy preference
        if (conversationContext.wantsHealthy && healthyHints.some(h => text.includes(h))) score += 30;

        // Budget: estimate cost from matched products
        if (conversationContext.wantsBudget) {
            const est = (r.ingredients || []).reduce((s, ing) => s + (ing?.products?.[0]?.price || 0), 0);
            score += Math.max(0, 60 - Math.min(60, est));
        }

        // Meal type alignment
        const mt = conversationContext.focusMealType;
        if (mt) {
            const mtHints = { breakfast: ['egg','omelette','yogurt','smoothie','parfait'], lunch: ['sandwich','salad','bowl','wrap','taco'], dinner: ['chicken','fish','pasta','beef','stew','salmon','stir'] };
            const hints = mtHints[mt] || [];
            if (mt === 'dessert' && /dessert|sweet|banana|chocolate|parfait|ice cream/.test(text)) score += 25;
            if (hints.some(h => text.includes(h))) score += 25;
        }

        // Likes
        for (const fav of liked) if (fav && text.includes(fav)) score += 20;

        // Avoids
        for (const av of avoided) if (av && text.includes(av)) score -= 50;

        return score;
    };

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const r of candidates) {
        const s = scoreRecipe(r);
        if (s > bestScore) { best = r; bestScore = s; }
    }
    return best;
}

// Explain the rationale for a best-choice selection based on context and availability
function explainBestChoice(recipe, conversationContext, products = []) {
    if (!recipe) return '';
    const traits = [];

    // Availability/coverage
    const total = Math.max(1, (recipe.ingredients || []).length);
    const found = (recipe.ingredients || []).filter(i => i && i.found).length;
    if (found / total >= 0.6) traits.push('uses ingredients that are available');

    // Quickness
    const name = (recipe.name || '').toLowerCase();
    const steps = recipe.steps || [];
    const quickHints = ['quick','easy','simple','stir','salad','bowl','wrap','tacos','omelette','parfait','sandwich'];
    const isQuick = (Array.isArray(steps) ? steps.length <= 4 : String(steps).split(/[.!?]/).length <= 4) || quickHints.some(h => name.includes(h));
    if (conversationContext.wantsQuick && isQuick) traits.push('is quick to make');

    // Healthy
    const healthyHints = ['salad','quinoa','spinach','tofu','yogurt','berries','banana','veggie','fish','salmon','parfait'];
    const ingText = (recipe.ingredients || []).map(i => (i.name || '').toLowerCase()).join(' ');
    if (conversationContext.wantsHealthy && healthyHints.some(h => name.includes(h) || ingText.includes(h))) {
        traits.push('leans healthy');
    }

    // Budget estimate
    if (conversationContext.wantsBudget) {
        const est = (recipe.ingredients || []).reduce((s, ing) => s + (ing?.products?.[0]?.price || 0), 0);
        if (est > 0) traits.push(`is budget‑friendly (~$${Math.round(est)} total)`);
        else traits.push('keeps costs reasonable');
    }

    // Meal type alignment
    if (conversationContext.focusMealType) {
        traits.push(`fits ${conversationContext.focusMealType}`);
    }

    if (traits.length === 0) return '';
    // Combine a couple of traits max for brevity
    const summary = traits.slice(0, 3).join(', ').replace(/, ([^,]*)$/, ' and $1');
    return `because it ${summary}`;
}

// New Ollama-powered response generator
async function generateResponseWithOllama(message, recipes, context, data) {
    try {
        // Build a concise context for Ollama
        const conversationHistory = (context.messages || []).slice(-6); // Last 6 messages for context
        
        // Create a summary of recipes being suggested
        const recipesSummary = recipes.map(r => ({
            name: r.name,
            ingredients: r.ingredients.map(i => i.name).join(', ')
        }));
        
        // Call Ollama with context
        const ollamaResponse = await chatWithOllama(
            message,
            conversationHistory,
            recipesSummary,
            [] // We don't need to send all products to Ollama
        );
        
        return ollamaResponse;
    } catch (error) {
        console.error('Ollama failed, falling back to rule-based response:', error);
        // Fallback to original rule-based response
        return generateResponse(message, recipes, context);
    }
}


// ---------- Ingredient parsing, matching and synthesis helpers ----------
function normalizeToken(s) {
    if (!s) return '';
    return s.toString().toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function parseIngredientsFromText(text, dataProducts) {
    if (!text) return [];
    const lower = text.toLowerCase();
    const m = lower.match(/(?:i have|i've got|i got|ingredients?:|have only|only have)\s*[:]?\s*(.*)/i);
    let listText = m ? m[1] : null;
    if (!listText) {
        // fallback: if message looks like a comma/newline separated list
        if (text.includes(',') || text.includes('\n')) listText = text;
    }
    if (!listText) return [];

    // If listText looks like a long clause (contains verbs) and we have product data,
    // try to extract known product names from the full sentence instead of taking the whole tail.
    const looksLikeSentence = /\b(give|make|recipe|based|only|just|some|cook|want)\b/i.test(listText);
    if (looksLikeSentence && Array.isArray(dataProducts) && dataProducts.length > 0) {
        const found = new Set();
        const textNorm = normalizeToken(text);
        for (const p of dataProducts) {
            const prod = normalizeToken(p.item || '');
            if (!prod) continue;
            // check full product phrase is contained in text; also match single word tokens
            if (textNorm.includes(prod)) {
                found.add(prod);
                continue;
            }
            const words = prod.split(' ');
            for (const w of words) {
                if (w.length < 3) continue; // skip tiny words
                if (textNorm.split(/\s+/).includes(w)) { found.add(prod); break; }
            }
        }
        if (found.size > 0) return Array.from(found);
        // otherwise fall through to comma-splitting below
    }

    const rawTokens = listText.split(/,|\n| and | & |;|\(|\)/).map(t => t.trim()).filter(Boolean);
    // Normalize tokens and try to map to known products if provided
    const normalized = rawTokens.map(normalizeToken).filter(Boolean);
    if (Array.isArray(dataProducts) && dataProducts.length > 0) {
        const prodSet = new Set(dataProducts.map(p => normalizeToken(p.item || '')));
        // prefer exact product matches
        const matches = normalized.filter(tok => prodSet.has(tok));
        if (matches.length > 0) return matches;
        // otherwise return normalized tokens (best-effort)
    }
    return normalized;
}

function matchRecipesByIngredients(userIngredients, recipes, dataProducts) {
    const userSet = new Set(userIngredients.map(normalizeToken));
    const results = recipes.map(recipe => {
        const ingNorm = (recipe.ingredients || []).map(i => normalizeToken(i.name || i || ''));
        let matched = 0;
        const matchedNames = [];
        for (const ing of ingNorm) {
            if (!ing) continue;
            if (userSet.has(ing) || Array.from(userSet).some(u => ing.includes(u) || u.includes(ing))) {
                matched++;
                matchedNames.push(ing);
            } else {
                const singular = ing.replace(/s$/, '');
                if (Array.from(userSet).some(u => u === singular)) { matched++; matchedNames.push(ing); }
            }
        }
        const total = ingNorm.length || 1;
        const coverage = matched / total;
        const availableCount = ingNorm.filter(ing => dataProducts.some(p => (p.item || '').toLowerCase().includes(ing))).length;
        const reasons = [`matched=${matched}/${total}`, `available=${availableCount}`];
        return { recipe, matchedCount: matched, totalCount: total, coverage, availableCount, reasons, matchedNames };
    });
    results.sort((a,b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        if (b.availableCount !== a.availableCount) return b.availableCount - a.availableCount;
        return b.matchedCount - a.matchedCount;
    });
    return results;
}

function synthesizeRecipeFromIngredients(userIngredients, dataProducts) {
    const u = userIngredients.map(normalizeToken);
    const has = term => u.some(tok => tok.includes(term));
    let type = 'bowl';
    if (has('egg') || has('eggs')) type = 'omelette';
    else if (has('banana') || has('berries') || has('yogurt')) type = 'parfait/smoothie';
    else if (has('tofu') || has('chicken') || has('shrimp')) type = 'stir-fry';
    else if (has('bread') || has('turkey') || has('cheese')) type = 'sandwich';
    else if (has('lettuce') || has('spinach' ) || has('tomato')) type = 'salad';

    const title = `Quick ${type} with your ingredients`;
    const ingredients = Array.from(new Set(u)).map(i => ({ name: i, found: dataProducts.some(p => (p.item||'').toLowerCase().includes(i)), products: [] }));
    let steps = [];
    if (type === 'omelette') {
        steps = [
            'Beat the eggs with a pinch of salt and pepper.',
            'Heat a small amount of oil or butter in a pan.',
            'Add chopped ingredients (spinach, tomato, cheese) and cook briefly.',
            'Pour eggs, cook until set, fold and serve.'
        ];
    } else if (type.includes('parfait') || type.includes('smoothie')) {
        steps = [
            'Layer yogurt with berries and granola for parfait, or blend banana + milk/yogurt + berries for smoothie.',
            'Top with a drizzle of honey.'
        ];
    } else if (type === 'stir-fry') {
        steps = [
            'Cut protein and vegetables into bite-sized pieces.',
            'Heat oil on high, add garlic/onion if available, add protein and brown.',
            'Add vegetables, a splash of soy sauce or sauce of choice, stir until cooked through.',
            'Serve over rice or grains if available.'
        ];
    } else if (type === 'salad') {
        steps = [
            'Toss greens and chopped vegetables in a bowl.',
            'Add a simple dressing (olive oil + vinegar or lemon + salt + pepper).',
            'Top with protein or cheese if available, and serve.'
        ];
    } else {
        steps = [
            'Combine the ingredients you have into a simple bowl or sandwich.',
            'Season to taste and serve.'
        ];
    }

    return {
        name: title,
        ingredients,
        steps,
        autogenerated: true,
        reason: `Synthesized from: ${ingredients.map(i=>i.name).slice(0,6).join(', ')}`
    };
}

function capitalize(s){ return s && s[0].toUpperCase()+s.slice(1); }

// ---------- end helpers ----------

// ---------- Synthetic dessert ideas when catalog is exhausted ----------
function hasProductToken(products, token) {
    const norm = normalizeToken(token);
    return (products || []).some(p => normalizeToken(p.item || '').includes(norm));
}

function generateDessertIdeas(products, seenNames = new Set(), maxCount = 3) {
    // Template-based quick desserts using commonly present items in sample CSVs
    const templates = [
        {
            name: 'Ice Cream Sundae',
            needs: ['ice cream'],
            optional: ['peanuts','granola bar','honey','dark chocolate','banana'],
            ingredients: (avail) => {
                const base = ['Ice Cream'];
                const extras = [];
                if (avail('peanuts')) extras.push('Peanuts');
                if (avail('granola bar')) extras.push('Granola Bar');
                if (avail('honey')) extras.push('Honey');
                if (avail('dark chocolate')) extras.push('Dark Chocolate');
                if (avail('banana')) extras.push('Banana');
                return [...base, ...extras];
            },
            steps: [
                'Scoop ice cream into a bowl or cup.',
                'Top with your favorite add‑ins like nuts, granola, honey, or shaved chocolate.'
            ]
        },
        {
            name: 'Berry Yogurt Parfait',
            needs: ['greek yogurt','frozen berries'],
            optional: ['granola bar','honey'],
            ingredients: (avail) => {
                const out = ['Greek Yogurt','Frozen Berries'];
                if (avail('granola bar')) out.push('Granola Bar');
                if (avail('honey')) out.push('Honey');
                return out;
            },
            steps: [
                'Layer yogurt and berries in a glass.',
                'Top with crumbled granola bar and a drizzle of honey.'
            ]
        },
        {
            name: 'Chocolate Peanut Bark',
            needs: ['dark chocolate','peanuts'],
            optional: [],
            ingredients: () => ['Dark Chocolate','Peanuts'],
            steps: [
                'Melt dark chocolate gently.',
                'Stir in peanuts, spread thin on parchment, and chill until set.'
            ]
        },
        {
            name: 'Frozen Banana Pops',
            needs: ['banana'],
            optional: ['dark chocolate','peanuts'],
            ingredients: (avail) => {
                const out = ['Banana'];
                if (avail('dark chocolate')) out.push('Dark Chocolate');
                if (avail('peanuts')) out.push('Peanuts');
                return out;
            },
            steps: [
                'Peel bananas and insert sticks; freeze until firm.',
                'Dip in melted chocolate and sprinkle with crushed peanuts.'
            ]
        },
        {
            name: 'Honey Yogurt Fruit Bowl',
            needs: ['greek yogurt'],
            optional: ['frozen berries','banana','honey','granola bar'],
            ingredients: (avail) => {
                const out = ['Greek Yogurt'];
                if (avail('frozen berries')) out.push('Frozen Berries');
                if (avail('banana')) out.push('Banana');
                if (avail('honey')) out.push('Honey');
                if (avail('granola bar')) out.push('Granola Bar');
                return out;
            },
            steps: [
                'Spoon yogurt into a bowl and top with fruit.',
                'Finish with honey and a sprinkle of crumbled granola.'
            ]
        }
    ];

    const available = (tok) => hasProductToken(products, tok);
    const results = [];
    const seen = new Set(Array.from(seenNames || []));
    for (const t of templates) {
        if (results.length >= maxCount) break;
        if (!t.needs.every(need => available(need))) continue;
        if (seen.has(t.name)) continue;
        const ings = typeof t.ingredients === 'function' ? t.ingredients(available) : (t.ingredients || []);
        results.push({
            name: t.name,
            ingredients: ings.map(n => ({ name: n })),
            steps: t.steps,
            autogenerated: true,
            mealType: 'dessert'
        });
        seen.add(t.name);
    }
    return results;
}

// General synthetic ideas for multiple meal types
function generateTopicIdeas(products, seenNames = new Set(), topic = null, maxCount = 3) {
    const t = topic || 'generic';
    const available = (tok) => hasProductToken(products, tok);
    const results = [];
    const seen = new Set(Array.from(seenNames || []));

    const make = (tpl) => {
        if (results.length >= maxCount) return;
        if (tpl.needs && !tpl.needs.every(need => available(need))) return;
        if (seen.has(tpl.name)) return;
        const ings = typeof tpl.ingredients === 'function' ? tpl.ingredients(available) : (tpl.ingredients || []);
        results.push({ name: tpl.name, ingredients: ings.map(n => ({ name: n })), steps: tpl.steps, autogenerated: true, mealType: topic || null });
        seen.add(tpl.name);
    };

    const common = {
        breakfast: [
            { name: 'Veggie Omelette (Quick)', needs: ['eggs'], optional: ['spinach','tomato','cheddar'], ingredients: (avail)=>{
                const out=['Eggs']; if (avail('spinach')) out.push('Spinach'); if (avail('tomato')) out.push('Tomato'); if (avail('cheddar')) out.push('Cheddar Cheese'); return out; },
              steps: ['Beat eggs and season.','Cook with chopped veggies in a pan.','Fold and serve.'] },
            { name: 'Protein Smoothie (Breakfast)', needs:['banana'], optional:['frozen berries','greek yogurt','honey'], ingredients:(a)=>{ const out=['Banana']; if (a('frozen berries')) out.push('Frozen Berries'); if (a('greek yogurt')) out.push('Greek Yogurt'); if (a('honey')) out.push('Honey'); return out; }, steps:['Blend until smooth.'] },
            { name: 'Peanut Butter Banana Toast', needs:['banana'], optional:['granola bar','honey'], ingredients:(a)=>{ const out=['Bread','Banana','Peanut Butter']; if (a('honey')) out.push('Honey'); return out; }, steps:['Toast bread','Spread with peanut butter, top with banana and honey.'] }
        ],
        lunch: [
            { name: 'Turkey Veggie Sandwich (Quick)', needs:['turkey'], optional:['tomato','cheddar','lettuce'], ingredients:(a)=>{ const out=['Bread','Turkey']; if (a('cheddar')) out.push('Cheddar Cheese'); if (a('tomato')) out.push('Tomato'); if (a('lettuce')) out.push('Lettuce'); return out; }, steps:['Layer ingredients between bread slices.'] },
            { name: 'Simple Salad Bowl', needs:['spinach'], optional:['tomato','olive oil'], ingredients:(a)=>{ const out=['Spinach']; if (a('tomato')) out.push('Tomato'); if (a('olive oil')) out.push('Olive Oil'); return out; }, steps:['Toss greens with veggies and olive oil.'] },
            { name: 'Egg and Cheese Wrap', needs:['eggs'], optional:['cheddar','spinach'], ingredients:(a)=>{ const out=['Eggs','Tortilla']; if (a('cheddar')) out.push('Cheddar Cheese'); if (a('spinach')) out.push('Spinach'); return out; }, steps:['Scramble eggs, wrap with fillings.'] }
        ],
        dinner: [
            { name: 'Quick Chicken Stir-Fry', needs:['chicken','soy sauce'], optional:['broccoli','carrot','rice'], ingredients:(a)=>{ const out=['Chicken','Soy Sauce']; if (a('broccoli')) out.push('Broccoli'); if (a('carrot')) out.push('Carrot'); if (a('rice')) out.push('White Rice'); return out; }, steps:['Stir-fry chicken, add veggies and soy sauce, serve with rice.'] },
            { name: 'Simple Marinara Pasta', needs:['pasta'], optional:['tomato','olive oil','cheese'], ingredients:(a)=>{ const out=['Pasta']; if (a('tomato')) out.push('Tomato'); if (a('olive oil')) out.push('Olive Oil'); if (a('cheddar')) out.push('Cheese'); return out; }, steps:['Boil pasta.','Simmer quick tomato-olive oil sauce.','Combine and serve.'] },
            { name: 'One-Pan Beef and Potatoes', needs:['beef'], optional:['potato','onion'], ingredients:(a)=>{ const out=['Beef']; if (a('potato')) out.push('Potato'); if (a('onion')) out.push('Onion'); return out; }, steps:['Brown beef, add potatoes/onion, cook until tender.'] },
            { name: 'Tofu Veggie Rice Bowl (Quick)', needs:['tofu'], optional:['broccoli','carrot','rice','soy sauce'], ingredients:(a)=>{ const out=['Tofu']; if (a('broccoli')) out.push('Broccoli'); if (a('carrot')) out.push('Carrot'); if (a('rice')) out.push('White Rice'); if (a('soy sauce')) out.push('Soy Sauce'); return out; }, steps:['Stir-fry tofu and veggies, serve over rice.'] }
        ],
        snack: [
            { name: 'Apple Peanut Bites', needs:['apple','peanuts'], ingredients:()=>['Apple','Peanuts'], steps:['Slice apple and top with crushed peanuts.'] },
            { name: 'Yogurt Berry Cup', needs:['greek yogurt','frozen berries'], optional:['honey'], ingredients:(a)=>{ const out=['Greek Yogurt','Frozen Berries']; if (a('honey')) out.push('Honey'); return out; }, steps:['Layer yogurt and berries, drizzle honey.'] },
            { name: 'Granola Yogurt Bites', needs:['granola bar','greek yogurt'], ingredients:()=>['Granola Bar','Greek Yogurt'], steps:['Dip granola chunks into yogurt and chill briefly.'] }
        ],
        dessert: [] // dessert handled by dedicated generator; we can still fall back to it below
    };

    const list = t === 'dessert' ? [] : (common[t] || common['dinner']);
    list.forEach(make);

    if (results.length < maxCount && (t === 'dessert' || !t)) {
        // Use dessert generator as an additional pool if requested or topic unknown
        generateDessertIdeas(products, seen, maxCount - results.length).forEach(r => results.push(r));
    }

    return results;
}

// Build a deterministic, aligned reply from the exact recipes we are returning
function buildReplyFromSuggestions(message, recipes, context, options = {}) {
    const names = (recipes || []).map(r => r.name).filter(Boolean);
    const isMore = !!options.isMore;
    const exhausted = !!options.exhausted;
    const topic = extractMealTime((context?.lastNonMoreQuery || '').toLowerCase()) || extractMealTime((message || '').toLowerCase());
    function topicLabels(t){
        if (!t) return { singular: 'option', plural: 'options' };
        const map = {
            dessert: { singular: 'dessert', plural: 'desserts' },
            snack:   { singular: 'snack',   plural: 'snacks' },
            breakfast:{ singular: 'breakfast', plural: 'breakfast options' },
            lunch:   { singular: 'lunch',   plural: 'lunch ideas' },
            dinner:  { singular: 'dinner',  plural: 'dinner ideas' }
        };
        return map[t] || { singular: t, plural: t + ' ideas' };
    }
    const { singular: topicSingular, plural: topicPlural } = topicLabels(topic);

    if (exhausted || names.length === 0) {
        if (topic) return `Looks like we’ve reached the end of suggestions for ${topicPlural}. Try a different request or type 'reset' to start over.`;
        return `Looks like we’ve reached the end of suggestions for this topic. Try a different request or type 'reset' to start over.`;
    }

    if (names.length === 1) {
        const n = names[0];
        if (isMore && topic) return `Here’s another ${topicSingular} option: ${n}. Want me to add the ingredients or see more?`;
        return `Here’s a recipe you might like: ${n}. Want me to add the ingredients or see more options?`;
    }

    if (names.length === 2) {
        const [a,b] = names;
        if (topic) return `Here are two ${topicPlural} to try: ${a} and ${b}. Add ingredients or ask for more.`;
        return `Here are two options: ${a} and ${b}. Add ingredients or ask for more.`;
    }

    const list = names.slice(0,3).join(', ');
    if (topic) return `Here are some ${topicPlural} to consider: ${list}. Add ingredients to your list or ask for more.`;
    return `Here are some ideas: ${list}. Add ingredients to your list or ask for more.`;
}

// ---------- Improved product-aware ingredient extraction ----------
// Enrich recipes' ingredients with product availability and attach a first matching product
function enrichRecipesWithProducts(recipes, products) {
    try {
        const prods = Array.isArray(products) ? products : [];
        return (recipes || []).map(r => {
            let totalCalories = 0;
            let totalPrice = 0;
            const enrichedIngredients = (r.ingredients || []).map(ing => {
                const ingName = (ing?.name || ing || '').toString();
                const lname = ingName.toLowerCase();
                const matches = prods.filter(p => (p.item || '').toLowerCase().includes(lname));
                const first = matches[0];
                const calories = Number(first?.nutrition?.calories) || 0;
                const price = Number(first?.price);
                const unit = first?.unit || '';
                if (Number.isFinite(calories)) totalCalories += calories;
                if (Number.isFinite(price)) totalPrice += price;
                return {
                    name: ingName,
                    found: matches.length > 0,
                    products: matches ? matches.slice(0, 1) : [],
                    calories,
                    price: Number.isFinite(price) ? price : undefined,
                    unit: unit || undefined
                };
            });
            return {
                ...r,
                ingredients: enrichedIngredients,
                totalCalories,
                totalPrice: Number.isFinite(totalPrice) ? totalPrice : undefined
            };
        });
    } catch {
        return recipes || [];
    }
}

const STOPWORDS = new Set([
    'i','have','only','just','can','you','me','some','recipe','recipes','give','want','with','and','for','based','on','my','ingredients','please','suggest','make','cook','quick','healthy','dinner','lunch','breakfast','snack','more','the','a','an','to','of','it','that','this','those','these'
]);

function buildKnownIngredients(products) {
    try {
        return new Set((products || []).map(p => normalizeToken(p.item)).filter(Boolean));
    } catch {
        return new Set();
    }
}

function extractIngredientsFromMessage(message, knownIngredients) {
    if (!message) return [];
    const lower = message.toLowerCase();
    // split by non-letters to get candidate tokens
    const raw = lower.split(/[^a-z0-9]+/).filter(Boolean);
    const candidates = raw
        .map(normalizeToken)
        .filter(tok => tok && tok.length >= 3 && !STOPWORDS.has(tok));
    const result = new Set();
    for (const cand of candidates) {
        // exact token found in known list
        if (knownIngredients.has(cand)) {
            result.add(cand);
            continue;
        }
        // fuzzy: substring either way
        for (const ing of knownIngredients) {
            if (ing.includes(cand) || cand.includes(ing)) {
                result.add(ing);
            } else {
                // simple plural/singular handling
                const sing = ing.replace(/s$/, '');
                const candSing = cand.replace(/s$/, '');
                if (sing && candSing && (sing === candSing)) {
                    result.add(ing);
                }
            }
        }
    }
    return Array.from(result);
}

function findRecipesForOccasion(message, recipes, seenRecipes = new Set(), conversationHistory = [], options = {}) {
    const msg = (message || '').toLowerCase();
    const treatAsMore = !!options.treatAsMore;
    const scoringMessage = (options.queryForScoring || message || '').toLowerCase();
    
    // Extract number of recipes requested
    const numberMatch = msg.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
    const numberWords = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };
    let requestedCount = 3; // default
    if (numberMatch) {
        const num = numberMatch[1];
        requestedCount = isNaN(num) ? (numberWords[num] || 3) : Math.min(parseInt(num), 10);
    debug(`User requested ${requestedCount} recipes`);
    }
    
    // For NEW queries (not "more"), ALLOW showing seen recipes if they're relevant
    // Only filter seen recipes for "more" requests
    const isMoreRequest = treatAsMore || msg.trim() === 'more' || msg.includes('show me more') || msg.includes('give me more');
    const availableRecipes = isMoreRequest 
        ? recipes.filter(r => !seenRecipes.has(r.name))
        : recipes; // For new queries, consider ALL recipes

    // Note: Do NOT early-return for "more". We still want to score by the last
    // non-"more" query to keep results on-topic. availableRecipes already excludes
    // seen items when isMoreRequest=true; we'll rank within that set below.

    // Prepare keywords and stopwords
    const stopwords = new Set(['the','a','an','to','for','me','i','you','please','give','something','make','cook','want','just','one','more','recipe','recipes','what','can','should','would','need','some','that','show']);
    const tokens = scoringMessage.split(/\W+/).filter(Boolean).map(t => t.toLowerCase()).filter(t => !stopwords.has(t) && t.length > 2);

    debug(`Query tokens: [${tokens.join(', ')}]`);

    // Extract context from conversation history
    const userPreferences = extractUserPreferences(conversationHistory);
    
    // If no meaningful tokens, fallback to context-based suggestions
    if (tokens.length === 0) {
        if (userPreferences.favoriteIngredients.length > 0) {
            const withFavorites = availableRecipes.filter(r => 
                r.ingredients.some(ing => 
                    userPreferences.favoriteIngredients.some(fav => 
                        ing.name.toLowerCase().includes(fav)
                    )
                )
            );
            if (withFavorites.length > 0) return withFavorites.slice(0, requestedCount);
        }
        return availableRecipes.slice(0, requestedCount);
    }

    // ENHANCED Scoring function
    const scores = availableRecipes.map(recipe => {
        let score = 0;
        const name = (recipe.name || '').toLowerCase();
        const ingredientNames = (recipe.ingredients || []).map(i => (i.name || '').toLowerCase());
        const allText = [name, ...ingredientNames].join(' ');

        // PRIORITY 1: Exact matches in recipe name (VERY HIGH)
        for (const tk of tokens) {
            const nameWords = name.split(/\s+/);
            if (nameWords.includes(tk)) score += 100; // exact word match
            else if (name.includes(tk)) score += 60; // substring match
        }

        // PRIORITY 2: Ingredient name matches (HIGH)
        for (const ing of ingredientNames) {
            for (const tk of tokens) {
                const ingWords = ing.split(/\s+/);
                if (ingWords.includes(tk)) score += 80;
                else if (ing.includes(tk)) score += 50;
            }
        }

        // PRIORITY 3: Contextual boosts (MEDIUM-HIGH)
    if (scoringMessage.includes('quick') || scoringMessage.includes('easy') || scoringMessage.includes('fast') || scoringMessage.includes('simple')) {
            const quickHints = ['omelette','stir','smoothie','parfait','sandwich','tacos','bowl','salad','pizza','wrap'];
            const matches = quickHints.filter(h => allText.includes(h)).length;
            score += matches * 60;
        }
        
    if (scoringMessage.includes('healthy') || scoringMessage.includes('diet') || scoringMessage.includes('nutritious') || scoringMessage.includes('light') || scoringMessage.includes('fitness')) {
            const healthyHints = ['salad','quinoa','spinach','tofu','yogurt','berries','banana','veggie','fish','salmon','parfait'];
            const matches = healthyHints.filter(h => allText.includes(h)).length;
            score += matches * 60;
        }
        
    if (scoringMessage.includes('girlfriend') || scoringMessage.includes('date') || scoringMessage.includes('romantic') || scoringMessage.includes('special') || scoringMessage.includes('impress') || scoringMessage.includes('fancy')) {
            const romanticHints = ['salmon','pasta','parmesan','quinoa','elegant','gourmet'];
            const matches = romanticHints.filter(h => allText.includes(h)).length;
            score += matches * 70;
        }
        
    if (scoringMessage.includes('party') || scoringMessage.includes('guests') || scoringMessage.includes('gathering') || scoringMessage.includes('crowd') || scoringMessage.includes('friends')) {
            const partyHints = ['tacos','sandwich','bowl','appetizer','finger'];
            const matches = partyHints.filter(h => allText.includes(h)).length;
            score += matches * 60;
        }

    if (scoringMessage.includes('comfort') || scoringMessage.includes('cozy') || scoringMessage.includes('warm') || scoringMessage.includes('hearty')) {
            const comfortHints = ['stew','pasta','beef','potato','cheese'];
            const matches = comfortHints.filter(h => allText.includes(h)).length;
            score += matches * 60;
        }

        // Meal time context
    if (scoringMessage.includes('breakfast') || scoringMessage.includes('morning')) {
            const breakfastHints = ['egg','omelette','yogurt','smoothie','parfait'];
            const matches = breakfastHints.filter(h => allText.includes(h)).length;
            score += matches * 70;
        }

    if (scoringMessage.includes('lunch')) {
            const lunchHints = ['sandwich','salad','bowl','taco'];
            const matches = lunchHints.filter(h => allText.includes(h)).length;
            score += matches * 70;
        }

    if (scoringMessage.includes('dinner') || scoringMessage.includes('evening') || scoringMessage.includes('supper')) {
            const dinnerHints = ['chicken','fish','pasta','beef','stew','salmon','stir'];
            const matches = dinnerHints.filter(h => allText.includes(h)).length;
            score += matches * 70;
        }

        // Dessert context (HIGH PRIORITY)
    if (scoringMessage.includes('dessert') || scoringMessage.includes('desert') || scoringMessage.includes('sweet') || scoringMessage.includes('treat')) {
            const dessertHints = ['yogurt','parfait','smoothie','berries','honey','banana','ice cream','chocolate'];
            const matches = dessertHints.filter(h => allText.includes(h)).length;
            score += matches * 80;
        }

        // Specific protein requests (VERY HIGH PRIORITY)
        const proteinMap = {
            'chicken': ['chicken'],
            'beef': ['beef'],
            'fish': ['fish', 'salmon'],
            'salmon': ['salmon'],
            'shrimp': ['shrimp'],
            'turkey': ['turkey'],
            'tofu': ['tofu'],
            'yogurt': ['yogurt'],
            'egg': ['egg']
        };
        
        for (const [protein, keywords] of Object.entries(proteinMap)) {
            if (msg.includes(protein)) {
                if (keywords.some(kw => allText.includes(kw))) {
                    score += 120; // HUGE boost for exact protein match
                }
            }
        }

        // Cuisine matching
    const cuisineMatch = extractCuisine(scoringMessage);
        if (cuisineMatch) {
            const cuisineHints = {
                'italian': ['pasta', 'marinara', 'parmesan', 'spaghetti'],
                'mexican': ['taco', 'tortilla'],
                'asian': ['soy', 'rice', 'stir'],
                'mediterranean': ['quinoa', 'salmon', 'olive']
            };
            const hints = cuisineHints[cuisineMatch] || [];
            const matches = hints.filter(h => allText.includes(h)).length;
            score += matches * 80;
        }

        // Small penalty for recently seen (but don't exclude)
        if (seenRecipes.has(recipe.name)) {
            score -= 15; // small penalty, not disqualifying
        }

        return { recipe, score, name };
    });

    // Sort by score
    scores.sort((a,b) => b.score - a.score);

    // Debug logging
    debug('\n=== Recipe Scoring for "' + message + '" ===');
    scores.slice(0, 10).forEach(s => {
    debug(`  ${s.name}: ${s.score} points ${seenRecipes.has(s.name) ? '(SEEN)' : '(new)'}`);
    });

    // Determine how many recipes to return based on relevance
    // Only return recipes with good scores (>= 50 points)
    // Return 1-3 for regular queries, up to requestedCount for "more" or explicit number requests
    const highScoreThreshold = 50;
    const result = [];
    
    // Strategy: For "more" requests, show up to requestedCount unseen recipes
    // For new queries, show only RELEVANT matches (score >= threshold)
    if (isMoreRequest) {
        // "More" button: only unseen recipes, up to requestedCount, but keep on-topic
        const unseenTop = scores.filter(item => !seenRecipes.has(item.recipe.name));
        const topScoreUnseen = unseenTop[0]?.score ?? 0;
        // Apply a small dynamic threshold so we don't mix totally irrelevant items
        let minScore = 1;
        if (tokens.length > 0) {
            if (topScoreUnseen >= 200) minScore = Math.floor(topScoreUnseen * 0.4); // very strong focus
            else if (topScoreUnseen >= 100) minScore = Math.floor(topScoreUnseen * 0.5);
            else minScore = 10; // at least a hint of relevance
        }
        const filtered = unseenTop.filter(item => item.score >= minScore);
        debug(`"More" filtered minScore=${minScore}, candidates=${filtered.length}/${unseenTop.length}`);
        for (const item of filtered) {
            if (result.length >= requestedCount) break;
            result.push(item.recipe);
        }
    } else {
        // New query: Only return highly relevant recipes (dynamic 1-3 based on scores)
        const unseenItems = scores.filter(item => !seenRecipes.has(item.recipe.name) && item.score >= highScoreThreshold);
        const seenItems = scores.filter(item => seenRecipes.has(item.recipe.name) && item.score >= highScoreThreshold);
        
        // Determine how many to show based on score distribution
        const topScore = scores[0]?.score || 0;
        let dynamicCount = requestedCount;
        
        // If user didn't specify a number, determine dynamically
        if (!numberMatch) {
            if (topScore >= 200) {
                // Very high relevance: show 1-2 top matches
                dynamicCount = unseenItems.filter(item => item.score >= topScore * 0.7).length;
                dynamicCount = Math.max(1, Math.min(2, dynamicCount));
            } else if (topScore >= 100) {
                // Good relevance: show 2-3 matches
                dynamicCount = unseenItems.filter(item => item.score >= topScore * 0.6).length;
                dynamicCount = Math.max(1, Math.min(3, dynamicCount));
            } else {
                // Lower relevance: show up to 3
                dynamicCount = 3;
            }
        }
        
    debug(`Dynamic count based on relevance: ${dynamicCount} (top score: ${topScore})`);
        
        // Add unseen high-scorers first
        for (const item of unseenItems) {
            if (result.length >= dynamicCount) break;
            result.push(item.recipe);
        }
        
        // If we still need more and there are high-scoring seen recipes, add them
        if (result.length < dynamicCount) {
            for (const item of seenItems) {
                if (result.length >= dynamicCount) break;
                result.push(item.recipe);
            }
        }
    }

    debug(`Returning: ${result.map(r => r.name).join(', ')}`);
    debug(`Result count: ${result.length} (requested: ${requestedCount})\n`);
    
    // Fallback if we have no results
    if (result.length === 0) {
        // For a contextual "more" request with tokens, avoid returning irrelevant items
        if (isMoreRequest && tokens.length > 0) {
            debug('No on-topic results for "more"; returning empty to avoid irrelevant suggestions');
            return [];
        }
        debug('WARNING: No results from scoring, using smart fallback');
        // Prefer unseen recipes even in fallback
        const unseenFallback = scores.filter(s => !seenRecipes.has(s.recipe.name)).slice(0, Math.min(requestedCount, 3));
        if (unseenFallback.length > 0) {
            return unseenFallback.map(s => s.recipe);
        }
        // If all are seen, return highest scoring ones anyway
        return scores.slice(0, Math.min(requestedCount, 3)).map(s => s.recipe);
    }
    
    return result;
}

function extractUserPreferences(conversationHistory) {
    const preferences = {
        favoriteIngredients: [],
        avoidedRecipes: [],
        preferredCuisines: []
    };
    
    if (!Array.isArray(conversationHistory)) return preferences;
    
    for (const msg of conversationHistory) {
        if (msg.from !== 'user') continue;
        const text = (msg.text || '').toLowerCase();
        
        // Extract things user loves/likes
        if (text.includes('love') || text.includes('like')) {
            const words = text.split(/\s+/);
            const loveIndex = words.findIndex(w => w.includes('love') || w.includes('like'));
            if (loveIndex >= 0 && loveIndex < words.length - 1) {
                preferences.favoriteIngredients.push(words[loveIndex + 1].replace(/[^a-z]/g, ''));
            }
        }
        
        // Extract things user wants to avoid
        if (text.includes('hate') || text.includes('dislike') || text.includes("don't like") || text.includes('no ')) {
            const words = text.split(/\s+/);
            const avoidIndex = words.findIndex(w => w.includes('hate') || w.includes('dislike') || w.includes('no'));
            if (avoidIndex >= 0 && avoidIndex < words.length - 1) {
                const avoided = words[avoidIndex + 1].replace(/[^a-z]/g, '');
                if (avoided.length > 2) preferences.avoidedRecipes.push(avoided);
            }
        }
    }
    
    return preferences;
}

// ============================================================
// NUTRITION COACH FLOW
// Multi-step interactive flow for personalized nutrition guidance
// ============================================================
async function handleNutritionFlow(message, context, data) {
    // Always fully reset nutrition context if trigger is received
    if (message === '__NUTRITION_START__') {
        delete context.nutritionFlow;
        delete context.nutritionData;
        // Remove any other nutrition-related keys if present
        Object.keys(context).forEach(k => {
            if (k.startsWith('nutrition')) delete context[k];
        });
        context.nutritionFlow = 'awaiting_height_weight';
        context.nutritionData = {};
        const reply = "🥗 **Nutrition Coach**\n\n**What I do:** I help you understand your body metrics (BMI), calculate your daily calorie needs, determine your macro breakdown (protein, carbs, fats), and suggest recipes that align with your nutritional goals.\n\n---\n\nLet's start by understanding your body metrics.\n\nPlease tell me your **height** (in cm or feet/inches) and **weight** (in kg or lbs).\n\nExample: \"170 cm, 70 kg\" or \"5'7\", 150 lbs\"";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    // Step 2: Parse height and weight, calculate BMI
    if (context.nutritionFlow === 'awaiting_height_weight') {
        const parsed = parseHeightWeight(message);
        
        if (!parsed.height || !parsed.weight) {
            const reply = "I couldn't quite understand those measurements. Please provide both your height and weight.\n\nExamples:\n• \"170 cm, 70 kg\"\n• \"5 feet 7 inches, 150 pounds\"\n• \"5'7\", 65 kg\"";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // Store metrics
        context.nutritionData.heightCm = parsed.height;
        context.nutritionData.weightKg = parsed.weight;

        // Calculate BMI
        const heightM = parsed.height / 100;
        const bmi = (parsed.weight / (heightM * heightM)).toFixed(1);
        context.nutritionData.bmi = parseFloat(bmi);

        // Determine BMI category and provide analysis
        let category, analysis, advice;
        if (bmi < 18.5) {
            category = "Underweight";
            analysis = "Your BMI suggests you may be underweight.";
            advice = "Consider consulting a healthcare provider. Focus on nutrient-dense foods and strength training.";
        } else if (bmi >= 18.5 && bmi < 25) {
            category = "Normal weight";
            analysis = "Great news! Your BMI is in the healthy range.";
            advice = "Maintain your current lifestyle with balanced nutrition and regular activity.";
        } else if (bmi >= 25 && bmi < 30) {
            category = "Overweight";
            analysis = "Your BMI indicates you're in the overweight range.";
            advice = "Consider portion control, increase physical activity, and focus on whole foods.";
        } else {
            category = "Obese";
            analysis = "Your BMI is in the obese range.";
            advice = "I recommend consulting a healthcare provider for personalized guidance. Focus on gradual, sustainable changes.";
        }

        const reply = `📊 **Your BMI Analysis**\n\n**Height:** ${parsed.height} cm (${(parsed.height / 2.54 / 12).toFixed(1)} ft)\n**Weight:** ${parsed.weight} kg (${(parsed.weight * 2.205).toFixed(1)} lbs)\n**BMI:** ${bmi}\n**Category:** ${category}\n\n${analysis} ${advice}\n\nWould you like me to calculate your **daily calorie and macronutrient needs** based on your metrics? (Yes/No)`;
        
        context.nutritionFlow = 'awaiting_macro_decision';
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    // Step 3: Ask if they want macro calculations
    if (context.nutritionFlow === 'awaiting_macro_decision') {
        const wants = message.toLowerCase().includes('yes') || message.toLowerCase().includes('sure') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('yeah');
        
        if (!wants) {
            context.nutritionFlow = 'awaiting_recipe_decision';
            const reply = "No problem! Would you like me to suggest some healthy recipes based on your profile? (Yes/No)";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // Ask for activity level to calculate TDEE
        context.nutritionFlow = 'awaiting_activity_level';
        const reply = "Perfect! To calculate your daily needs, I need to know your **activity level**:\n\n1️⃣ **Sedentary** - Little to no exercise\n2️⃣ **Lightly Active** - Exercise 1-3 days/week\n3️⃣ **Moderately Active** - Exercise 3-5 days/week\n4️⃣ **Very Active** - Exercise 6-7 days/week\n5️⃣ **Extremely Active** - Intense exercise daily\n\nJust reply with the number (1-5) or the activity level name.";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    // Step 4: Calculate macros based on activity level
    if (context.nutritionFlow === 'awaiting_activity_level') {
        const activityLevel = parseActivityLevel(message);
        
        if (!activityLevel) {
            const reply = "Please choose a number from 1-5 or describe your activity level (sedentary, lightly active, moderately active, very active, or extremely active).";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        context.nutritionData.activityLevel = activityLevel;

        // Calculate BMR (Mifflin-St Jeor Equation) - assuming average age 30, we'll use simplified calc
        // For a more accurate calculation, you'd need age and gender
        const weight = context.nutritionData.weightKg;
        const height = context.nutritionData.heightCm;
        
        // Simplified BMR (assuming average adult)
        const bmr = Math.round(10 * weight + 6.25 * height - 5 * 30 + 5); // Assuming male, age 30
        
        // TDEE multipliers
        const multipliers = {
            sedentary: 1.2,
            'lightly active': 1.375,
            'moderately active': 1.55,
            'very active': 1.725,
            'extremely active': 1.9
        };
        
        const tdee = Math.round(bmr * multipliers[activityLevel]);
        context.nutritionData.tdee = tdee;
        
        // Macro breakdown (balanced approach: 30% protein, 35% carbs, 35% fat)
        const proteinCals = Math.round(tdee * 0.30);
        const carbCals = Math.round(tdee * 0.35);
        const fatCals = Math.round(tdee * 0.35);
        
        const proteinG = Math.round(proteinCals / 4);
        const carbG = Math.round(carbCals / 4);
        const fatG = Math.round(fatCals / 9);
        
        context.nutritionData.calories = tdee;
        context.nutritionData.protein = proteinG;
        context.nutritionData.carbs = carbG;
        context.nutritionData.fat = fatG;

        const reply = `🎯 **Your Daily Nutrition Targets**\n\n**Activity Level:** ${activityLevel.charAt(0).toUpperCase() + activityLevel.slice(1)}\n**Daily Calories:** ${tdee} kcal\n\n**Macronutrients:**\n🥩 **Protein:** ${proteinG}g (${proteinCals} kcal)\n🍞 **Carbs:** ${carbG}g (${carbCals} kcal)\n🥑 **Fat:** ${fatG}g (${fatCals} kcal)\n\n*Note: These are estimates. For personalized advice, consult a nutritionist or dietitian.*\n\nWould you like me to suggest **recipes that align with your nutrition goals**? (Yes/No)`;
        
        context.nutritionFlow = 'awaiting_recipe_decision';
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    // Step 5: Suggest recipes based on nutrition profile
    if (context.nutritionFlow === 'awaiting_recipe_decision') {
        const wants = message.toLowerCase().includes('yes') || message.toLowerCase().includes('sure') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('yeah');
        
        if (!wants) {
            const reply = "No problem! Feel free to ask me anything else or click another quick option. Your nutrition data is saved for this session if you want to revisit it! 😊";
            context.nutritionFlow = null; // Reset flow
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // Build a nutrition-focused query based on their BMI and goals
        const bmi = context.nutritionData.bmi;
        let nutritionQuery;
        
        if (bmi < 18.5) {
            nutritionQuery = "high protein and healthy high-calorie recipes for weight gain";
        } else if (bmi >= 18.5 && bmi < 25) {
            nutritionQuery = "balanced, nutritious recipes for maintaining healthy weight";
        } else {
            nutritionQuery = "low-calorie, high-protein recipes for healthy weight loss";
        }

        try {
            // Use the LLM to generate personalized recipe suggestions
            const llmResult = await suggestWithOllama({
                message: `User's nutrition profile: BMI ${bmi}, Daily calories: ${context.nutritionData.calories || 2000}kcal, Protein: ${context.nutritionData.protein || 150}g, Carbs: ${context.nutritionData.carbs || 200}g, Fat: ${context.nutritionData.fat || 70}g.\n\nSuggest 3 recipes that are ${nutritionQuery}. Each recipe should mention approximate calories and be practical to make.`,
                context: context.messages.slice(-4),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: true,
                requestedCount: 3
            });

            if (llmResult && llmResult.recipes && llmResult.recipes.length > 0) {
                const enrichedRecipes = enrichRecipesWithProducts(llmResult.recipes, data.products || []);
                enrichedRecipes.forEach(r => context.seenRecipes.add(r.name));
                
                const reply = `🍽️ **Personalized Recipe Suggestions**\n\nBased on your nutrition profile (BMI: ${bmi}, ${context.nutritionData.calories}kcal/day), here are recipes tailored for you:\n\n${llmResult.reply || 'Here are your personalized recipes!'}`;
                
                context.nutritionFlow = null; // Reset flow
                context.messages.push({ from: 'bot', text: reply });
                return { reply, recipes: enrichedRecipes, context };
            }
        } catch (error) {
            console.error('Error generating nutrition recipes:', error);
        }

        // Fallback to database search
        const recipes = findRecipesForOccasion(nutritionQuery, data.recipes || [], context.seenRecipes, context.messages, { treatAsMore: false });
        const enrichedRecipes = enrichRecipesWithProducts(recipes.slice(0, 3), data.products || []);
        enrichedRecipes.forEach(r => context.seenRecipes.add(r.name));
        
        const reply = `🍽️ **Personalized Recipe Suggestions**\n\nBased on your nutrition profile (BMI: ${bmi}, ${context.nutritionData.calories}kcal/day), here are some recipes for you!`;
        
        context.nutritionFlow = null; // Reset flow
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: enrichedRecipes, context };
    }

    // Fallback
    return { reply: "I'm not sure what happened. Let's start over! Click the Nutrition Coach button again.", recipes: [], context };
}

// Helper: Parse height and weight from user input
function parseHeightWeight(text) {
    const result = { height: null, weight: null };
    
    // Try to parse metric (cm, kg)
    const cmMatch = text.match(/(\d+(?:\.\d+)?)\s*cm/i);
    const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*kg/i);
    
    if (cmMatch) result.height = parseFloat(cmMatch[1]);
    if (kgMatch) result.weight = parseFloat(kgMatch[1]);
    
    // Try to parse imperial (feet/inches, lbs)
    const feetInchMatch = text.match(/(\d+)\s*(?:feet|ft|')\s*(\d+)?/i);
    const lbsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)/i);
    
    if (feetInchMatch) {
        const feet = parseInt(feetInchMatch[1]);
        const inches = feetInchMatch[2] ? parseInt(feetInchMatch[2]) : 0;
        result.height = Math.round((feet * 12 + inches) * 2.54); // Convert to cm
    }
    
    if (lbsMatch) {
        result.weight = Math.round(parseFloat(lbsMatch[1]) / 2.205); // Convert to kg
    }
    
    // Try simple number extraction if no units found
    if (!result.height || !result.weight) {
        const numbers = text.match(/\d+(?:\.\d+)?/g);
        if (numbers && numbers.length >= 2) {
            const num1 = parseFloat(numbers[0]);
            const num2 = parseFloat(numbers[1]);
            
            // Heuristic: height is usually larger in cm, weight varies
            if (num1 > 100 && num1 < 250) result.height = num1; // Likely cm
            else if (num1 > 4 && num1 < 8) result.height = Math.round(num1 * 30.48); // Likely feet
            
            if (num2 > 30 && num2 < 200) result.weight = num2; // Could be kg or lbs
            else if (!result.weight && num1 > 30 && num1 < 200) result.weight = num1;
        }
    }
    
    return result;
}

// Helper: Parse activity level from user input
function parseActivityLevel(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes('1') || lower.includes('sedentary')) return 'sedentary';
    if (lower.includes('2') || lower.includes('lightly')) return 'lightly active';
    if (lower.includes('3') || lower.includes('moderately') || lower.includes('moderate')) return 'moderately active';
    if (lower.includes('4') || lower.includes('very active') || lower.includes('very')) return 'very active';
    if (lower.includes('5') || lower.includes('extremely') || lower.includes('extreme')) return 'extremely active';
    
    return null;
}

// ============================================================
// BUDGET PLANNER FLOW
// Ask budget and servings, suggest <=3 grounded recipes under budget
// ============================================================
async function handleBudgetFlow(message, context, data) {
    // Always reset on trigger
    if (message === '__BUDGET_START__') {
        delete context.budgetFlow;
        delete context.budget;
        delete context.servings;
    }
    
    if (!context.budgetFlow) {
        context.budgetFlow = 'awaiting_budget';
        const reply = "💸 **Budget Planner**\n\n**What I do:** I help you find recipes that fit within your budget. Tell me your spending limit and servings needed, and I'll suggest affordable, delicious recipes that won't break the bank. I'll calculate total costs and show you the cheapest options first.\n\n---\n\nWhat is your total budget and how many servings do you need?\n\nExample: '$15 for 2 servings' or 'under $20 for 3'.";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    if (context.budgetFlow === 'awaiting_budget') {
        const { budget, servings } = parseBudgetAndServings(message);
        if (!budget) {
            const reply = "Please specify a dollar budget (e.g., '$15 for 2 servings').";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
        context.budget = budget;
        context.servings = servings || 2;

        try {
            const llm = await suggestWithOllama({
                message: `Suggest 3 simple, affordable recipes suitable for ${context.servings} serving(s). Keep within roughly $${budget} total using the provided product list when possible. Keep descriptions concise.`,
                context: context.messages.slice(-6),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: true,
                requestedCount: 3
            });

            let recipes = Array.isArray(llm?.recipes) ? llm.recipes : [];
            recipes = enrichRecipesWithProducts(recipes, data.products || []);

            // Rough cost estimate by summing first matched product prices
            const priced = recipes.map(r => ({
                ...r,
                approxCost: (r.ingredients || []).reduce((sum, ing) => sum + +(ing.products?.[0]?.price ?? 0), 0)
            }));

            // Strictly enforce the user's budget in this flow (no automatic buffer)
            const filtered = priced.filter(r => Number.isFinite(r.approxCost) && r.approxCost <= budget + 1e-9);

            let final = (filtered.length > 0 ? filtered : []);
            let budgetNote = '';
            if (final.length === 0) {
                // If nothing fits strictly, show up to 3 closest options but clearly label them as over budget
                const closest = sortByCheapest(priced).slice(0, 3);
                final = closest;
                if (closest.length > 0) {
                    const lines = closest.map(r => `• ${r.name} — ~$${estimateRecipeCost(r).toFixed(2)}`).join('\n');
                    budgetNote = `\n\nI couldn't find recipes strictly under $${budget}. Here are the closest options (slightly over):\n${lines}`;
                } else {
                    budgetNote = `\n\nI couldn't find any recipes close to this budget using current prices.`;
                }
            }
            final = final.slice(0, 3);
            final.forEach(r => context.seenRecipes.add(r.name));

            const reply = `Here ${final.length === 1 ? 'is 1 recipe' : `are ${final.length} recipes`} ${filtered.length > 0 ? `within your $${budget}` : 'closest to your budget'} for ${context.servings} serving(s). I keep suggestions short due to space—ask for 'More' if you want additional options.` + budgetNote;
            context.budgetFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: final, context };
        } catch (e) {
            console.error('Budget flow error:', e);
            const reply = "I couldn't generate budget recipes right now. Try again or ask for budget-friendly recipes under $X.";
            context.budgetFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's start over—tap Budget Planner again and tell me a budget like '$15 for 2 servings'.";
    context.budgetFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

function parseBudgetAndServings(text) {
    const dollars = text.match(/\$?\s*(\d+(?:\.\d+)?)/);
    const serv = text.match(/(\d+)\s*(?:servings?|people|persons?)/i);
    return { budget: dollars ? parseFloat(dollars[1]) : null, servings: serv ? parseInt(serv[1]) : null };
}

// ============================================================
// TIME SAVER FLOW
// Ask available minutes; suggest quick recipes; <=3 items
// ============================================================
async function handleTimeFlow(message, context, data) {
    // Always reset on trigger
    if (message === '__TIME_START__') {
        delete context.timeFlow;
        delete context.minutes;
    }
    
    if (!context.timeFlow) {
        context.timeFlow = 'awaiting_minutes';
        const reply = "⏱️ **Time Saver**\n\n**What I do:** I find quick recipes based on how much time you have. Whether you've got 15 minutes or 45, I'll suggest fast, simple meals that fit your schedule perfectly.\n\n---\n\nHow much time do you have?\n\nReply with minutes like '20 minutes' or 'under 30'. I'll suggest a few quick ideas (2–3) so we don't overload the chat.";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    if (context.timeFlow === 'awaiting_minutes') {
        const minutes = parseMinutes(textToNumberString(message));
        if (!minutes) {
            const reply = "Please tell me the minutes you have (e.g., '15 minutes').";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
        context.minutes = minutes;
        try {
            const llm = await suggestWithOllama({
                message: `Suggest 3 recipes that can be made in about ${minutes} minutes. Keep steps short and use available products when possible.`,
                context: context.messages.slice(-6),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: true,
                requestedCount: 3
            });
            const recipes = enrichRecipesWithProducts(llm?.recipes || [], data.products || []);
            recipes.slice(0,3).forEach(r => context.seenRecipes.add(r.name));
            const reply = `Here ${recipes.length === 1 ? 'is a quick recipe' : `are ${Math.min(recipes.length,3)} quick recipes`} for ~${minutes} minutes. I keep it to a few at a time—use 'More' for extras.`;
            context.timeFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: recipes.slice(0,3), context };
        } catch (e) {
            console.error('Time flow error:', e);
            const reply = "Sorry, I couldn't compile quick recipes right now.";
            context.timeFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's restart—tap Time Saver and tell me the minutes available.";
    context.timeFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

function textToNumberString(s){ return String(s||''); }
function parseMinutes(text){ const m = text.match(/(\d+)/); return m ? parseInt(m[1]) : null; }

// ============================================================
// PANTRY HELPER FLOW
// Ask for items user has; suggest <=3 recipes using overlapping ingredients
// ============================================================
// PANTRY HELPER FLOW
// Conversational guidance about food storage, freshness, pairings, and sustainability
// ============================================================
async function handlePantryFlow(message, context, data) {
    debug('handlePantryFlow called. Message:', message, 'Current flow state:', context.pantryFlow);
    
    // Always reset on trigger
    if (message === '__PANTRY_START__') {
        debug('Resetting pantry flow due to trigger message');
        delete context.pantryFlow;
        delete context.pantryItems;
    }
    
    if (!context.pantryFlow) {
        context.pantryFlow = 'awaiting_items';
        const reply = "🧺 **Pantry Helper**\n\n**What I do:** I help you make the most of ingredients you already have. I'll give you tips on storage, freshness, which items pair well, and how to reduce waste. Then, if you want, I can suggest recipes using your exact ingredients.\n\n---\n\nWhat ingredients or groceries do you have that you'd like to talk about?\n\nJust list them out (like 'eggs, spinach, milk' or 'chicken, rice, tomatoes').";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    if (context.pantryFlow === 'awaiting_items') {
        const items = (message || '').split(/,|\n|and/).map(s=>s.trim()).filter(Boolean).slice(0,12);
        if (items.length < 1) {
            const reply = "Hmm, I didn't catch any items. Could you list what you have? For example: 'eggs, spinach, milk'.";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
        
        context.pantryItems = items;
        context.pantryFlow = 'gave_guidance';

        try {
            // Use LLM to generate conversational guidance about storage, freshness, pairings, and sustainability
            const guidancePrompt = `The user has these ingredients: ${items.join(', ')}.

Act as a friendly, knowledgeable food companion. Provide helpful, conversational guidance about:
1. How to store or preserve these items properly
2. How long they typically stay fresh
3. Which items pair well together
4. Tips to reduce waste (using stems, peels, etc.)
5. Any sustainability tips

Keep it warm, gentle, and conversational - like a smart friend who knows food facts. Use emojis sparingly. Keep it to 3-4 short paragraphs maximum.

End with: "Would you like me to suggest some recipes using what you have?"`;

            const guidanceResponse = await chatWithOllama(
                guidancePrompt,
                context.messages.slice(-4),
                [],
                []
            );

            const reply = guidanceResponse || `Nice! You've got ${items.join(', ')}. 🌱\n\nLet me share some tips about these items, and then I can help you use them wisely!\n\nWould you like me to suggest some recipes using what you have?`;
            
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        } catch (e) {
            console.error('Pantry guidance error:', e);
            const reply = `Nice combo! You've got ${items.join(', ')}. 🌱\n\nThese ingredients can work great together. Most fresh items like these stay good for 3-7 days when stored properly in the fridge.\n\nWould you like me to suggest some recipes using what you have?`;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    if (context.pantryFlow === 'gave_guidance') {
        const userResponse = message.toLowerCase().trim();
        const wantsRecipes = /\b(yes|yeah|sure|ok|okay|yep|yup|please|show|suggest)\b/i.test(userResponse);
        
        if (!wantsRecipes) {
            const reply = "No problem! Feel free to come back anytime you need help with your pantry items. 😊";
            context.pantryFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // User wants recipes - generate them using ALL the ingredients they listed
        const items = context.pantryItems || [];
        try {
            const llm = await suggestWithOllama({
                message: `Create up to 3 recipes where EACH recipe uses ALL of these ingredients: ${items.join(', ')}.

IMPORTANT RULES:
- Each recipe MUST include ALL of these ingredients: ${items.join(', ')}
- You CAN add basic pantry staples like oil, butter, salt, pepper, spices to complete the recipe
- But EVERY recipe must use ALL the main ingredients the user listed
- Keep each recipe concise and practical

Example: If user has "tomatoes, onion, eggs" - every recipe should use tomatoes AND onion AND eggs (plus optional basics like salt, oil).`,
                context: context.messages.slice(-6),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: false,
                requestedCount: 3
            });
            
            let recipes = enrichRecipesWithProducts(llm?.recipes || [], data.products || []);
            
            // Filter recipes to ensure they contain ALL user's main ingredients
            const userItemsLower = new Set(items.map(i => i.toLowerCase().trim()));
            const basicStaples = new Set(['oil', 'olive oil', 'butter', 'salt', 'pepper', 'black pepper', 'spice', 'spices', 'garlic', 'onion powder', 'paprika', 'cumin']);
            
            recipes = recipes.filter(recipe => {
                const recipeIngredients = (recipe.ingredients || []).map(ing => 
                    (ing.name || '').toLowerCase().trim()
                );
                
                // Check if ALL user ingredients are present in the recipe
                return Array.from(userItemsLower).every(userItem => 
                    recipeIngredients.some(ingName => 
                        ingName.includes(userItem) || userItem.includes(ingName)
                    )
                );
            });
            
            if (recipes.length === 0) {
                const reply = `Hmm, I'm having trouble creating recipes that use ALL of: ${items.join(', ')}. Try adding a couple more ingredients, or I can suggest recipes that use most of them instead!`;
                context.pantryFlow = null;
                context.messages.push({ from: 'bot', text: reply });
                return { reply, recipes: [], context };
            }
            
            recipes.slice(0,3).forEach(r => context.seenRecipes.add(r.name));
            const reply = `Perfect! Here ${recipes.length === 1 ? 'is 1 recipe' : `are ${Math.min(recipes.length,3)} recipes`} using all your ingredients: ${items.join(', ')}! 🎯`;
            context.pantryFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: recipes.slice(0,3), context };
        } catch (e) {
            console.error('Pantry recipe generation error:', e);
            const reply = "I'm having trouble generating recipes right now. Try asking me again in a moment!";
            context.pantryFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's start fresh—tap Pantry Helper and tell me what ingredients you have!";
    context.pantryFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

// ============================================================
// MEAL PREP FLOW
// Ask for recipe type preference, then suggest 1 breakfast, 1 lunch, 1 dinner
// ============================================================
async function handleMealPrepFlow(message, context, data) {
    debug('handleMealPrepFlow called. Message:', message, 'Current flow state:', context.mealPrepFlow);
    
    // Always reset on trigger, even if flow state exists
    if (message === '__MEAL_PREP_START__') {
        debug('Resetting meal prep flow due to trigger message');
        delete context.mealPrepFlow;
        delete context.mealPrepPreference;
    }
    
    if (!context.mealPrepFlow) {
        debug('Starting new meal prep flow - asking for preference');
        context.mealPrepFlow = 'awaiting_preference';
        const reply = "🍱 **Meal Prep**\n\n**What I do:** I help you plan a full day of meals! Tell me your preference, and I'll suggest 3 recipes—one for breakfast, one for lunch, and one for dinner—perfect for meal planning and prep.\n\n---\n\nWhat type of recipes would you prefer?\n\n1️⃣ Protein-rich\n2️⃣ Vegetarian\n3️⃣ Low-carb\n4️⃣ Quick & easy\n5️⃣ High-fiber\n\nJust reply with the number (1-5) or describe your preference!";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    if (context.mealPrepFlow === 'awaiting_preference') {
        debug('Processing user preference:', message);
        let preference = message.trim();
        
        // Map number inputs to preferences
        const numberMap = {
            '1': 'protein-rich',
            '2': 'vegetarian',
            '3': 'low-carb',
            '4': 'quick and easy',
            '5': 'high-fiber'
        };
        
        // Check if user entered a number
        if (numberMap[preference]) {
            preference = numberMap[preference];
        }
        
        if (preference.length < 3) {
            const reply = "Please tell me what type of recipes you'd like (e.g., '1' for protein-rich, '2' for vegetarian, or describe your preference).";
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
        
        context.mealPrepPreference = preference;

        try {
            const llm = await suggestWithOllama({
                message: `Suggest exactly 3 ${preference} recipes for meal prep:\n1. ONE breakfast recipe\n2. ONE lunch recipe\n3. ONE dinner recipe\n\nEach should be practical for meal prep and clearly labeled with its meal type. Keep descriptions concise.`,
                context: context.messages.slice(-6),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: false,
                requestedCount: 3
            });

            let recipes = Array.isArray(llm?.recipes) ? llm.recipes : [];
            
            // Ensure we have breakfast, lunch, and dinner
            const breakfast = recipes.find(r => (r.mealType || '').toLowerCase().includes('breakfast')) || recipes[0];
            const lunch = recipes.find(r => (r.mealType || '').toLowerCase().includes('lunch')) || recipes[1];
            const dinner = recipes.find(r => (r.mealType || '').toLowerCase().includes('dinner')) || recipes[2];
            
            // Set meal types explicitly
            if (breakfast) breakfast.mealType = 'breakfast';
            if (lunch) lunch.mealType = 'lunch';
            if (dinner) dinner.mealType = 'dinner';
            
            const finalRecipes = [breakfast, lunch, dinner].filter(Boolean);
            const enriched = enrichRecipesWithProducts(finalRecipes, data.products || []);
            enriched.forEach(r => context.seenRecipes.add(r.name));

            const reply = `Perfect! Here's your ${preference} meal prep plan:\n\n🌅 Breakfast: ${breakfast?.name || 'N/A'}\n🌞 Lunch: ${lunch?.name || 'N/A'}\n🌙 Dinner: ${dinner?.name || 'N/A'}\n\nClick "Add Ingredients" to add any recipe's ingredients to your shopping list!`;
            context.mealPrepFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: enriched, context };
        } catch (e) {
            console.error('Meal prep flow error:', e);
            const reply = "I couldn't generate your meal prep plan right now. Try again or describe the type of recipes you want.";
            context.mealPrepFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's restart—tap Meal Prep and tell me what type of recipes you prefer.";
    context.mealPrepFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

// ============================================================
// HEALTHY OPTIONS FLOW
// Nutrition and mindfulness guide for smart swaps and balanced eating
// ============================================================
async function handleHealthyFlow(message, context, data) {
    debug('handleHealthyFlow called. Message:', message, 'Current flow state:', context.healthyFlow);
    
    // Always reset on trigger
    if (message === '__HEALTHY_START__') {
        debug('Resetting healthy flow due to trigger message');
        delete context.healthyFlow;
    }
    
    if (!context.healthyFlow) {
        context.healthyFlow = 'awaiting_topic';
        const reply = "🌿 **Healthy Options**\n\n**What I do:** I'm your friendly nutrition and mindfulness guide. I help you make healthier food choices by suggesting smart swaps (like chips → roasted chickpeas) and offering encouragement. No strict diet rules—just positive, practical tips to help you eat better.\n\n---\n\nWhat kind of food are you thinking about today — snacks, meals, or drinks?\n\n(Or just tell me what's on your mind, like 'I've been eating too many chips' or 'trying to eat healthier')";
        context.messages.push({ from: 'bot', text: reply });
        return { reply, recipes: [], context };
    }

    if (context.healthyFlow === 'awaiting_topic') {
        const userMessage = message.toLowerCase().trim();
        
        // Check if it's a general "trying to eat healthier" message
        const isGeneralHealth = /(trying|want|need|looking)\s+to\s+(eat|be)\s+(healthier|healthy|better)/i.test(message) ||
                                /eat\s+(healthier|healthy|better)/i.test(message);
        
        if (isGeneralHealth) {
            const reply = "That's great! 🌱 Starting a healthier journey is all about small, sustainable changes.\n\nHere's a simple tip: Try adding one extra veggie or a high-fiber grain to your meals this week. Small changes add up!\n\nWould you like some specific healthy recipe suggestions, or tips about a particular food?";
            context.healthyFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // Use LLM to provide personalized health tips and smart swaps
        try {
            const healthPrompt = `The user said: "${message}"

Act as a warm, positive nutrition guide. Provide friendly advice about healthier alternatives or mindful eating tips related to what they mentioned.

Guidelines:
- If they mention a specific food (chips, soda, pasta, etc.), suggest 1-2 healthier swaps
- Keep it conversational and non-judgmental (use phrases like "Happens to all of us!" or "Small swaps can help")
- Add one practical tip they can try
- Use emojis sparingly (🌱 😄)
- Keep response to 2-3 short paragraphs
- End with: "Want me to share some healthy recipe ideas, or any other food tips?"

Be encouraging and gentle, not preachy!`;

            const healthResponse = await chatWithOllama(
                healthPrompt,
                context.messages.slice(-4),
                [],
                []
            );

            const reply = healthResponse || "That's a great question! Small changes like choosing whole grains, adding more veggies, or swapping sugary drinks for water can make a big difference. 🌱\n\nWant me to share some healthy recipe ideas, or any other food tips?";
            
            context.healthyFlow = 'gave_tips';
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        } catch (e) {
            console.error('Healthy flow guidance error:', e);
            const reply = "Here's a quick tip: Try swapping processed snacks for fresh fruits, nuts, or veggie sticks. Small changes add up! 🌱\n\nWant me to share some healthy recipe ideas?";
            context.healthyFlow = 'gave_tips';
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    if (context.healthyFlow === 'gave_tips') {
        const userResponse = message.toLowerCase().trim();
        const wantsRecipes = /\b(yes|yeah|sure|ok|okay|yep|yup|please|show|suggest|recipe)\b/i.test(userResponse);
        
        if (!wantsRecipes) {
            const reply = "Sounds good! Feel free to come back anytime you want to chat about healthier choices. 😊";
            context.healthyFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }

        // User wants healthy recipes
        try {
            const llm = await suggestWithOllama({
                message: `Suggest 3 healthy, balanced recipes. Focus on whole foods, lean proteins, vegetables, and whole grains. Keep each recipe nutritious but delicious and practical.`,
                context: context.messages.slice(-6),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: false,
                requestedCount: 3
            });
            const recipes = enrichRecipesWithProducts(llm?.recipes || [], data.products || []);
            recipes.slice(0,3).forEach(r => context.seenRecipes.add(r.name));
            const reply = `Here are 3 healthy recipe ideas that are both nutritious and delicious! 🌱`;
            context.healthyFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: recipes.slice(0,3), context };
        } catch (e) {
            console.error('Healthy recipe generation error:', e);
            const reply = "I'm having trouble generating recipes right now. Try asking me again in a moment!";
            context.healthyFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's start fresh—tap Healthy Options and tell me what's on your mind!";
    context.healthyFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

// ============================================================
// DAILY MENU FLOW
// Provides a complete daily meal plan: breakfast, lunch, and dinner
// ============================================================
async function handleDailyMenuFlow(message, context, data) {
    debug('handleDailyMenuFlow called. Message:', message, 'Current flow state:', context.dailyMenuFlow);
    
    // Always reset on trigger
    if (message === '__DAILY_MENU_START__') {
        debug('Resetting daily menu flow due to trigger message');
        delete context.dailyMenuFlow;
    }
    
    if (!context.dailyMenuFlow) {
        context.dailyMenuFlow = 'generating';
        
        try {
            // Generate breakfast, lunch, and dinner recipes
            const llm = await suggestWithOllama({
                message: `Suggest exactly 3 recipes for a complete daily menu:
1. One breakfast recipe (light and energizing)
2. One lunch recipe (balanced and satisfying)
3. One dinner recipe (hearty and comforting)

Make them diverse, delicious, and practical for everyday cooking. Label each with its meal type.`,
                context: context.messages.slice(-4),
                recipeCatalog: data.recipes || [],
                productList: data.products || [],
                avoidNames: Array.from(context.seenRecipes || []),
                groundedMode: false,
                requestedCount: 3
            });

            let recipes = llm?.recipes || [];
            
            // Ensure we have exactly 3 recipes with proper meal types
            if (recipes.length >= 3) {
                recipes[0].mealType = recipes[0].mealType || 'breakfast';
                recipes[1].mealType = recipes[1].mealType || 'lunch';
                recipes[2].mealType = recipes[2].mealType || 'dinner';
            }
            
            recipes = enrichRecipesWithProducts(recipes, data.products || []);
            recipes.slice(0, 3).forEach(r => context.seenRecipes.add(r.name));
            
            const reply = "🍽️ **Full Day Menu**\n\n**What I do:** I create a complete daily meal plan with one recipe for breakfast, one for lunch, and one for dinner—giving you a full day of delicious, balanced meals!\n\n---\n\nHere's your complete menu for the day:";
            context.dailyMenuFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: recipes.slice(0, 3), context };
        } catch (e) {
            console.error('Daily menu generation error:', e);
            const reply = "I'm having trouble generating your daily menu right now. Try asking me again in a moment!";
            context.dailyMenuFlow = null;
            context.messages.push({ from: 'bot', text: reply });
            return { reply, recipes: [], context };
        }
    }

    const reply = "Let's start fresh—tap Full Day Menu for a complete breakfast, lunch, and dinner plan!";
    context.dailyMenuFlow = null;
    context.messages.push({ from: 'bot', text: reply });
    return { reply, recipes: [], context };
}

async function processMessage(message, data, context = {}) {
    try {
        debug('\n=== Processing Message ===');
        debug('Message:', message);
        debug('Data structure:', {
            hasProducts: !!data?.products,
            hasRecipes: !!data?.recipes,
            numProducts: data?.products?.length,
            numRecipes: data?.recipes?.length
        });
        debug('Initial context:', context);

        // Initialize context - convert seenRecipes array back to Set if needed
        if (Array.isArray(context.seenRecipes)) {
            context.seenRecipes = new Set(context.seenRecipes);
        } else {
            context.seenRecipes = context.seenRecipes || new Set();
        }
        context.messages = context.messages || [];

        // Add user message to context
        context.messages.push({ from: 'user', text: message });

        // ============================================================
        // FLOW RESET: Clear other flows when a new trigger is detected
        // ============================================================
        const triggers = ['__NUTRITION_START__', '__BUDGET_START__', '__TIME_START__', '__PANTRY_START__', '__MEAL_PREP_START__', '__HEALTHY_START__', '__DAILY_MENU_START__'];
        if (triggers.includes(message)) {
            debug('Detected flow trigger:', message, '- Clearing all other flow states');
            // Clear all flow states except the one being triggered
            if (message !== '__NUTRITION_START__') {
                delete context.nutritionFlow;
                delete context.nutritionData;
            }
            if (message !== '__BUDGET_START__') {
                delete context.budgetFlow;
                delete context.budget;
                delete context.servings;
            }
            if (message !== '__TIME_START__') {
                delete context.timeFlow;
                delete context.minutes;
            }
            if (message !== '__PANTRY_START__') {
                delete context.pantryFlow;
                delete context.pantryItems;
            }
            if (message !== '__MEAL_PREP_START__') {
                delete context.mealPrepFlow;
                delete context.mealPrepPreference;
            }
            if (message !== '__HEALTHY_START__') {
                delete context.healthyFlow;
            }
            if (message !== '__DAILY_MENU_START__') {
                delete context.dailyMenuFlow;
            }
        }

        // ============================================================
        // SPECIAL INTERACTIVE FEATURES
        // ============================================================
        
        // Nutrition Coach Flow
        if (message === '__NUTRITION_START__' || context.nutritionFlow) {
            return await handleNutritionFlow(message, context, data);
        }

        // Budget Planner Flow
        if (message === '__BUDGET_START__' || context.budgetFlow) {
            return await handleBudgetFlow(message, context, data);
        }

        // Time Saver Flow
        if (message === '__TIME_START__' || context.timeFlow) {
            return await handleTimeFlow(message, context, data);
        }

        // Pantry Helper Flow
        if (message === '__PANTRY_START__' || context.pantryFlow) {
            return await handlePantryFlow(message, context, data);
        }

        // Meal Prep Flow
        if (message === '__MEAL_PREP_START__' || context.mealPrepFlow) {
            debug('Meal Prep Flow triggered. Message:', message, 'Flow state:', context.mealPrepFlow);
            return await handleMealPrepFlow(message, context, data);
        }

        // Healthy Options Flow
        if (message === '__HEALTHY_START__' || context.healthyFlow) {
            debug('Healthy Options Flow triggered. Message:', message, 'Flow state:', context.healthyFlow);
            return await handleHealthyFlow(message, context, data);
        }

        // Daily Menu Flow
        if (message === '__DAILY_MENU_START__' || context.dailyMenuFlow) {
            debug('Daily Menu Flow triggered. Message:', message, 'Flow state:', context.dailyMenuFlow);
            return await handleDailyMenuFlow(message, context, data);
        }

        // ============================================================
        // OPTION A: LLM-FIRST ARCHITECTURE
        // Let the AI understand intent naturally, then decide if we need recipe cards
        // ============================================================

        // 1. Special case: Shopping list actions (explicit add commands)
        // More specific regex - only trigger if user explicitly says "add to" or "add ingredients"
        const isShoppingAction = /(add( to)? (shopping|list|cart)|add ingredients|put (in|on) (shopping )?list|\b(add|put)\b[\s,\-]*.+?\b(in|into|to|on)\b\s+(my\s+)?((shopping\s+)?(list|cart)))/i.test(message);
        
        if (isShoppingAction) {
            // Prefer a database search to identify concrete products, then fall back to text parsing
            let searchHits = [];
            try { searchHits = searchProductsInDatabase(message, data.products || []); } catch {}

            let ingredients = [];
            if (Array.isArray(searchHits) && searchHits.length > 0) {
                ingredients = searchHits.slice(0, 10).map(h => ({ name: h.item, products: [{ price: h.price }] }));
            } else {
                const ingredientTexts = parseIngredientsFromText(message, data.products);
                ingredients = ingredientTexts.map(name => {
                    const lname = (name||'').toLowerCase();
                    const prod = (data.products || []).find(p => {
                        const item = (p.item||'').toLowerCase();
                        return item === lname || lname.includes(item) || item.includes(lname);
                    });
                    const price = prod?.price;
                    return price != null && isFinite(price)
                        ? { name, products: [{ price }] }
                        : { name };
                });
            }

            // Persist last shopping action for context (optional)
            context.lastAddedIngredients = ingredients.map(i => ({ name: i.name }));

            const count = ingredients.length;
            const names = ingredients.slice(0, 3).map(i => i.name).join(', ');
            const replyText = count > 0
                ? `I found **${names}**${count > 3 ? ' and more' : ''}! You can click the **+** button next to each item in the Products panel on the right to add them to your shopping list.`
                : `I couldn't find those items in stock. Try browsing the **Products** panel on the right to add what you need!`;

            context.messages.push({ from: 'bot', text: replyText });

            // Return WITHOUT a 'shopping' payload so the frontend doesn't try to auto-add
            // User will manually click + in Products panel
            return { reply: replyText, recipes: [], context };
        }

        // 2. Selection intent: ALWAYS handle first and return a single card
        const isSelectionRequest = /(which\s+is\s+(the\s+)?best|which\s+one\s+is\s+best|best\s+one|best\s+recipe|pick\s+one|choose\s+one|recommend\s+one|top\s+choice|favorite|favourite)/i.test(message);
        if (isSelectionRequest) {
            const conv = analyzeConversationContext(context);
            let candidates = Array.isArray(context.allSuggestedRecipes) ? context.allSuggestedRecipes.slice(-9) : [];

            // If no prior cards, generate a small set then pick one
            if (!candidates || candidates.length === 0) {
                const userQuery = context.lastNonMoreQuery || message;
                try {
                    const llmGen = await suggestWithOllama({
                        message: `${userQuery}\n\nPlease propose about 3 concise recipes so I can choose the best one.`,
                        context: context.messages,
                        recipeCatalog: Array.isArray(data.recipes) ? data.recipes : [],
                        productList: Array.isArray(data.products) ? data.products : [],
                        avoidNames: Array.from(context.seenRecipes || []),
                        groundedMode: false
                    });
                    if (llmGen && Array.isArray(llmGen.recipes)) {
                        candidates = llmGen.recipes.map(r => ({
                            name: r?.name || 'Untitled Recipe',
                            ingredients: (r?.ingredients || []).map(n => ({ name: typeof n === 'string' ? n : (n?.name || String(n)) })),
                            steps: Array.isArray(r?.steps) ? r.steps : (r?.steps ? String(r?.steps) : []),
                            autogenerated: true,
                            mealType: r?.mealType || null
                        }));
                    }
                } catch {}

                // If still no candidates, fall back to dataset scoring
                if (!candidates || candidates.length === 0) {
                    const fallback = findRecipesForOccasion(userQuery, Array.isArray(data.recipes) ? data.recipes : [], context.seenRecipes, context.messages, { treatAsMore: false, queryForScoring: userQuery });
                    candidates = fallback || [];
                }
            }

            if (candidates && candidates.length > 0) {
                const best = chooseBestRecipe(enrichRecipesWithProducts(candidates, data.products || []), conv, data.products || []);
                const enriched = enrichRecipesWithProducts([best], data.products || []);
                const name = enriched[0]?.name || 'this one';
                const rationale = explainBestChoice(enriched[0], conv, data.products || []);
                const replyText = `I’d pick ${name}${rationale ? ` - ${rationale}` : ''}. Want me to add the ingredients or see another option?`;
                context.seenRecipes.add(name);
                context.allSuggestedRecipes = mergeRecipeHistory(context.allSuggestedRecipes, enriched);
                context.messages.push({ from: 'bot', text: replyText });
                return { reply: replyText, recipes: enriched, context };
            } else {
                const replyText = "Share a couple of options, and I’ll pick the best one for your needs.";
                context.messages.push({ from: 'bot', text: replyText });
                return { reply: replyText, recipes: [], context };
            }
        }

        // 3. PRODUCT SEARCH: Check if the query involves products and search the database
        let isProductQuery = detectProductQuery(message);
        let productSearchResults = [];

        // Detect follow-ups that reference prior product results (e.g., "cheapest", "under $10", "those")
        const followUpInfo = detectProductFollowUp(message);
        const hasPriorProducts = Array.isArray(context.lastProductResults) && context.lastProductResults.length > 0;

        if (isProductQuery) {
            debug('Product query detected, searching database...');
            productSearchResults = searchProductsInDatabase(message, data.products || []);
            debug(`Found ${productSearchResults.length} matching products`);
            // Persist for follow-ups
            context.lastProductQuery = message;
            context.lastProductResults = productSearchResults;
        } else if (followUpInfo.isFollowUp && hasPriorProducts) {
            debug('Follow-up about products detected; using last product results');
            isProductQuery = true; // treat as product-related for downstream logic
            productSearchResults = Array.from(context.lastProductResults);

            // Apply simple follow-up transforms: cheapest / most expensive / under $X
            if (followUpInfo.intent === 'cheapest') {
                productSearchResults.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
                productSearchResults = productSearchResults.slice(0, 3);
            } else if (followUpInfo.intent === 'expensive') {
                productSearchResults.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
                productSearchResults = productSearchResults.slice(0, 3);
            }
            if (Number.isFinite(followUpInfo.priceUnder)) {
                productSearchResults = productSearchResults.filter(p => Number.isFinite(p.price) && p.price <= followUpInfo.priceUnder);
            }
        }

        // 4. Let the LLM handle the conversation naturally, with product context if applicable
        debug('Consulting LLM for natural response...');
        let llmResponse;
        try {
            // Enhance user message with a brief, structured context summary to aid the model
            const enhancedMessage = buildLLMUserMessage(message, context, productSearchResults);

            // Pass products via the dedicated products argument so the model can ground responses
            llmResponse = await chatWithOllama(
                enhancedMessage,
                context.messages.slice(0, -1), // Don't duplicate the message we just added
                [],
                productSearchResults.length > 0 ? productSearchResults : []
            );
        } catch (error) {
            console.error('LLM consultation failed:', error);
            console.error('Error details:', error.message, error.stack);
            llmResponse = `Error: ${error.message || 'Unknown error occurred'}. Please check the server logs for details.`;
        }

        // Normalize LLM response
        const llmReplyText = typeof llmResponse === 'string' 
            ? stripCodeFences(llmResponse) 
            : stripCodeFences(llmResponse?.reply || llmResponse?.message || '');

        debug('LLM Response:', llmReplyText);

        // Check if user is asking to format previously mentioned recipes (e.g., "give me the recipe of these")
        const isFormattingRequest = /\b(give|show|create|make|format)\b[^\n]*\b(the\s+)?(recipe|card|these|those|them)\b/i.test(message) && 
                                     /\b(of\s+)?(these|those|them|that|the\s+ones?)\b/i.test(message);

        // 3. Determine if the LLM's response indicates we should generate recipe CARDS
        // Check both the LLM's response AND the user's original message
        const llmWantsRecipes = /(here are (\d+|some|several) recipes?|i('ll| will) suggest|let me recommend|i found|i('ve| have) got.*recipes?)/i.test(llmReplyText);
        // Detect JSON-like artifacts that look like recipe structures; if present, we should not echo them
        const llmHasJsonArtifacts = /[\{\[][\s\S]*"(recipe_name|name|ingredients)"[\s\S]*[\}\]]/i.test(llmReplyText);

        const userExplicitlyAsksForRecipeCards = 
            // Direct requests like: give/show/suggest ... recipes, recipe ideas, recipe suggestions
            /\b(give|show|suggest|find|recommend|list|generate|create)\b[^\n]*\b(recipes?|recipe\s+ideas?|recipe\s+suggestions?)\b/i.test(message) ||
            // Variants with qualifiers: more/other/additional/new ... recipes
            /\b(more|other|another|additional|new|few)\b[^\n]*\b(recipes?|recipe\s+ideas?|recipe\s+suggestions?)\b/i.test(message) ||
            // Recipes with/using/for ...
            /\b(recipes?|dishes?|meals?)\b[^\n]*\b(with|using|for|that\s+use|based\s+on|containing|include|featuring)\b/i.test(message) ||
            // Bare 'more' or 'more recipes'
            /^\s*more(\s+recipes?)?\s*$/i.test(message) ||
            // "give me [something] but [variation]" - e.g., "give me for the same protein but mexican"
            /\b(give|show)\s+me\b[^\n]*\b(for|but|in|as|with)\b[^\n]*(mexican|italian|chinese|indian|thai|french|greek|japanese|korean|spanish|mediterranean|asian|european|latin|american|southern|cajun|style|dish|version|variant)/i.test(message) ||
            // Meal planning requests that imply recipes
            /\b(what\s+(can|should)\s+i\s+(make|cook)|help\s+me\s+(plan|make|cook)|ideas?\s+for)\b/i.test(message);

        // Additional heuristic: if user mentions a cuisine or a protein together with words like dish/meal, treat as card intent
        const msgLower = (message || '').toLowerCase();
        const mentionsCuisine = !!extractCuisine(msgLower);
        const mentionsDishWord = /(dish|dishes|meal|meals|recipe|recipes)/i.test(msgLower);
        const mentionsProtein = /(chicken|beef|pork|fish|salmon|tuna|shrimp|turkey|tofu|egg|eggs|yogurt|lamb)/i.test(msgLower);
        const likelyRecipeIntent = (mentionsCuisine && (mentionsProtein || mentionsDishWord)) || (mentionsProtein && /(with|using|containing|include|make|cook)/.test(msgLower));

        const needsRecipeCards = llmWantsRecipes || userExplicitlyAsksForRecipeCards || llmHasJsonArtifacts || likelyRecipeIntent;

        debug('Needs recipe cards?', needsRecipeCards, { llmWantsRecipes, userExplicitlyAsksForRecipeCards });

        // 4. If recipe cards are needed, generate them via structured LLM call
        if (needsRecipeCards) {
            debug('Generating recipe cards...');
            
            // Special case: user asking to format previously mentioned recipes (e.g., "give me the recipe of these")
            if (isFormattingRequest) {
                debug('Formatting request detected - extracting recipes from last bot message');
                // Extract recipe names from the last bot message
                const lastBotMsg = context.messages.slice().reverse().find(m => m.from === 'bot');
                const lastBotText = lastBotMsg?.text || '';
                
                // Extract recipe names using numbered list patterns or title case proper nouns
                const recipeMatches = [];
                // Pattern 1: Numbered list with recipe names (e.g., "1. Pumpkin-Spiced Tuna Casserole")
                const numberedPattern = /\d+\.\s+([A-Z][^.!?\n]{5,60})(?:\s*[–—-]\s*|\s*\n|$)/g;
                let match;
                while ((match = numberedPattern.exec(lastBotText)) !== null) {
                    recipeMatches.push(match[1].trim());
                }
                
                // Pattern 2: Title case phrases (fallback)
                if (recipeMatches.length === 0) {
                    const titlePattern = /\b([A-Z][a-z]+(?:[\s-][A-Z][a-z]+){1,5})\b/g;
                    while ((match = titlePattern.exec(lastBotText)) !== null) {
                        const candidate = match[1].trim();
                        if (candidate.length > 10 && /[A-Z].*[a-z]/.test(candidate)) {
                            recipeMatches.push(candidate);
                        }
                    }
                }
                
                if (recipeMatches.length > 0) {
                    debug(`Found ${recipeMatches.length} recipes to format: ${recipeMatches.join(', ')}`);
                    // Ask LLM to generate cards for these specific recipes
                    try {
                        const promptForFormatting = `Please create detailed recipe cards with ingredients and steps for these specific recipes:\n${recipeMatches.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
                        const llmResultJson = await suggestWithOllama({
                            message: promptForFormatting,
                            context: context.messages,
                            recipeCatalog: Array.isArray(data.recipes) ? data.recipes : [],
                            productList: Array.isArray(data.products) ? data.products : [],
                            avoidNames: [],
                            groundedMode: false
                        });
                        
                        if (llmResultJson && Array.isArray(llmResultJson.recipes) && llmResultJson.recipes.length > 0) {
                            const formatted = llmResultJson.recipes.map(r => ({
                                name: r?.name || 'Untitled Recipe',
                                ingredients: (r?.ingredients || []).map(n => ({ name: typeof n === 'string' ? n : (n?.name || String(n)) })),
                                steps: Array.isArray(r?.steps) ? r.steps : (r?.steps ? String(r.steps) : []),
                                autogenerated: true,
                                mealType: r?.mealType || null
                            }));
                            const enriched = enrichRecipesWithProducts(formatted, data.products || []);
                            const names = enriched.map(r => r.name).filter(Boolean);
                            names.forEach(n => context.seenRecipes.add(n));
                            context.allSuggestedRecipes = mergeRecipeHistory(context.allSuggestedRecipes, enriched);
                            const replyText = `Here are the full recipe cards for those suggestions! Click "Add Ingredients" to add them to your shopping list.`;
                            context.messages.push({ from: 'bot', text: replyText });
                            return { reply: replyText, recipes: enriched, context };
                        }
                    } catch (e) {
                        warn('Failed to format previously mentioned recipes:', e.message);
                    }
                }
            }
            
            // Special case: selection intent (user asks to pick the best among existing options)
            const isSelectionRequest = /(which\s+is\s+(the\s+)?best|which\s+one\s+is\s+best|best\s+recipe|pick\s+one|choose\s+one|recommend\s+one|top\s+choice|favorite|favourite)/i.test(message);
            
            if (isSelectionRequest) {
                // Pick the best recipe from recent suggestions
                const candidates = Array.isArray(context.allSuggestedRecipes) ? context.allSuggestedRecipes.slice(-9) : [];
                const conv = analyzeConversationContext(context);
                const best = chooseBestRecipe(candidates, conv, data.products || []);
                if (best) {
                    const enriched = enrichRecipesWithProducts([best], data.products || []);
                    const name = enriched[0]?.name || 'this one';
                    const rationale = explainBestChoice(enriched[0], conv, data.products || []);
                    const replyText = `From the recent suggestions, I’d pick ${name}${rationale ? ` - ${rationale}` : ''}. Want me to add the ingredients or see another option?`;
                    context.seenRecipes.add(name);
                    context.messages.push({ from: 'bot', text: replyText });
                    return { reply: replyText, recipes: enriched, context };
                } else {
                    // No history - return the LLM's conversational response  
                    context.messages.push({ from: 'bot', text: llmReplyText });
                    return { reply: llmReplyText, recipes: [], context };
                }
            }
            
            // Helper: detect strict grounded-only intent even without the word "only"
            function detectGroundedOnlyIntent(text){
                const t = (text||'').toLowerCase();
                return (
                    /\b(use|create|make|generate|give|show)\b[^\n]*\b(recipes?|dishes?|meals?)\b[^\n]*\b(with|using|based on|from)\b[^\n]*\b(products?|items?|stock|catalog|list)\b[^\n]*\b(we|you|our|your)\b/i.test(t)
                    || /\b(use|using)\b[^\n]*\b(current|available|in\s*stock|right\s*now)\b[^\n]*\b(products?|items?)\b/i.test(t)
                    || /\bfrom\s+(your|our)\s+(products?|stock|catalog|list)\b/i.test(t)
                    || /\bonly\s+from\s+(the\s+)?(catalog|product\s*list|stock)\b/i.test(t)
                );
            }

            // Not a selection - generate recipe cards via structured LLM call
            const isMore = /^(more|show me more|give me more)$/i.test(message.trim());
            const userQuery = isMore ? (context.lastNonMoreQuery || message) : message;
            const budgetCap = parseBudgetCap(userQuery);

            // Extract requested recipe count (e.g., "3 protein rich recipes" -> 3)
            const countMatch = userQuery.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
            const numberWords = {
                'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
                'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
            };
            let requestedCount = 3; // default
            if (countMatch) {
                const num = countMatch[1].toLowerCase();
                requestedCount = isNaN(num) ? (numberWords[num] || 3) : Math.min(parseInt(num), 10);
            }

            // Enforce a hard cap of 3 recipes for UI/readability/token reasons
            const userAskedOverCap = requestedCount > 3;
            const cappedCount = Math.min(requestedCount, 3);

            // Detect themed/creative requests (halloween, christmas, spooky, romantic, party-themed, etc.)
            const isThemedRequest = /(halloween|christmas|thanksgiving|easter|valentine|romantic|spooky|scary|festive|party|celebration|birthday|anniversary|themed|creative|fancy|gourmet|fusion|unique|unusual|weird|fun)\s+(recipe|dish|meal|food|idea)/i.test(userQuery) ||
                                    /(recipe|dish|meal|food|idea)\s+(for|themed|style)\s+(halloween|christmas|thanksgiving|easter|valentine|party|celebration|birthday|anniversary)/i.test(userQuery);

            // Detect grounded mode (user wants only in-catalog ingredients)
            const groundedMode = /(only\s+(use\s+)?(store|catalog|available|in\s+stock|my\s+list|product)s?)|(use\s+only\s+(what|ingredients)\s+(i\s+have|we\s+carry))|\bgrounded\b|\bonly\s+from\s+(the\s+)?catalog\b/i.test(userQuery)
                || detectGroundedOnlyIntent(userQuery)
                || !!context.groundedOnly;

            // Remember user's preference for subsequent follow-ups in this session
            if (groundedMode) context.groundedOnly = true;

            let llmResultJson = null;
            try {
                // For "More" requests, explicitly ask for DIFFERENT recipes
                let promptMessage = isMore 
                    ? `${userQuery}\n\nIMPORTANT: I've already seen these recipes, so please suggest COMPLETELY DIFFERENT ones: ${Array.from(context.seenRecipes || []).join(', ')}`
                    : userQuery;
                
                // Add explicit count instruction using the capped count
                if (cappedCount !== 3 || userAskedOverCap) {
                    promptMessage = `${promptMessage}\n\nIMPORTANT: Generate exactly ${cappedCount} ${cappedCount === 1 ? 'recipe' : 'recipes'} (the app shows up to 3 at a time).`;
                }
                // If a budget cap is present in the user's query, add a strict constraint
                if (Number.isFinite(budgetCap)) {
                    promptMessage = `${promptMessage}\n\nSTRICT BUDGET: Only include recipes whose total ingredient cost is $${budgetCap} or less. Prefer fewer, cheaper ingredients. If none fit strictly under $${budgetCap}, say so briefly.`;
                }
                    
                llmResultJson = await suggestWithOllama({
                    message: promptMessage,
                    context: context.messages,
                    recipeCatalog: Array.isArray(data.recipes) ? data.recipes : [],
                    productList: Array.isArray(data.products) ? data.products : [],
                    avoidNames: [], // Don't pass avoidNames, we're handling it in the prompt
                    groundedMode,
                    requestedCount: cappedCount // Pass the capped count to the LLM
                });
            } catch (e) {
                warn('LLM structured suggestion failed, will fallback to dataset scorer:', e.message);
            }

            // Normalize LLM output
            let llmRecipes = [];
            let structuredReply = '';
            let reasoning = '';
            if (llmResultJson && typeof llmResultJson === 'object') {
                structuredReply = stripCodeFences(llmResultJson.reply || 'Here are some ideas.');
                reasoning = llmResultJson.reasoning || '';
                if (Array.isArray(llmResultJson.recipes)) {
                    llmRecipes = llmResultJson.recipes.map(r => ({
                        name: r?.name || 'Untitled Recipe',
                        ingredients: (r?.ingredients || []).map(n => ({ name: typeof n === 'string' ? n : (n?.name || String(n)) })),
                        steps: Array.isArray(r?.steps) ? r.steps : (r?.steps ? String(r.steps) : []),
                        autogenerated: true,
                        mealType: r?.mealType || null
                    })).filter(r => r.name);
                }
            }

            // If 'more', drop exact duplicate names but be lenient (case-insensitive)
            if (isMore && llmRecipes && llmRecipes.length > 0) {
                const seen = context.seenRecipes || new Set();
                const seenLower = new Set(Array.from(seen).map(n => n.toLowerCase()));
                llmRecipes = llmRecipes.filter(r => !seenLower.has(r.name.toLowerCase()));
                
                // If all filtered out, keep them anyway (LLM gave us variations)
                if (llmRecipes.length === 0 && Array.isArray(llmResultJson?.recipes)) {
                    llmRecipes = llmResultJson.recipes.slice(0, 3).map(r => ({
                        name: r?.name || 'Untitled Recipe',
                        ingredients: (r?.ingredients || []).map(n => ({ name: typeof n === 'string' ? n : (n?.name || String(n)) })),
                        steps: Array.isArray(r?.steps) ? r.steps : (r?.steps ? String(r.steps) : []),
                        autogenerated: true,
                        mealType: r?.mealType || null
                    }));
                }
            }

            // If LLM produced nothing usable, try to parse a recipe JSON blob from the conversational reply as a rescue
            if ((!llmRecipes || llmRecipes.length === 0) && llmHasJsonArtifacts && llmReplyText) {
                try {
                    const parsed = extractRecipeFromJsonText(llmReplyText);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        llmRecipes = parsed;
                        // Build a clean, short reply for the parsed recipe(s)
                        structuredReply = buildReplyFromSuggestions(userQuery, parsed, context, { isMore, exhausted: false });
                    }
                } catch {}
            }

            // If still nothing, fallback to dataset scorer (but NOT for themed/creative requests)
            if (!llmRecipes || llmRecipes.length === 0) {
                if (isThemedRequest) {
                    // For themed requests, don't fallback to dataset - return empty with helpful message
                    warn('LLM failed to generate themed recipes, not falling back to dataset');
                    const themedReply = "I'm having trouble coming up with creative themed recipes right now. Could you try asking again or be more specific about what you'd like?";
                    context.messages.push({ from: 'bot', text: themedReply });
                    return { reply: themedReply, recipes: [], context };
                } else {
                    const suggestions = findRecipesForOccasion(
                        userQuery,
                        Array.isArray(data.recipes) ? data.recipes : [],
                        context.seenRecipes,
                        context.messages,
                        { treatAsMore: isMore, queryForScoring: userQuery }
                    );
                    llmRecipes = suggestions;
                    structuredReply = buildReplyFromSuggestions(userQuery, suggestions, context, { isMore, exhausted: suggestions.length === 0 });
                }
            }

            // Limit to 3 items and enrich with product availability
            const limited = (llmRecipes || []).slice(0, 3);
            let enriched = enrichRecipesWithProducts(limited, data.products || []);

            // In strict grounded mode, drop any recipe that contains an ingredient not in our product list
            if (groundedMode) {
                const before = enriched.length;
                enriched = enriched.filter(r => Array.isArray(r.ingredients) && r.ingredients.every(i => i && i.found));
                debug(`Grounded-only filter: ${enriched.length}/${before} recipes kept (all ingredients available)`);
                if (enriched.length === 0) {
                    const msg = "I couldn't compose a recipe using only the products in stock. Want me to relax the rule slightly or show budget/quick ideas using mostly in-stock items?";
                    context.messages.push({ from: 'bot', text: msg });
                    return { reply: msg, recipes: [], context };
                }
            }

            // Enforce strict budget cap if present
            let budgetNote = '';
            if (Number.isFinite(budgetCap)) {
                const before = enriched.length;
                const under = filterRecipesByBudget(enriched, budgetCap);
                if (under.length > 0) {
                    enriched = under;
                    debug(`Budget cap filter ($${budgetCap}) kept ${enriched.length}/${before} recipes`);
                } else {
                    // No recipes under the cap; show none, and prepare a helpful note with closest options
                    const closest = sortByCheapest(enriched).slice(0, 3);
                    if (closest.length > 0) {
                        const lines = closest.map(r => `• ${r.name} — ~$${estimateRecipeCost(r).toFixed(2)}`).join('\n');
                        budgetNote = `\n\nI couldn't find recipes strictly under $${budgetCap} with current prices. Here are the closest options (slightly over):\n${lines}\n\nReply like 'relax to $${Math.ceil(budgetCap + 2)}' to expand the cap.`;
                        // We will still return the closest options but clearly labeled as above budget
                        enriched = closest;
                    } else {
                        budgetNote = `\n\nI couldn't find any recipes close to this budget using current prices.`;
                        enriched = [];
                    }
                }
            }

            // Update context and reply
            const names = enriched.map(r => r.name).filter(Boolean);
            names.forEach(n => context.seenRecipes.add(n));
            context.allSuggestedRecipes = mergeRecipeHistory(context.allSuggestedRecipes, enriched);
            if (!isMore) context.lastNonMoreQuery = userQuery;

            // Always synchronize the reply with the actual number of recipes returned
            // to avoid "Here are 4" vs 3-card mismatches.
            const countSyncedReply = buildReplyFromSuggestions(userQuery, enriched, context, { isMore, exhausted: enriched.length === 0 });

            // If the LLM provided a reasoning string, we’ll append it after our count-synced reply.
            let finalReply = countSyncedReply;

            if (userAskedOverCap) {
                finalReply = `${finalReply}\n\nNote: I can show up to 3 recipes per response to keep the chat readable and responsive (and to stay within the model's token budget). Click "More" for additional options.`;
            }
            
            // Append reasoning if available
            if (reasoning && reasoning.trim()) {
                finalReply = `${finalReply}\n\n💡 ${reasoning.trim()}`;
            }

            if (groundedMode) {
                finalReply = `${finalReply}\n\n✓ Using only products currently available in stock.`;
            }
            if (budgetNote) {
                finalReply = `${finalReply}${budgetNote}`;
            }
            context.messages.push({ from: 'bot', text: finalReply });
            return { reply: finalReply, recipes: enriched, context };
        }
        
        // 5. If this was a product query, enhance the response with product information
        if (isProductQuery && productSearchResults.length > 0) {
            debug('Enhancing response with product search results');
            // Create a formatted product list to append
            const productList = productSearchResults.map(p => 
                `• ${p.item} - $${p.price.toFixed(2)} (${p.category})`
            ).join('\n');
            
            // If the LLM response is generic or asks for product list, replace with actual results
            const isGenericResponse = /could you share|what.*do you have|show me.*list|product list/i.test(llmReplyText);
            
            if (isGenericResponse) {
                const enhancedReply = `Here are the products I found in our database:\n\n${productList}\n\nWould you like to know more about any of these?`;
                context.messages.push({ from: 'bot', text: enhancedReply });
                return { reply: enhancedReply, recipes: [], context, products: productSearchResults };
            } else {
                // LLM already incorporated the products, just append them for clarity
                const enhancedReply = `${llmReplyText}\n\nAvailable products:\n${productList}`;
                context.messages.push({ from: 'bot', text: enhancedReply });
                return { reply: enhancedReply, recipes: [], context, products: productSearchResults };
            }
        }

        // 6. No recipe cards needed - however, if the conversational reply contained a recipe-like JSON,
        // attempt to parse and convert to a proper card to avoid leaking JSON to the UI.
        if (llmHasJsonArtifacts) {
            try {
                const parsed = extractRecipeFromJsonText(llmReplyText);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const enriched = enrichRecipesWithProducts(parsed.slice(0,3), data.products || []);
                    const replyText = buildReplyFromSuggestions(message, enriched, context, { isMore: false, exhausted: false });
                    const names = enriched.map(r => r.name).filter(Boolean);
                    names.forEach(n => context.seenRecipes.add(n));
                    context.allSuggestedRecipes = mergeRecipeHistory(context.allSuggestedRecipes, enriched);
                    context.messages.push({ from: 'bot', text: replyText });
                    return { reply: replyText, recipes: enriched, context };
                }
            } catch {}
        }

        // Otherwise, return the conversational LLM response
    debug('Returning conversational response without recipe cards');
        context.messages.push({ from: 'bot', text: llmReplyText });
        return { reply: llmReplyText, recipes: [], context };

    } catch (error) {
        console.error('Error in processMessage:', error);
        console.error(error.stack);
        throw error;
    }
}

// ============================================================
// PRODUCT SEARCH FUNCTIONS
// ============================================================

/**
 * Detect if the user's message is asking about products/ingredients
 */
function detectProductQuery(message) {
    const msg = message.toLowerCase();
    
    // Direct product queries
    const productKeywords = [
        // Questions about products
        /what\s+(kind\s+of\s+)?(\w+\s+)?(products?|items?|ingredients?|foods?|groceries)\s+(do\s+you\s+have|are\s+available|in\s+stock)/i,
        /do\s+you\s+(have|carry|sell|stock)\s+/i,
        /show\s+me\s+(some\s+|your\s+|all\s+)?(\w+\s+)?(products?|items?|ingredients?|oils?|cheese|milk|eggs?|meat|vegetables?|fruits?)/i,
        /what\s+(\w+\s+)?(oils?|cheese|milk|eggs?|meat|vegetables?|fruits?|bread|pasta|rice)\s+(do\s+you\s+have|are\s+available)/i,
        
        // Shopping/buying intent about specific products
        /(good|best|healthy|cheap|affordable)\s+(\w+\s+)?(oils?|cheese|milk|eggs?|meat|vegetables?|fruits?|bread|pasta|rice|yogurt|butter|flour|sugar|salt|pepper|spices?)/i,
        /where\s+(can\s+i\s+find|is)\s+/i,
        /looking\s+for\s+/i,
        
        // Price queries
        /how\s+much\s+(is|does|are|cost)/i,
        /price\s+(of|for)/i,
        
        // Specific product categories
        /(oils?|cheese|milk|eggs?|meat|chicken|beef|pork|fish|vegetables?|fruits?|bread|pasta|rice|yogurt|butter|flour|sugar|salt|pepper|spices?)\s+(i\s+can\s+)?(buy|purchase|get)/i,
    ];
    
    // Check if any pattern matches
    for (const pattern of productKeywords) {
        if (pattern.test(msg)) {
            return true;
        }
    }
    
    // Also detect product names directly (common grocery items)
    const commonProducts = [
        'oil', 'olive oil', 'canola oil', 'vegetable oil', 'coconut oil',
        'cheese', 'cheddar', 'mozzarella', 'parmesan',
        'milk', 'yogurt', 'butter', 'cream',
        'eggs', 'egg',
        'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna',
        'bread', 'flour', 'rice', 'pasta',
        'tomato', 'onion', 'garlic', 'potato',
        'apple', 'banana', 'orange',
        'salt', 'pepper', 'sugar'
    ];
    
    const hasProductMention = commonProducts.some(product => msg.includes(product));
    const hasActionWord = /(buy|purchase|get|find|need|want|looking|shopping|stock|available|have|carry|sell)/i.test(msg);
    
    // If mentions product + action word, it's likely a product query
    if (hasProductMention && hasActionWord) {
        return true;
    }
    
    return false;
}

/**
 * Search products in the database based on user query
 */
function searchProductsInDatabase(query, products) {
    if (!products || products.length === 0) {
        return [];
    }
    
    const queryLower = query.toLowerCase();
    const results = [];
    
    // Extract potential product keywords from the query
    const words = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    // Search for products that match query terms
    for (const product of products) {
        const itemLower = (product.item || '').toLowerCase();
        const categoryLower = (product.category || '').toLowerCase();
        
        // Check if product name or category matches any word in the query
        let score = 0;
        
        // Exact match gets highest score
        if (queryLower.includes(itemLower) || itemLower.includes(queryLower)) {
            score += 10;
        }
        
        // Word-by-word matching
        for (const word of words) {
            if (itemLower.includes(word)) {
                score += 5;
            }
            if (categoryLower.includes(word)) {
                score += 2;
            }
        }
        
        // Specific product categories
        if (/\boils?\b/.test(queryLower) && /oil/.test(itemLower)) {
            score += 8;
        }
        if (/\bcheese/.test(queryLower) && /cheese/.test(itemLower)) {
            score += 8;
        }
        if (/\bmilk/.test(queryLower) && /milk/.test(itemLower)) {
            score += 8;
        }
        if (/\beggs?\b/.test(queryLower) && /egg/.test(itemLower)) {
            score += 8;
        }
        if (/\b(meat|chicken|beef|pork|fish)/.test(queryLower) && /(meat|chicken|beef|pork|fish|salmon|tuna)/i.test(itemLower)) {
            score += 8;
        }
        
        if (score > 0) {
            results.push({ ...product, _score: score });
        }
    }
    
    // Sort by score (highest first) and return top matches
    results.sort((a, b) => b._score - a._score);
    
    // Return top 10 results, or all if less than 10
    return results.slice(0, 10).map(p => ({
        category: p.category,
        item: p.item,
        price: p.price
    }));
}

// Backward-compatible simple suggestion API for tests
function suggestRecipes(query, data, count = 3) {
    try {
        const suggestions = findRecipesForOccasion(
            query,
            Array.isArray(data.recipes) ? data.recipes : [],
            new Set(),
            [],
            { treatAsMore: false, queryForScoring: query }
        ).slice(0, count);
        return { reply: '', recipes: suggestions };
    } catch (e) {
        return { reply: '', recipes: [] };
    }
}

module.exports = { processMessage, suggestRecipes };

// ============================================================
// CONTEXT + FOLLOW-UP UTILITIES FOR PRODUCTS
// ============================================================

function buildLLMUserMessage(message, context, productSearchResults = []) {
    const parts = [];
    // Short memory: last product query topic
    if (context?.lastProductQuery) {
        parts.push(`Previous product topic: ${context.lastProductQuery}`);
    }
    // Preferences gleaned from conversation
    try {
        const conv = analyzeConversationContext(context);
        const prefs = [];
        if (conv?.wantsBudget) prefs.push('budget-friendly');
        if (conv?.wantsHealthy) prefs.push('healthy');
        if (conv?.wantsQuick) prefs.push('quick');
        if (conv?.dietaryRestrictions?.length) prefs.push(`diet: ${conv.dietaryRestrictions.join(', ')}`);
        if (prefs.length) parts.push(`User preferences so far: ${prefs.join('; ')}`);
    } catch {}

    if (parts.length > 0) {
        return `${message}\n\nContext: ${parts.join(' | ')}`;
    }
    return message;
}

function detectProductFollowUp(message) {
    const text = (message || '').toLowerCase();
    const info = { isFollowUp: false, intent: null, priceUnder: NaN };

    if (/\bcheapest\b|\blower(?:est)?\s+price\b/.test(text)) {
        info.isFollowUp = true; info.intent = 'cheapest';
    } else if (/\b(most\s+expensive|priciest|highest\s+price)\b/.test(text)) {
        info.isFollowUp = true; info.intent = 'expensive';
    }

    const underMatch = text.match(/\bunder\s*\$?\s*(\d+(?:\.\d{1,2})?)\b/);
    if (underMatch) {
        info.isFollowUp = true; info.priceUnder = parseFloat(underMatch[1]);
    }

    // Pronouns indicating reference to prior list
    if (!info.isFollowUp && /\b(these|those|them|the\s+ones|any\s+of\s+them)\b/.test(text)) {
        info.isFollowUp = true;
    }
    return info;
}

