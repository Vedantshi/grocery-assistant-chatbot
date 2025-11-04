// Utilities for parsing and enforcing budget caps on recipes

function parseBudgetCap(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();
  // Patterns: under $20, less than 20, below 20 dollars, max 20, $20 or less, budget 20
  const patterns = [
    /under\s*\$?\s*(\d+(?:\.\d{1,2})?)/,
    /less\s*than\s*\$?\s*(\d+(?:\.\d{1,2})?)/,
    /below\s*\$?\s*(\d+(?:\.\d{1,2})?)/,
    /max(?:imum)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/,
    /\$\s*(\d+(?:\.\d{1,2})?)\s*(?:or\s*less|and\s*under)/,
    /budget\s*(?:of\s*)?\$?\s*(\d+(?:\.\d{1,2})?)/,
    /(?:relax|expand|raise|increase|up\s*to|to)\s*\$?\s*(\d+(?:\.\d{1,2})?)/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return parseFloat(m[1]);
  }
  return null;
}

function estimateRecipeCost(recipe) {
  if (!recipe) return NaN;
  // Prefer explicit totalPrice if present
  const tp = Number(recipe.totalPrice);
  if (Number.isFinite(tp) && tp >= 0) return tp;
  try {
    const sum = (recipe.ingredients || []).reduce((acc, ing) => {
      const price = Number(ing?.price ?? ing?.products?.[0]?.price);
      return acc + (Number.isFinite(price) ? price : 0);
    }, 0);
    return sum;
  } catch {
    return NaN;
  }
}

function filterRecipesByBudget(recipes, budget) {
  if (!Array.isArray(recipes) || !Number.isFinite(budget)) return [];
  // Strict: cost must be <= budget (no automatic buffer)
  return recipes.filter(r => {
    const cost = estimateRecipeCost(r);
    return Number.isFinite(cost) && cost <= budget + 1e-9; // tiny epsilon for float math
  });
}

function sortByCheapest(recipes) {
  return (recipes || []).slice().sort((a, b) => {
    const ca = estimateRecipeCost(a);
    const cb = estimateRecipeCost(b);
    if (!Number.isFinite(ca) && !Number.isFinite(cb)) return 0;
    if (!Number.isFinite(ca)) return 1;
    if (!Number.isFinite(cb)) return -1;
    return ca - cb;
  });
}

module.exports = { parseBudgetCap, estimateRecipeCost, filterRecipesByBudget, sortByCheapest };
