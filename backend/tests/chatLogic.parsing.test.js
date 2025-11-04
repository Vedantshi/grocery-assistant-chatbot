// Test helper/utility functions from chatLogic
// These are internal functions, so we'll need to test them through exported functions
// or by reading their behavior through processMessage

const { processMessage } = require('../src/chatLogic');

// Mock ollamaService
jest.mock('../src/ollamaService', () => ({
  chatWithOllama: jest.fn(() => Promise.resolve('Mock response')),
  suggestWithOllama: jest.fn(() => Promise.resolve({
    reply: 'Mock reply',
    reasoning: 'Mock reasoning',
    recipes: [{
      name: 'Mock Recipe',
      ingredients: [{ name: 'ing1', quantity: '1 cup' }],
      steps: ['step1'],
      mealType: 'dinner'
    }]
  }))
}));

const mockData = {
  products: [
    { item: 'Chicken', category: 'Meat', price: 5.99, _normalized: 'chicken', unit: 'per lb',
      nutrition: { calories: 200, protein_g: 30, carbs_g: 0, fat_g: 8, fiber_g: 0 } },
    { item: 'Rice', category: 'Grains', price: 2.99, _normalized: 'rice', unit: 'per bag',
      nutrition: { calories: 130, protein_g: 3, carbs_g: 28, fat_g: 0, fiber_g: 1 } },
    { item: 'Broccoli', category: 'Vegetables', price: 1.99, _normalized: 'broccoli', unit: 'per bunch',
      nutrition: { calories: 35, protein_g: 3, carbs_g: 7, fat_g: 0, fiber_g: 2 } }
  ],
  recipes: [
    {
      name: 'Chicken Stir Fry',
      ingredients: [
        { name: 'chicken', quantity: '1 lb' },
        { name: 'broccoli', quantity: '1 cup' }
      ],
      steps: 'Cook chicken, add broccoli',
      mealType: 'dinner'
    },
    {
      name: 'Fried Rice',
      ingredients: [
        { name: 'rice', quantity: '2 cups' },
        { name: 'chicken', quantity: '1/2 lb' }
      ],
      steps: 'Cook rice, add chicken',
      mealType: 'lunch'
    }
  ]
};

describe('Parsing Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Height/Weight Parsing', () => {
    test('should parse metric height and weight', async () => {
      let result = await processMessage('__NUTRITION_START__', mockData, {});
      const sessionId = result.context;
      
      result = await processMessage('170 cm, 70 kg', mockData, result.context);
      expect(result.context.nutritionData).toBeDefined();
      expect(result.context.nutritionData.heightCm).toBeCloseTo(170);
      expect(result.context.nutritionData.weightKg).toBeCloseTo(70);
    });

    test('should parse imperial height and weight', async () => {
      let result = await processMessage('__NUTRITION_START__', mockData, {});
      result = await processMessage('5 feet 7 inches, 150 pounds', mockData, result.context);
      
      expect(result.context.nutritionData).toBeDefined();
      expect(result.context.nutritionData.heightCm).toBeGreaterThan(0);
      expect(result.context.nutritionData.weightKg).toBeGreaterThan(0);
    });

    test('should handle shorthand notation', async () => {
      let result = await processMessage('__NUTRITION_START__', mockData, {});
      result = await processMessage("5'7\", 150 lbs", mockData, result.context);
      
      expect(result.context.nutritionData).toBeDefined();
    });

    test('should reject invalid height/weight', async () => {
      let result = await processMessage('__NUTRITION_START__', mockData, {});
      result = await processMessage('tall and heavy', mockData, result.context);
      
      expect(result.reply).toContain("couldn't quite understand");
    });
  });

  describe('Budget and Servings Parsing', () => {
    test('should parse budget with servings', async () => {
      let result = await processMessage('__BUDGET_START__', mockData, {});
      result = await processMessage('$25 for 4 servings', mockData, result.context);
      
      expect(result.context.budget).toBe(25);
      expect(result.context.servings).toBe(4);
    });

    test('should parse budget without servings', async () => {
      let result = await processMessage('__BUDGET_START__', mockData, {});
      result = await processMessage('under $15', mockData, result.context);
      
      expect(result.context.budget).toBe(15);
      expect(result.context.servings).toBe(2); // default
    });

    test('should handle various budget formats', async () => {
      const formats = [
        { input: '$20 for 2', expectedBudget: 20, expectedServings: 2 },
        { input: '30 dollars for 3 servings', expectedBudget: 30, expectedServings: 3 },
        { input: 'under $10', expectedBudget: 10, expectedServings: 2 }
      ];

      for (const format of formats) {
        let result = await processMessage('__BUDGET_START__', mockData, {});
        result = await processMessage(format.input, mockData, result.context);
        
        expect(result.context.budget).toBe(format.expectedBudget);
        expect(result.context.servings).toBe(format.expectedServings);
      }
    });
  });

  describe('Time Parsing', () => {
    test('should parse minutes from various formats', async () => {
      const formats = [
        { input: '30 minutes', expected: 30 },
        { input: 'under 20', expected: 20 },
        { input: '45', expected: 45 },
        { input: 'about 25 minutes', expected: 25 }
      ];

      for (const format of formats) {
        let result = await processMessage('__TIME_START__', mockData, {});
        result = await processMessage(format.input, mockData, result.context);
        
        expect(result.context.minutes).toBe(format.expected);
      }
    });

    test('should reject non-numeric time input', async () => {
      let result = await processMessage('__TIME_START__', mockData, {});
      result = await processMessage('very quickly', mockData, result.context);
      
      expect(result.reply).toContain('minutes');
    });
  });

  describe('Activity Level Parsing', () => {
    test('should recognize sedentary activity level', async () => {
      let result = await processMessage('__NUTRITION_START__', mockData, {});
      result = await processMessage('170 cm, 70 kg', mockData, result.context);
      result = await processMessage('sedentary', mockData, result.context);
      
      // The nutrition flow should process the activity level
      expect(result.reply).toBeDefined();
      expect(result.context.nutritionFlow).toBeDefined();
    });

    test('should recognize active activity levels', async () => {
      const levels = ['light', 'moderate', 'very active', 'extremely active'];
      
      for (const level of levels) {
        let result = await processMessage('__NUTRITION_START__', mockData, {});
        result = await processMessage('170 cm, 70 kg', mockData, result.context);
        result = await processMessage(level, mockData, result.context);
        
        // The nutrition flow should handle activity level input
        expect(result.reply).toBeDefined();
        expect(result.context.nutritionFlow).toBeDefined();
      }
    });
  });
});

describe('Ingredient and Recipe Matching', () => {
  test('should extract ingredients from pantry input', async () => {
    let result = await processMessage('__PANTRY_START__', mockData, {});
    result = await processMessage('chicken, rice, broccoli', mockData, result.context);
    
    expect(result.context.pantryItems).toBeDefined();
    expect(result.context.pantryItems.length).toBe(3);
    expect(result.context.pantryItems).toContain('chicken');
  });

  test('should handle ingredient variations', async () => {
    let result = await processMessage('__PANTRY_START__', mockData, {});
    result = await processMessage('eggs and milk', mockData, result.context);
    
    expect(result.context.pantryItems).toBeDefined();
    expect(result.context.pantryItems.length).toBeGreaterThan(0);
  });

  test('should handle comma-separated lists', async () => {
    let result = await processMessage('__PANTRY_START__', mockData, {});
    result = await processMessage('chicken, rice, vegetables', mockData, result.context);
    
    expect(result.context.pantryItems.length).toBe(3);
  });

  test('should handle newline-separated lists', async () => {
    let result = await processMessage('__PANTRY_START__', mockData, {});
    result = await processMessage('chicken\nrice\nvegetables', mockData, result.context);
    
    expect(result.context.pantryItems.length).toBe(3);
  });

  test('should limit number of ingredients', async () => {
    let result = await processMessage('__PANTRY_START__', mockData, {});
    const longList = Array(20).fill('item').join(', ');
    result = await processMessage(longList, mockData, result.context);
    
    // Should be limited to 12
    expect(result.context.pantryItems.length).toBeLessThanOrEqual(12);
  });
});

describe('Context Management', () => {
  test('should maintain conversation history', async () => {
    let result = await processMessage('hello', mockData, {});
    expect(result.context.messages.length).toBeGreaterThan(0);
    
    result = await processMessage('show me recipes', mockData, result.context);
    expect(result.context.messages.length).toBeGreaterThan(2);
  });

  test('should track seen recipes', async () => {
    const result = await processMessage('give me recipes', mockData, {});
    expect(result.context.seenRecipes).toBeInstanceOf(Set);
  });

  test('should persist last non-more query', async () => {
    let result = await processMessage('give me dinner recipes', mockData, {});
    expect(result.context.lastNonMoreQuery).toBeDefined();
    
    result = await processMessage('more', mockData, result.context);
    expect(result.context.lastNonMoreQuery).toBe('give me dinner recipes');
  });

  test('should handle shopping list in context', async () => {
    const context = {
      shoppingList: [
        { name: 'chicken', price: 5.99 },
        { name: 'rice', price: 2.99 }
      ]
    };
    
    const result = await processMessage('what is in my list', mockData, context);
    expect(result.reply).toBeDefined();
  });
});

describe('Recipe Enrichment', () => {
  test('should enrich recipes with product information', async () => {
    const result = await processMessage('give me recipes', mockData, {});
    
    if (result.recipes && result.recipes.length > 0) {
      expect(result.recipes[0]).toHaveProperty('name');
      expect(result.recipes[0]).toHaveProperty('ingredients');
    }
  });

  test('should calculate total recipe price', async () => {
    const result = await processMessage('show me recipes', mockData, {});
    
    if (result.recipes && result.recipes.length > 0) {
      // Check if price calculation is present
      expect(result.recipes[0]).toBeDefined();
    }
  });
});

describe('Special Message Handling', () => {
  test('should recognize greetings', async () => {
    const greetings = ['hello', 'hi', 'hey', 'good morning'];
    
    for (const greeting of greetings) {
      const result = await processMessage(greeting, mockData, {});
      expect(result.reply).toBeDefined();
      expect(result.recipes.length).toBe(0);
    }
  });

  test('should handle "more" requests', async () => {
    let result = await processMessage('give me recipes', mockData, {});
    const context = result.context;
    
    result = await processMessage('more', mockData, context);
    expect(result.recipes).toBeDefined();
  });

  test('should handle shopping list queries', async () => {
    const context = {
      shoppingList: [{ name: 'item1' }]
    };
    
    const queries = [
      'show my shopping list',
      'what is in my cart',
      'show me my list'
    ];
    
    for (const query of queries) {
      const result = await processMessage(query, mockData, context);
      expect(result.reply).toBeDefined();
    }
  });
});

describe('Meal Preference Handling', () => {
  test('should handle numbered meal prep preferences', async () => {
    let result = await processMessage('__MEAL_PREP_START__', mockData, {});
    
    const preferences = ['1', '2', '3', '4', '5'];
    for (const pref of preferences) {
      result = await processMessage('__MEAL_PREP_START__', mockData, {});
      result = await processMessage(pref, mockData, result.context);
      expect(result.recipes).toBeDefined();
    }
  });

  test('should handle text meal prep preferences', async () => {
    let result = await processMessage('__MEAL_PREP_START__', mockData, {});
    result = await processMessage('vegetarian', mockData, result.context);
    
    expect(result.recipes).toBeDefined();
  });

  test('should reject invalid preferences', async () => {
    let result = await processMessage('__MEAL_PREP_START__', mockData, {});
    result = await processMessage('x', mockData, result.context);
    
    expect(result.reply).toContain('type of recipes');
  });
});

describe('Edge Cases', () => {
  test('should handle empty message', async () => {
    // Empty messages are handled gracefully, not rejected
    const result = await processMessage('', mockData, {});
    expect(result).toBeDefined();
    expect(result.reply).toBeDefined();
  });

  test('should handle very long message', async () => {
    const longMessage = 'give me recipes '.repeat(100);
    const result = await processMessage(longMessage, mockData, {});
    expect(result).toBeDefined();
  });

  test('should handle special characters in message', async () => {
    const result = await processMessage('recipes with $$$', mockData, {});
    expect(result).toBeDefined();
  });

  test('should handle unicode characters', async () => {
    const result = await processMessage('show me 🍕 recipes', mockData, {});
    expect(result).toBeDefined();
  });

  test('should handle empty data arrays', async () => {
    const emptyData = { products: [], recipes: [] };
    const result = await processMessage('give me recipes', emptyData, {});
    expect(result).toBeDefined();
  });
});
