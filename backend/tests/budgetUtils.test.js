const { parseBudgetCap, estimateRecipeCost, filterRecipesByBudget, sortByCheapest } = require('../src/budgetUtils');

describe('budgetUtils', () => {
  test('parseBudgetCap recognizes common phrases', () => {
    expect(parseBudgetCap('under $20')).toBe(20);
    expect(parseBudgetCap('less than 15 dollars')).toBe(15);
    expect(parseBudgetCap('below 12')).toBe(12);
    expect(parseBudgetCap('max 8.50')).toBeCloseTo(8.5);
    expect(parseBudgetCap('$10 or less')).toBe(10);
    expect(parseBudgetCap('budget 25')).toBe(25);
    expect(parseBudgetCap('no budget here')).toBeNull();
  });

  test('estimateRecipeCost sums ingredient product prices', () => {
    const recipe = {
      ingredients: [
        { products: [{ price: 3.5 }] },
        { products: [{ price: 2 }] },
        { products: [{ price: 4.25 }] }
      ]
    };
    expect(estimateRecipeCost(recipe)).toBeCloseTo(9.75);
  });

  test('filterRecipesByBudget strictly enforces cap', () => {
    const recipes = [
      { name: 'A', ingredients: [{ products: [{ price: 10 }] }] },
      { name: 'B', ingredients: [{ products: [{ price: 8 }] }] },
      { name: 'C', ingredients: [{ products: [{ price: 12.01 }] }] },
    ];
    const filtered = filterRecipesByBudget(recipes, 10);
    const names = filtered.map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['A', 'B']));
    expect(names).not.toEqual(expect.arrayContaining(['C']));
  });

  test('sortByCheapest orders by estimated cost', () => {
    const recipes = [
      { name: 'A', ingredients: [{ products: [{ price: 5 }] }] },
      { name: 'B', ingredients: [{ products: [{ price: 2 }] }] },
      { name: 'C', ingredients: [{ products: [{ price: 8 }] }] },
    ];
    const sorted = sortByCheapest(recipes);
    expect(sorted.map(r => r.name)).toEqual(['B','A','C']);
  });
});
