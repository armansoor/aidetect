const fs = require('fs');

// We need the latest execAnalysis code from index.html
const htmlContent = fs.readFileSync('index.html', 'utf8');
const scriptMatch = htmlContent.match(/function execAnalysis\(code\) \{[\s\S]*?return \{ score, flags, models: Array\.from\(detected\) \};\n        \}/);

if (scriptMatch) {
    const getEntropyMatch = htmlContent.match(/function getEntropy[\s\S]*?return ent;\n        \}/);
    const getWordEntropyMatch = htmlContent.match(/function getWordEntropy[\s\S]*?return ent;\n        \}/);
    const getBurstMatch = htmlContent.match(/function getBurst[\s\S]*?return \{ dev, cv: mean > 0 \? dev \/ mean : 0 \};\n        \}/);

    eval(getEntropyMatch[0]);
    eval(getWordEntropyMatch[0]);
    eval(getBurstMatch[0]);
    eval(scriptMatch[0]);

    const userSnippet = fs.readFileSync('user_snippet.txt', 'utf8');
    console.log(execAnalysis(userSnippet));
} else {
    console.error('Could not find execAnalysis in index.html');
}
