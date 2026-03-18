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
    if (tutorialComments > 1) {
        score += 30;
        flags.push({ level: 'severe', text: "Tutorial-style commentary ('Step 1', 'Note:', 'Here we...'). Classic LLM output." });
        detected.add("GPT-4");
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
