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

function loadData(dataDir) {
  debug('Loading data from directory:', dataDir);
  
  const groceryPath = path.join(dataDir, 'Sample_Grocery_Data.csv');
  const recipesPath = path.join(dataDir, 'Sample_Recipes_Data.csv');
  
  debug('Reading grocery data from:', groceryPath);
  debug('Reading recipes data from:', recipesPath);
  
  const productsRaw = loadCSV(groceryPath);
  debug('Loaded products:', productsRaw.length);
  
  const recipesRaw = loadCSV(recipesPath);
  debug('Loaded recipes:', recipesRaw.length);

  const products = productsRaw.map(r => ({
    category: r['Category'] || r['category'] || '',
    item: r['Item'] || r['item'] || '',
    price: parseFloat((r['Price ($)'] || r['Price'] || r['price'] || '0')) || 0,
    _normalized: normalizeName(r['Item'] || r['item'])
  }));

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
