const path = require('path');
const { loadData } = require('../src/dataLoader');
const { suggestRecipes } = require('../src/chatLogic');

test('load data and basic suggestion', () => {
  const data = loadData(path.join(__dirname, '..', 'data'));
  expect(data.products.length).toBeGreaterThan(0);
  expect(data.recipes.length).toBeGreaterThan(0);
  const res = suggestRecipes('quick dinner', data, 3);
  expect(res.recipes).toBeDefined();
});
