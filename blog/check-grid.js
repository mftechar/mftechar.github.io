const fs = require('fs');
const h = fs.readFileSync('index.html', 'utf8');
const i = h.indexOf('article-grid');
console.log(h.slice(i, i + 800));
