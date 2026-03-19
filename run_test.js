const fs = require('fs');

// We need the latest execAnalysis code from analyzer.js
const analyzerContent = fs.readFileSync('analyzer.js', 'utf8');

try {
    eval(analyzerContent);
    const userSnippet = fs.readFileSync('user_snippet.txt', 'utf8');
    console.log(execAnalysis(userSnippet));
} catch (e) {
    console.error('Error running analyzer logic:', e);
}
