const fs = require('fs');
const analyzerCode = fs.readFileSync('analyzer.js', 'utf8');
eval(analyzerCode);

const testText = "This is just some plain text that a user might enter to test the application. It shouldn't trigger the analysis because it is not code.";
console.log(isLikelyCode(testText));
