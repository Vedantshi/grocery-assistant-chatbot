const path = require('path');
const { loadData } = require('./src/dataLoader');
const { processMessage } = require('./src/chatLogic');

const data = loadData(path.join(__dirname, 'data'));

console.log('--- First 5 products ---');
console.log(JSON.stringify(data.products.slice(0, 5), null, 2));

const session = { seen: [] };
const query = 'quick dinner';
const res1 = processMessage(query, data, session);
console.log('\n--- Chat suggestion for:', query, '---');
console.log(JSON.stringify(res1, null, 2));

// request more
const res2 = processMessage('more', data, session);
console.log('\n--- More suggestions ---');
console.log(JSON.stringify(res2, null, 2));
