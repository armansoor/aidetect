// check if text is likely code
function isLikelyCode(text) {
    if (!text || text.trim().length === 0) return false;

    // Check for common programming symbols
    // Removed basic punctuation (. , ? !) which are common in plain text
    let codeChars = text.match(/[{}\[\]()<>;:+\-*/=&|~^%@\\]/g);
    let codeCharCount = codeChars ? codeChars.length : 0;

    // Check for common programming keywords across various languages
    let keywords = text.match(/\b(function|class|def|var|let|const|if|else|elif|return|import|from|export|public|private|protected|struct|type|interface|void|int|string|bool|boolean|char|float|double|console|print|echo|namespace|using|include|require|module|exports|await|async|yield|switch|case|break|continue|default|try|catch|finally|throw|new|this|super|extends|implements|package|html|body|div|span|href|src|php|def|pass|lambda)\b/gi);
    let keywordCount = keywords ? keywords.length : 0;

    let textLengthNoSpaces = text.replace(/\s/g, '').length;
    if (textLengthNoSpaces === 0) return false;

    // Calculate a density score.
    let density = (codeCharCount + (keywordCount * 2)) / textLengthNoSpaces;

    // If the density of code-specific elements is high enough, it's code
    return density > 0.08;
}

// math utils
function getEntropy(str) {
    let len = str.length;
    if (len === 0) return 0;
    let freq = {};
    for (let i = 0; i < len; i++) freq[str[i]] = (freq[str[i]] || 0) + 1;
    let ent = 0;
    for (let char in freq) {
        let p = freq[char] / len;
        ent -= p * Math.log2(p);
    }
    return ent;
}

function getWordEntropy(str) {
    let words = str.split(/\W+/).filter(w => w.length > 0);
    let len = words.length;
    if (len === 0) return 0;
    let freq = {};
    for (let i = 0; i < len; i++) {
        let w = words[i].toLowerCase();
        freq[w] = (freq[w] || 0) + 1;
    }
    let ent = 0;
    for (let w in freq) {
        let p = freq[w] / len;
        ent -= p * Math.log2(p);
    }
    return ent;
}

function getBurst(lines) {
    let lens = lines.map(l => l.length);
    if (lens.length < 5) return { dev: 0, cv: 0 };
    let mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    let variance = lens.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lens.length;
    let dev = Math.sqrt(variance);
    return { dev, cv: mean > 0 ? dev / mean : 0 };
}

// main analysis block
function execAnalysis(code) {
    let score = 0, flags = [], detected = new Set();
    let rawLines = code.split('\n');
    let trimmed = rawLines.map(l => l.trim());
    let lines = trimmed.filter(l => l.length > 3);
    let codeLow = code.toLowerCase();

    if (code.trim().length < 15) return { score: 0, flags: [{ level: 'info', text: "Input too short for statistical analysis." }], models: [] };

    // check for json/config weirdness
    let isConfig = /"[a-zA-Z0-9_@\/-]+"\s*:\s*["\{\[\d]/i.test(code) || /"lockfileVersion"\s*:/i.test(code);

    if (isConfig) {
        if (/"lockfileVersion"\s*:/i.test(code)) {
            if (lines.length < 1500) {
                score += 75;
                flags.push({ level: 'severe', text: "Hallucinated config: Truncated package-lock detected. Real lockfiles are massive." });
                detected.add("Workspace Generator");
            } else {
                flags.push({ level: 'good', text: "Lockfile length looks authentic." });
            }
        }
        if (/\/\/|\/\*/.test(code)) {
            score += 40;
            flags.push({ level: 'severe', text: "Invalid JSON: Comments detected inside data structure. Typical LLM behavior." });
        }
        if (/"\.\.\."\s*:/.test(code) || /:\s*"\.\.\."/.test(code) || /"rest of the file"/i.test(codeLow)) {
            score += 50;
            flags.push({ level: 'severe', text: "Truncation marker: Used '...' to skip data blocks." });
        }
        score = Math.min(100, score);
        return { score, flags, models: Array.from(detected) };
    }

    // Advanced code heuristics

    // --- Newly Added 30 Heuristics (1-10) Lexical & Syntax ---
    // 1. Leftover Prompt Text
    if (/(?:write a function|prompt:|create a script that|how do i|please provide)/i.test(codeLow)) {
        score += 50;
        flags.push({ level: 'severe', text: "Leftover prompt text detected. Strong indicator of copied AI output." });
    }

    // 2. Inline Comment Overkill (checked down in structure loop)

    // 3. Redundant Type-Checking
    let redundantTypeCheck = (code.match(/typeof\s+\w+\s*===\s*['"]\w+['"]\s*&&\s*\w+\s*!==\s*null/g) || []).length;
    if (redundantTypeCheck > 1) {
        score += 20;
        flags.push({ level: 'warning', text: "Redundant or overly explicit type checking detected. Common in AI output." });
    }

    // 4. Placeholder Values
    if (/YOUR_API_KEY_HERE|https:\/\/api\.example\.com|password123/i.test(code)) {
        score += 40;
        flags.push({ level: 'severe', text: "Textbook placeholder values detected (e.g., YOUR_API_KEY_HERE)." });
    }

    // 5. From-Scratch Implementations (e.g. custom deep clone)
    if (/function\s+deepClone/i.test(code) || /def\s+deep_clone/i.test(codeLow)) {
        score += 15;
        flags.push({ level: 'info', text: "Implementation of a standard utility from scratch (e.g., deep clone) detected." });
    }

    // 6. Defensive Programming Overkill
    let defensiveOverkill = (code.match(/if\s*\(\s*\w+\s*&&\s*Array\.isArray\(\w+\)\s*&&\s*\w+\.length\s*>\s*0/g) || []).length;
    if (defensiveOverkill > 0) {
        score += 20;
        flags.push({ level: 'warning', text: "Excessive defensive programming in a single condition." });
    }

    // 7. Perfect Symmetrical Code
    let ifCount = (code.match(/\bif\s*\(/g) || []).length;
    let elseIfCount = (code.match(/\belse if\s*\(/g) || []).length;
    let elseCount = (code.match(/\belse\s*\{/g) || []).length;
    if (ifCount > 2 && ifCount === elseIfCount && ifCount === elseCount && lines.length < 50) {
        score += 15;
        flags.push({ level: 'info', text: "Perfectly symmetrical if/else-if/else structures detected." });
    }

    // 8. Summary Comments
    if (/(?:in conclusion,|this script provides|to summarize,)/i.test(codeLow)) {
        score += 30;
        flags.push({ level: 'severe', text: "Conversational summary comment detected at the end of the script." });
    }

    // 9. Unused Complex Imports (we just check if obscure ones are present, actual unused is hard with regex)
    if (/\bimport\s+.*\b(?:crypto|hashlib|xmltodict)\b/i.test(code) && lines.length < 20) {
        score += 15;
        flags.push({ level: 'warning', text: "Obscure/complex imports detected in a very short file." });
    }

    // 10. Sequential Naming Combinations
    if (/\buserList\b.*\buserCount\b.*\bfilteredUsers\b/i.test(code) || /\bitemList\b.*\bitemCount\b/i.test(code)) {
        score += 20;
        flags.push({ level: 'warning', text: "Textbook sequential variable naming combination detected." });
    }

    // --- Newly Added 30 Heuristics (11-20) Language-Specific ---
    // 11. Python - typing Overuse
    let pythonTyping = (code.match(/from\s+typing\s+import\s+(?:List|Dict|Any|Tuple|Optional|Union)/g) || []).length;
    if (pythonTyping > 0 && lines.length < 30) {
        score += 20;
        flags.push({ level: 'warning', text: "Heavy use of Python typing module in a short script." });
    }

    // 12. JavaScript - Minified Artifacts
    if (/\bvoid 0\b/g.test(code) && lines.length > 5 && lines.length < 50) {
        score += 20;
        flags.push({ level: 'warning', text: "Use of 'void 0' (minified artifact) in non-minified modern code." });
    }

    // 13. HTML/CSS - Verbose BEM
    let bemClasses = (code.match(/class=['"][a-z0-9]+__[a-z0-9]+--[a-z0-9]+['"]/g) || []).length;
    if (bemClasses > 5 && lines.length < 40) {
        score += 15;
        flags.push({ level: 'info', text: "Verbose BEM class naming on small scale." });
    }

    // 14. SQL - Verbose Joins
    if (/\bLEFT OUTER JOIN\b/i.test(code) || /\bINNER JOIN\b/i.test(code)) {
        score += 10;
        flags.push({ level: 'info', text: "Verbose SQL joins (e.g. LEFT OUTER JOIN instead of LEFT JOIN)." });
    }

    // 15. C++ - Redundant Guards
    if (/#pragma once/i.test(code) && /#ifndef\s+\w+/i.test(code) && /#define\s+\w+/i.test(code)) {
        score += 25;
        flags.push({ level: 'warning', text: "Redundant C++ include guards (#pragma once AND #ifndef) in the same file." });
    }

    // 16. Java - Excessive Getters/Setters
    let javaGetSet = (code.match(/public\s+\w+\s+get\w+\(\)\s*\{/g) || []).length + (code.match(/public\s+void\s+set\w+\([^)]+\)\s*\{/g) || []).length;
    if (javaGetSet > 6 && lines.length < 60) {
        score += 15;
        flags.push({ level: 'info', text: "Perfect boilerplate getters/setters detected." });
    }

    // 17. React/Frontend - Hallucinated Dependencies
    let reactDeps = (code.match(/useEffect\(\s*\(\)\s*=>\s*\{.*?\},\s*\[(.*?)\]\s*\)/s) || [])[1];
    if (reactDeps && reactDeps.split(',').length > 4) {
        score += 15;
        flags.push({ level: 'warning', text: "Extremely exhaustive React useEffect dependency array." });
    }

    // 18. Python - Redundant else
    if (/(?:for|while)\s+.*:.*\n(?:.|\n)*?else:/g.test(code)) {
        score += 15;
        flags.push({ level: 'warning', text: "Use of loop 'else' construct in Python (often AI trying to be 'Pythonic')." });
    }

    // 19. Bash - Perfect Quoting
    let bashVars = (code.match(/\$[\w_]+/g) || []).length;
    let quotedBashVars = (code.match(/"\$[\w_]+"/g) || []).length;
    if (bashVars > 3 && bashVars === quotedBashVars) {
        score += 10;
        flags.push({ level: 'info', text: "Perfect bash variable quoting (no raw expansions). AI typically plays it extremely safe." });
    }

    // 20. TypeScript - any vs unknown
    let tsAny = (code.match(/:\s*any\b/g) || []).length;
    let tsUnknown = (code.match(/:\s*unknown\b/g) || []).length;
    let recordAny = (code.match(/Record<string,\s*any>/g) || []).length;
    if (recordAny > 1) {
        score += 15;
        flags.push({ level: 'warning', text: "Overuse of Record<string, any> in TypeScript instead of proper interfaces." });
    }

    // --- Newly Added 30 Heuristics (21-25) Conversational & Meta ---
    // 21. Mismatched Step Comments
    let step1 = /step 1/i.test(codeLow);
    let step3 = /step 3/i.test(codeLow);
    let step2 = /step 2/i.test(codeLow);
    if (step1 && step3 && !step2) {
        score += 30;
        flags.push({ level: 'severe', text: "Mismatched numbered steps in comments (e.g., Step 1 then Step 3)." });
    }

    // 22. Hidden Affirmations
    if (/["'](?:sure!|here is|as requested)["']/i.test(codeLow)) {
        score += 40;
        flags.push({ level: 'severe', text: "Conversational affirmation ('Sure!', 'Here is') hidden within strings." });
    }

    // 23. Exhaustive Edge-Case Testing
    if (/\b(?:test_edge_cases|edgeCaseTests)\b/i.test(code)) {
        score += 20;
        flags.push({ level: 'warning', text: "Block specifically labeled for edge-case testing at bottom of file." });
    }

    // 24. "Note:" Bullet Points
    if (/(?:\/\/|#)\s*-\s*Note:/i.test(code) || /\*\s*Note:/i.test(code)) {
        score += 20;
        flags.push({ level: 'warning', text: "Markdown-style bullet points used for 'Note:' comments." });
    }

    // 25. Absence of Profanity/Frustration
    if (/\b(?:wtf|hacky|todo:\s*fix this mess|ugly|stupid)\b/i.test(codeLow)) {
        score -= 30;
        flags.push({ level: 'good', text: "Frustration or informal colloquialisms detected. Highly indicative of human author." });
    }

    // --- Newly Added 30 Heuristics (26-30) Mathematical & Statistical ---
    // 26. Cyclomatic Complexity vs Line Count
    let logicalOps = (code.match(/&&|\|\|/g) || []).length;
    let loops = (code.match(/\b(?:for|while)\b/g) || []).length;
    let branches = ifCount + elseIfCount;
    let cyclo = logicalOps + loops + branches + 1;
    if (cyclo > 10 && lines.length < 20) {
        score += 25;
        flags.push({ level: 'warning', text: "Extremely high cyclomatic complexity for a short script." });
    }

    // 28. Whitespace Entropy
    let mixTabsSpaces = (code.match(/^\t+/gm) && code.match(/^ +/gm));
    if (mixTabsSpaces) {
        score -= 15;
        flags.push({ level: 'good', text: "Mixed tabs and spaces detected. Suggests manual/inconsistent formatting." });
    }

    // 29. Variable Name Length Variance
    let varNames = (code.match(/\b(?:let|const|var|def)\s+([a-zA-Z_]\w*)/g) || []).map(v => v.split(/\s+/)[1]);
    if (varNames.length > 4) {
        let lens = varNames.map(v => v ? v.length : 0);
        let mean = lens.reduce((a,b)=>a+b,0)/lens.length;
        let vVar = lens.reduce((a,b)=>a+Math.pow(b-mean,2),0)/lens.length;
        let dev = Math.sqrt(vVar);
        if (dev < 1.5) {
             score += 15;
             flags.push({ level: 'info', text: "Extremely low variance in variable name lengths (uniform descriptiveness)." });
        }
    }

    // 30. Logical Operator Density
    if (logicalOps > 5 && lines.length < 15) {
        score += 20;
        flags.push({ level: 'warning', text: "High density of logical operators (&&, ||) in a short script." });
    }

    // New Heuristic 12: The "Apology" Leak
    if (/\b(sorry for the confusion|my apologies, here is|apologies for the oversight)\b/i.test(codeLow)) {
        score += 80;
        flags.push({ level: 'severe', text: "Apology conversational leakage detected. Strong AI indicator." });
        detected.add("ChatGPT / Claude");
    }

    // New Heuristic 13: The "Explanation" Leak
    if (/^(?:\/\/|#|--)\s*(let's break this down|explanation:|here is how it works:)/mi.test(code)) {
        score += 60;
        flags.push({ level: 'severe', text: "Conversational explanation leakage in comments detected." });
    }

    // New Heuristic 14: Dependencies warning
    if (/^(?:\/\/|#|--)\s*(requires?:?\s*(npm|pip|yarn)\s+install|make sure to run:?\s*(npm|pip|yarn))/mi.test(code)) {
        score += 50;
        flags.push({ level: 'severe', text: "Inline instructions to install dependencies detected. Typical AI generation behavior." });
    }

    // New Heuristic 17: Snippet Wrappers
    if (/^(?:\/\/|#|--)\s*(example usage:|--- begin snippet ---|--- end snippet ---)/mi.test(code)) {
        score += 40;
        flags.push({ level: 'severe', text: "Snippet/Example wrapper comments detected. Common in AI output." });
    }

    // New Heuristic 3: "As an AI" specific leaks
    if (/as an ai language model|i cannot execute code|i don't have access to/i.test(codeLow)) {
        score += 90;
        flags.push({ level: 'severe', text: "Explicit 'As an AI' disclaimer leakage detected." });
        detected.add("Generic LLM");
    }

    // 1. Comments & Structure
    let cCount = 0, tCount = 0;
    let tutorialComments = 0;
    let boilerplateComments = 0;
    let jsDocComments = 0;
    for (let l of trimmed) {
        if (l.startsWith('//') || l.startsWith('#') || l.startsWith('/*') || l.startsWith('*') || l.startsWith('<!--')) {
            cCount++;
            let lLow = l.toLowerCase();
            if (/step \d|note:|important:|todo|here we|this function|helper function|add your code here/i.test(lLow)) {
                tutorialComments++;
            }
            if (/^(?:\/\/|#|\/\*)\s*-{3,}\s*[A-Z\s&]+-{3,}\s*$/.test(l)) {
                boilerplateComments++;
            }
            if (l.startsWith('* @param') || l.startsWith('* @returns') || l.startsWith('* @type')) {
                jsDocComments++;
            }
        }
        tCount++;
    }
    if (tCount > 0 && cCount / tCount > 0.15) {
        score += 25;
        flags.push({ level: 'warning', text: "High comment density detected. Often seen in generated or tutorial code." });
    }

    // 2. Inline Comment Overkill (from the 30 new rules)
    if (tCount > 0 && cCount / tCount > 0.5 && lines.length > 10) {
        score += 30;
        flags.push({ level: 'severe', text: "Extreme comment density (almost every line commented). Classic AI over-explanation." });
    }
    if (tutorialComments > 1) {
        score += 30;
        flags.push({ level: 'severe', text: "Tutorial-style commentary ('Step 1', 'Note:', 'Here we...'). Classic LLM output." });
        detected.add("GPT-4");
    }

    // New Heuristic 5: Exhaustive Javadoc/Doxygen for trivial methods
    let exhaustiveDocs = (code.match(/\/\*\*[\s\S]*?@param[\s\S]*?@return[\s\S]*?\*\/\s*(?:public|private|protected)?\s*\w+\s+\w+\s*\(/g) || []).length;
    if (exhaustiveDocs > 2 && lines.length < 100) {
        score += 30;
        flags.push({ level: 'warning', text: "High density of exhaustive Javadoc/Doxygen comments on methods. AI often over-documents." });
    }
    if (boilerplateComments > 1) {
        score += 40;
        flags.push({ level: 'severe', text: "Highly structured or conversational boilerplate comments detected. Classic LLM output." });
    }
    if (jsDocComments > 3 && lines.length < 50) {
        score += 20;
        flags.push({ level: 'warning', text: "High density of formal JSDoc/docstrings in a very short script. Often over-explained by AI." });
    }

    // 2. Burstiness / Line length variance
    let burst = getBurst(lines);
    if (burst.cv < 0.25 && lines.length > 10) {
        score += 20;
        flags.push({ level: 'warning', text: "Low line length variance. AI-generated code tends to be very uniform in structure." });
    } else if (burst.cv > 0.5 && lines.length > 10) {
        score -= 10;
        flags.push({ level: 'good', text: "High line length variance. Typical of human formatting." });
    }

    // 3. Entropy (Word/Token level is more accurate for code)
    let charEnt = getEntropy(code);
    let wordEnt = getWordEntropy(code);

    if (wordEnt < 4.0 && lines.length > 15) {
        score += 15;
        flags.push({ level: 'info', text: "Low lexical entropy. Very repetitive vocabulary, typical of AI boilerplate." });
    } else if (wordEnt > 6.0 && charEnt > 4.5) {
        score -= 10;
        flags.push({ level: 'good', text: "High entropy and vocabulary mix. Suggests human variability and custom naming." });
    }

    // 4. Boilerplate / Generic Naming / AI Fingerprints

    // New Heuristic 20: Alphabetical sorting (simple heuristic looking for 4+ sorted consecutive lines of imports or dict keys)
    let sortedLinesMatch = 0;
    for (let i = 0; i < lines.length - 3; i++) {
        if (lines[i].startsWith('import ') && lines[i+1].startsWith('import ') && lines[i+2].startsWith('import ') && lines[i+3].startsWith('import ')) {
            if (lines[i] < lines[i+1] && lines[i+1] < lines[i+2] && lines[i+2] < lines[i+3]) {
                sortedLinesMatch++;
            }
        }
    }
    if (sortedLinesMatch > 0) {
        score += 10;
        flags.push({ level: 'info', text: "Perfectly sorted import blocks detected. AI tends to generate sorted lists." });
    }

    let genericVars = (code.match(/\b(foo|bar|baz|result|temp|data|val|item|element|obj)\b/gi) || []).length;
    let boilerplateFuncs = (code.match(/\b(handle[A-Z]|setup[A-Z]|init[A-Z]|load[A-Z]|fetch[A-Z])/g) || []).length;
    if (genericVars > 5 && lines.length < 50) {
        score += 20;
        flags.push({ level: 'warning', text: "High frequency of generic variable names (temp, data, result, etc.)." });
    }
    if (boilerplateFuncs > 3 && lines.length < 50) {
        score += 20;
        flags.push({ level: 'warning', text: "High frequency of generic or boilerplate function prefixes (handle*, setup*, etc.)." });
    }

    if (/\b(certainly|here is|as an ai|i can help|as requested|based on your request|here's the updated code)\b/i.test(codeLow)) {
        score += 80;
        flags.push({ level: 'severe', text: "Direct LLM conversational leakage detected." });
        detected.add("Claude 3");
    }

    let markdownBlocks = (code.match(/```[a-z]*\n?/g) || []).length;
    if (markdownBlocks > 0) {
        score += 40;
        flags.push({ level: 'severe', text: "Markdown code block ticks detected inside source. Artifact of copy-pasting from an LLM UI." });
    }

    // New Heuristic 19: Excessive try-catch blocks logging politely
    let politeCatch = (code.match(/catch\s*\(.*?\)\s*\{\s*(console\.error|print|logger\.\w+)\(["'](failed to|an error occurred while|apologies,).*?["']/gi) || []).length;
    if (politeCatch > 0) {
        score += 35;
        flags.push({ level: 'severe', text: "Polite/Over-descriptive error logging in catch blocks detected." });
    }

    // 5. Over-engineering (High try-catch or import ratio to actual code)
    let tryCatchCount = (code.match(/\btry\s*\{/g) || []).length;
    let importCount = (code.match(/\b(import|require|include)\b/g) || []).length;

    if (tryCatchCount > 3 && lines.length < 30) {
        score += 15;
        flags.push({ level: 'warning', text: "Unusually high density of try/catch blocks for the script size. AI often over-engineers error handling." });
    }
    if (importCount > 8 && lines.length < 40) {
        score += 15;
        flags.push({ level: 'warning', text: "Excessive imports for a small file size." });
    }

    let optChainCount = (code.match(/\?\./g) || []).length;
    let nullCoalesceCount = (code.match(/\?\?/g) || []).length;
    let awaitCount = (code.match(/\bawait\s+/g) || []).length;

    if ((optChainCount > 4 || nullCoalesceCount > 4) && lines.length < 50) {
        score += 20;
        flags.push({ level: 'warning', text: "Heavy use of advanced optional chaining/nullish coalescing relative to script size. High likelihood of modern AI generation." });
    }
    if (awaitCount > 5 && tryCatchCount === 0 && lines.length < 60) {
        score += 15;
        flags.push({ level: 'warning', text: "High use of async/await without try/catch handling. Often generated by simple AI prompts." });
    }

    // Formatting Perfection (AI tends to leave no trailing spaces and uniform blank lines)
    let trailingSpaces = (code.match(/[ \t]+$/gm) || []).length;
    if (trailingSpaces === 0 && lines.length > 20) {
        score += 15;
        flags.push({ level: 'info', text: "Zero trailing whitespaces found in multi-line code. Extremely uniform/auto-formatted, typical of AI generation." });
    } else if (trailingSpaces > 5) {
        score -= 15;
        flags.push({ level: 'good', text: "Inconsistent trailing whitespaces found. Suggests manual typing." });
    }

    // New Heuristic 1: Over-engineered Python Type Hinting
    let pythonTypeHints = (code.match(/def\s+\w+\s*\([^)]*:\s*[A-Z][a-zA-Z0-9_\[\]\s,]+[^)]*\)\s*->\s*[A-Z][a-zA-Z0-9_\[\]\s,]+:/g) || []).length;
    if (pythonTypeHints > 2 && lines.length < 50) {
        score += 25;
        flags.push({ level: 'warning', text: "Unusually exhaustive Python type hinting for a short script. Typical of AI over-engineering." });
    }

    // New Heuristic 2: pass and ... placeholders in Python
    let pythonPlaceholders = (code.match(/def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:\s*(?:"""[^"]*"""|'''[^']*''')?\s*(pass|\.\.\.)\s/g) || []).length;
    if (pythonPlaceholders > 0) {
        score += 35;
        flags.push({ level: 'severe', text: "Empty function scaffolding (pass/...) detected. Typical of AI-generated skeleton code." });
    }

    // New Heuristic 4: Redundant if __name__ == "__main__"
    if (/if\s+__name__\s*==\s*["']__main__["']:/g.test(code) && lines.length < 20) {
        score += 20;
        flags.push({ level: 'warning', text: "Redundant __main__ block in a very short Python script." });
    }

    // New Heuristic 6: "Include everything" C++ headers
    let cppIncludes = (code.match(/#include\s+<[^>]+>/g) || []).length;
    if (cppIncludes > 6 && lines.length < 30) {
        score += 25;
        flags.push({ level: 'warning', text: "Excessive C/C++ includes for a very short file. AI standard boilerplate behavior." });
    }

    // New Heuristic 7: System.out.println spam
    let sysoutSpam = (code.match(/System\.out\.println\(/g) || []).length;
    if (sysoutSpam > 5 && lines.length < 40) {
        score += 20;
        flags.push({ level: 'warning', text: "Heavy System.out.println logging. AI tends to over-log in Java." });
    }

    // New Heuristic 8: Explicit this. keyword spam
    let thisSpam = (code.match(/\bthis\.\w+\s*=/g) || []).length;
    if (thisSpam > 10 && lines.length < 50) {
        score += 15;
        flags.push({ level: 'info', text: "High frequency of 'this.' assignments. AI often over-qualifies variables." });
    }

    // New Heuristic 9: Overly verbose SQL aliases
    let sqlVerboseAliases = (code.match(/(FROM|JOIN)\s+(\w+)\s+(?:AS\s+)?(\w+_\w+|\w+1)/gi) || []).length;
    if (sqlVerboseAliases > 2) {
        score += 20;
        flags.push({ level: 'warning', text: "Verbose or perfectly numbered SQL aliases detected. AI models often generate extremely verbose aliases." });
    }

    // New Heuristic 10: SQL Capitalization perfection
    let sqlCaps = (code.match(/\b(SELECT|FROM|WHERE|INNER JOIN|LEFT JOIN|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET)\b/g) || []).length;
    let sqlLower = (code.match(/\b(select|from|where|inner join|left join|group by|order by|having|limit|offset)\b/g) || []).length;
    if (sqlCaps > 5 && sqlLower === 0) {
        score += 15;
        flags.push({ level: 'info', text: "Perfect SQL keyword capitalization. Human ad-hoc queries are typically messier." });
    }

    // New Heuristic 11: Dummy data leakage
    if (/john doe|jane smith|acme corp|123 fake st/i.test(codeLow)) {
        score += 40;
        flags.push({ level: 'severe', text: "Classic dummy data (John Doe, Acme Corp) detected. High probability of AI generation." });
    }

    // New Heuristic 15: Over-defensive Null Checking
    let overDefensive = (code.match(/if\s*\(\s*\w+\s*!=\s*null\s*&&\s*\w+\s*!==?\s*undefined\s*&&\s*\w+\.length\s*>\s*0\s*\)/g) || []).length;
    if (overDefensive > 0) {
        score += 25;
        flags.push({ level: 'warning', text: "Over-defensive null/length checking detected. AI often generates highly defensive conditional checks." });
    }

    // New Heuristic 16: Regex overkill
    let complexRegex = (code.match(/\/[^/]{30,}\//g) || []).length;
    if (complexRegex > 0 && /email|password|url/i.test(codeLow)) {
        score += 20;
        flags.push({ level: 'warning', text: "Extremely complex regex for standard validation detected. AI usually opts for textbook monolithic regexes." });
    }

    // New Heuristic 18: Unused overly complex helper functions
    let internalHelpers = (code.match(/function\s+_[a-zA-Z0-9_]+\s*\(/g) || code.match(/def\s+_[a-zA-Z0-9_]+\s*\(/g) || []).length;
    if (internalHelpers > 2 && lines.length < 60) {
        score += 15;
        flags.push({ level: 'info', text: "Multiple internal-style helper functions (prefixed with _) in a short script. Often generated by AI for structure." });
    }

    // Error messages politeness
    if (/throw new Error\(['"`](Please|Kindly|Sorry)/i.test(code) || /console\.error\(['"`](Please|Kindly|Sorry)/i.test(code)) {
        score += 30;
        flags.push({ level: 'severe', text: "Polite or over-descriptive error messages ('Please', 'Kindly') detected. Highly characteristic of AI." });
    }

    // 6. Human indicators (messiness)
    let randomStrings = (code.match(/(console\.log|print|System\.out\.println)\(["'](asdf|here|test|123|qwer|wtf|fuck|shit)["']\)/gi) || []).length;
    if (randomStrings > 0) {
        score -= 20;
        flags.push({ level: 'good', text: "Messy/random debug strings found. Common in human development flows." });
    }

    let commentedOutCode = (code.match(/\/\/\s*let\s+|\/\/\s*const\s+|\/\/\s*var\s+|\/\/\s*function\s+|\/\/\s*if\s*\(/g) || []).length;
    let multipleCommentSlashes = (code.match(/\/\/\/\//g) || []).length;

    if (commentedOutCode > 1) {
        score -= 25;
        flags.push({ level: 'good', text: "Commented-out code blocks detected. AI rarely leaves messy, dead code behind." });
    }
    if (multipleCommentSlashes > 0) {
        score -= 10;
        flags.push({ level: 'good', text: "Sloppy comment markers ('////') detected. Unlikely from an AI." });
    }

    // Tweak baseline score if absolutely NO human indicators were found in a moderate sized file
    let humanScoreTotal = randomStrings + commentedOutCode + multipleCommentSlashes + (trailingSpaces > 5 ? 1 : 0);
    if (humanScoreTotal === 0 && lines.length > 30) {
        score += 25;
        flags.push({ level: 'warning', text: "Absence of any typical human messiness (sloppy comments, dead code, uneven whitespace) in a sizable script. Highly sterile." });
    }

    // Create a highly complex, deterministic organic offset
    // Using continuous metrics and sin/cos to generate a pseudo-random looking but perfectly consistent offset
    let rawComplexity = (wordEnt * 3.14) + (charEnt * 2.71) + (burst.cv * 10) + lines.length;
    let organicOffset = Math.sin(rawComplexity) * 12 + Math.cos(charEnt * wordEnt) * 7;

    // The offset can swing the score by roughly +/- 19 points organically
    score += organicOffset;

    // Introduce micro-variations to break any remaining roundness
    score += (code.length % 7) - 3;

    // Clamp the score securely between 1 and 99 (100 and 0 are highly artificial)
    // and round it so no decimals are shown.
    score = Math.round(Math.max(1, Math.min(99, score)));

    if (detected.size === 0 && score > 50) detected.add("Generic LLM");

    return { score, flags, models: Array.from(detected) };
}
