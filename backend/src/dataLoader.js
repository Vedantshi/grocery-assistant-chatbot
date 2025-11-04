const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Debug helper (disabled unless DEBUG=1 or NODE_ENV=development)
const DEBUG = process.env.DEBUG === '1' || process.env.NODE_ENV === 'development';
const debug = (...args) => { if (DEBUG) console.log(...args); };

function normalizeName(s) {
  if (!s) return '';
  return s.toString().trim().toLowerCase();
}

function tryParseIngredients(raw) {
  if (!raw) return [];
  // many rows use Python-style lists with single quotes; try to convert
  try {
    const jsonLike = raw.replace(/'/g, '"');
    const parsed = JSON.parse(jsonLike);
    if (Array.isArray(parsed)) return parsed.map(p => p.toString().trim());
  } catch (e) {
    // fallback: comma split
    return raw.split(',').map(p => p.replace(/\[|\]|"|'/g, '').trim()).filter(Boolean);
  }
  return [];
}

function loadCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true });
}

function fileIfExists(p){ try { return fs.existsSync(p) ? p : null; } catch { return null; } }

function chooseProductsCsv(dataDir){
  // Priority order:
  // 1) env PRODUCTS_CSV (absolute or relative to project root)
  // 2) Synthetic_Grocery_Dataset.csv in project root
  // 3) Synthetic_Grocery_Dataset.csv inside provided dataDir
  // 4) Sample_Grocery_Data.csv inside provided dataDir (fallback)
  const envPath = process.env.PRODUCTS_CSV;
  if (envPath){
    const p = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    const found = fileIfExists(p);
    if (found) return found;
  }
  const rootSynthetic = path.resolve(__dirname, '..', '..', 'Synthetic_Grocery_Dataset.csv');
  const cwdParentSynthetic = path.resolve(process.cwd(), '..', 'Synthetic_Grocery_Dataset.csv');
  const dataDirSynthetic = path.join(dataDir, 'Synthetic_Grocery_Dataset.csv');
  const dataDirSample = path.join(dataDir, 'Sample_Grocery_Data.csv');
  // Prefer the file colocated with other data files inside backend/data first
  const chosen = fileIfExists(dataDirSynthetic) || fileIfExists(rootSynthetic) || fileIfExists(cwdParentSynthetic) || dataDirSample;
  debug('Products CSV candidates:', { envPath, dataDirSynthetic, rootSynthetic, cwdParentSynthetic, dataDirSample, chosen });
  return chosen;
}

function loadData(dataDir) {
  debug('Loading data from directory:', dataDir);
  
  const groceryPath = chooseProductsCsv(dataDir);
  const recipesPath = path.join(dataDir, 'Sample_Recipes_Data.csv');
  
  debug('Reading grocery data from:', groceryPath);
  debug('Reading recipes data from:', recipesPath);
  
  const productsRaw = loadCSV(groceryPath);
  debug('Loaded products:', productsRaw.length);
  
  const recipesRaw = loadCSV(recipesPath);
  debug('Loaded recipes:', recipesRaw.length);

  const products = productsRaw.map(r => {
    // Support both sample schema and synthetic schema
    const item = r['Item'] || r['item'] || r['item_name'] || '';
    const category = r['Category'] || r['category'] || '';
    const priceRaw = r['Price ($)'] || r['Price'] || r['price'] || '0';
    const price = parseFloat(priceRaw) || 0;
    const unit = r['unit'] || r['Unit'] || r['unit_of_measure'] || '';
    const nutrition = {
      calories: parseFloat(r['calories'] ?? r['Calories'] ?? '') || 0,
      protein_g: parseFloat(r['protein_g'] ?? r['Protein_g'] ?? r['protein'] ?? '') || 0,
      carbs_g: parseFloat(r['carbs_g'] ?? r['Carbs_g'] ?? r['carbohydrates'] ?? '') || 0,
      fat_g: parseFloat(r['fat_g'] ?? r['Fat_g'] ?? r['fat'] ?? '') || 0,
      fiber_g: parseFloat(r['fiber_g'] ?? r['Fiber_g'] ?? r['fiber'] ?? '') || 0,
    };
    return {
      category,
      item,
      price,
      unit,
      nutrition,
      _normalized: normalizeName(item)
    };
  });

  debug('Processed products sample:', products.slice(0, 2));

  const recipes = recipesRaw.map(r => ({
    name: r['Recipe'] || r['recipe'] || '',
    ingredients: tryParseIngredients(r['Ingredients'] || r['ingredients']).map(i => ({
      name: i,
      _normalized: normalizeName(i)
    })),
    steps: r['Steps'] || r['steps'] || ''
  }));

  debug('Processed recipes sample:', recipes.slice(0, 2));

  return { products, recipes };
}

module.exports = { loadData, normalizeName };
