const { chatWithOllama, suggestWithOllama } = require('./ollamaService');

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
        return (recipes || []).map(r => ({
            ...r,
            ingredients: (r.ingredients || []).map(ing => {
                const ingName = (ing?.name || ing || '').toString();
                const matches = prods.filter(p => (p.item || '').toLowerCase().includes(ingName.toLowerCase()));
                return {
                    name: ingName,
                    found: matches.length > 0,
                    products: matches.slice(0, 1)
                };
            })
        }));
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
        // OPTION A: LLM-FIRST ARCHITECTURE
        // Let the AI understand intent naturally, then decide if we need recipe cards
        // ============================================================

        // 1. Special case: Shopping list actions (explicit add commands)
        const isShoppingAction = /add( to)? shopping|add( to)? list|shopping list|cart|buy|purchase|add ingredients/i.test(message);
        
        if (isShoppingAction) {
            // Extract ingredients from the message
            const ingredientTexts = parseIngredientsFromText(message, data.products);
            const ingredients = ingredientTexts.map(name => ({ name }));

            // Add to shopping list (upsert)
            const updatedShoppingList = mergeRecipeHistory(context.seenRecipes, ingredients);

            // Update context
            context.seenRecipes = new Set(updatedShoppingList.map(i => i.name));
            context.messages.push({ from: 'bot', text: `I've added those ingredients to your shopping list!` });
            
            return { reply: `I've added those ingredients to your shopping list!`, recipes: [], context };
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

        // 3. Let the LLM handle the conversation naturally FIRST
        debug('Consulting LLM for natural response...');
        let llmResponse;
        try {
            llmResponse = await chatWithOllama(
                message,
                context.messages.slice(0, -1), // Don't duplicate the message we just added
                [],
                []
            );
        } catch (error) {
            warn('LLM consultation failed:', error.message);
            llmResponse = "I'm having a bit of trouble thinking right now. Could you try again?";
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
            
            // Not a selection - generate recipe cards via structured LLM call
            const isMore = /^(more|show me more|give me more)$/i.test(message.trim());
            const userQuery = isMore ? (context.lastNonMoreQuery || message) : message;

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

            // Detect themed/creative requests (halloween, christmas, spooky, romantic, party-themed, etc.)
            const isThemedRequest = /(halloween|christmas|thanksgiving|easter|valentine|romantic|spooky|scary|festive|party|celebration|birthday|anniversary|themed|creative|fancy|gourmet|fusion|unique|unusual|weird|fun)\s+(recipe|dish|meal|food|idea)/i.test(userQuery) ||
                                    /(recipe|dish|meal|food|idea)\s+(for|themed|style)\s+(halloween|christmas|thanksgiving|easter|valentine|party|celebration|birthday|anniversary)/i.test(userQuery);

            // Detect grounded mode (user wants only in-catalog ingredients)
            const groundedMode = /(only\s+(use\s+)?(store|catalog|available|in\s+stock|my\s+list|product)s?)|(use\s+only\s+(what|ingredients)\s+(i\s+have|we\s+carry))|\bgrounded\b|\bonly\s+from\s+(the\s+)?catalog\b/i.test(userQuery);

            let llmResultJson = null;
            try {
                // For "More" requests, explicitly ask for DIFFERENT recipes
                let promptMessage = isMore 
                    ? `${userQuery}\n\nIMPORTANT: I've already seen these recipes, so please suggest COMPLETELY DIFFERENT ones: ${Array.from(context.seenRecipes || []).join(', ')}`
                    : userQuery;
                
                // Add explicit count instruction if user specified a number
                if (requestedCount && requestedCount !== 3) {
                    promptMessage = `${promptMessage}\n\nIMPORTANT: Generate exactly ${requestedCount} ${requestedCount === 1 ? 'recipe' : 'recipes'}.`;
                }
                    
                llmResultJson = await suggestWithOllama({
                    message: promptMessage,
                    context: context.messages,
                    recipeCatalog: Array.isArray(data.recipes) ? data.recipes : [],
                    productList: Array.isArray(data.products) ? data.products : [],
                    avoidNames: [], // Don't pass avoidNames, we're handling it in the prompt
                    groundedMode,
                    requestedCount // Pass the count to LLM
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
            const enriched = enrichRecipesWithProducts(limited, data.products || []);

            // Update context and reply
            const names = enriched.map(r => r.name).filter(Boolean);
            names.forEach(n => context.seenRecipes.add(n));
            context.allSuggestedRecipes = mergeRecipeHistory(context.allSuggestedRecipes, enriched);
            if (!isMore) context.lastNonMoreQuery = userQuery;

            // Use the structured reply from JSON generation, or the initial LLM response if it mentioned recipes
            // But if the LLM response contains JSON artifacts (curly braces), prefer a clean generated reply
            let finalReply = (structuredReply && structuredReply.trim()) 
                ? structuredReply 
                : (llmReplyText && llmReplyText.trim() && !llmHasJsonArtifacts
                    ? llmReplyText 
                    : buildReplyFromSuggestions(userQuery, enriched, context, { isMore, exhausted: enriched.length === 0 }));
            
            // Append reasoning if available
            if (reasoning && reasoning.trim()) {
                finalReply = `${finalReply}\n\n💡 ${reasoning.trim()}`;
            }

            context.messages.push({ from: 'bot', text: finalReply });
            return { reply: finalReply, recipes: enriched, context };
        }
        
        // 5. No recipe cards needed - however, if the conversational reply contained a recipe-like JSON,
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

