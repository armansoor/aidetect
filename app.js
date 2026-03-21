lucide.createIcons();

// theme stuff
const themeToggleBtn = document.getElementById('themeToggle');
const sunIcon = document.getElementById('sunIcon');
const moonIcon = document.getElementById('moonIcon');

function updateThemeIcons() {
    if (document.documentElement.classList.contains('dark')) {
        sunIcon.classList.remove('hidden'); moonIcon.classList.add('hidden');
    } else {
        sunIcon.classList.add('hidden'); moonIcon.classList.remove('hidden');
    }
}
setTimeout(updateThemeIcons, 50);

themeToggleBtn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    updateThemeIcons();
});

// dom nodes
const fileInput = document.getElementById('fileInput'), dropZone = document.getElementById('dropZone');
const codeInput = document.getElementById('codeInput'), analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn'), inputSection = document.getElementById('inputSection');
const loadingSection = document.getElementById('loadingSection'), resultsSection = document.getElementById('resultsSection');
const scoreCircle = document.getElementById('scoreCircle'), scoreText = document.getElementById('scoreText');
const resultTitle = document.getElementById('resultTitle'), resultDesc = document.getElementById('resultDesc');
const flagsList = document.getElementById('flagsList'), resetBtn = document.getElementById('resetBtn');
const modelTags = document.getElementById('modelTags'), flagCountBadge = document.getElementById('flagCount');
const loadingLogs = document.getElementById('loadingLogs');

// rules modal nodes
const viewRulesBtn = document.getElementById('viewRulesBtn');
const closeRulesBtn = document.getElementById('closeRulesBtn');
const rulesModal = document.getElementById('rulesModal');

viewRulesBtn.addEventListener('click', () => {
    rulesModal.classList.remove('opacity-0', 'pointer-events-none');
    rulesModal.firstElementChild.classList.remove('scale-95');
});

const closeRules = () => {
    rulesModal.classList.add('opacity-0', 'pointer-events-none');
    rulesModal.firstElementChild.classList.add('scale-95');
};

closeRulesBtn.addEventListener('click', closeRules);
rulesModal.addEventListener('click', (e) => {
    if (e.target === rulesModal) closeRules();
});

codeInput.addEventListener('input', () => { clearBtn.style.display = codeInput.value.length > 0 ? 'block' : 'none'; });
clearBtn.addEventListener('click', () => { codeInput.value = ''; clearBtn.style.display = 'none'; codeInput.focus(); });

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleFile(e.target.files[0]);
    fileInput.value = '';
});

function handleFile(file) {
    if (file.size > 5 * 1024 * 1024) return alert("File too large. Max 5MB.");
    let reader = new FileReader();
    reader.onload = (e) => { codeInput.value = e.target.result; clearBtn.style.display = 'block'; };
    reader.readAsText(file);
}

analyzeBtn.addEventListener('click', () => {
    let code = codeInput.value;
    if (!code || code.trim().length === 0) return alert("Please enter some code to analyze.");

    // Check if the input is likely plain text rather than code
    if (typeof isLikelyCode === 'function' && !isLikelyCode(code)) {
        return alert("It looks like you entered plain text. Please enter valid code to analyze.");
    }

    inputSection.style.display = 'none';
    loadingSection.style.display = 'flex';
    loadingSection.classList.remove('hidden');
    loadingLogs.innerHTML = '';

    let logs = [
        "Initializing advanced heuristic engine...",
        "Parsing Abstract Syntax Tree (AST)...",
        "Calculating Shannon entropy models...",
        "Evaluating line-length variance metrics...",
        "Cross-referencing known LLM signature patterns...",
        "Finalizing diagnostic score..."
    ];

    let i = 0;
    let logInterval = setInterval(() => {
        if (i < logs.length) {
            loadingLogs.innerHTML += `<div>> ${logs[i]}</div>`;
            i++;
        }
    }, 400);

    setTimeout(() => {
        clearInterval(logInterval);
        let result = execAnalysis(code);

        // render results
        loadingSection.style.display = 'none';
        loadingSection.classList.add('hidden');
        resultsSection.style.display = 'block';
        resultsSection.classList.remove('hidden');

        scoreText.innerText = `${result.score}%`;

        // colorize score circle
        const scoreRing = document.getElementById('scoreRing');
        scoreRing.classList.remove('border-red-500', 'border-amber-500', 'border-green-500', 'dark:border-red-500', 'dark:border-amber-500', 'dark:border-green-500', 'shadow-glow');
        scoreText.classList.remove('text-red-500', 'text-amber-500', 'text-green-500');

        if (result.score > 70) {
            scoreRing.classList.add('border-red-500');
            scoreText.classList.add('text-red-500');
            resultTitle.innerText = "Highly Likely AI-Generated";
            resultTitle.classList.remove('text-slate-900', 'dark:text-white', 'text-amber-500', 'text-green-500');
            resultTitle.classList.add('text-red-500');
            resultDesc.innerText = "Significant patterns matching LLM outputs were found.";
        } else if (result.score > 30) {
            scoreRing.classList.add('border-amber-500');
            scoreText.classList.add('text-amber-500');
            resultTitle.innerText = "Potentially AI-Assisted";
            resultTitle.classList.remove('text-slate-900', 'dark:text-white', 'text-red-500', 'text-green-500');
            resultTitle.classList.add('text-amber-500');
            resultDesc.innerText = "Some heuristics suggest possible AI generation or heavy template usage.";
        } else {
            scoreRing.classList.add('border-green-500', 'shadow-glow');
            scoreText.classList.add('text-green-500');
            resultTitle.innerText = "Likely Human-Written";
            resultTitle.classList.remove('text-slate-900', 'dark:text-white', 'text-red-500', 'text-amber-500');
            resultTitle.classList.add('text-green-500');
            resultDesc.innerText = "Code appears natural and lacks common LLM artifacts.";
        }

        modelTags.innerHTML = '';
        if (result.models.length > 0) {
            result.models.forEach(m => {
                let span = document.createElement('span');
                span.className = 'text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-full uppercase tracking-widest border border-slate-200 dark:border-slate-600 shadow-sm';
                span.innerText = m;
                modelTags.appendChild(span);
            });
        }

        flagsList.innerHTML = '';
        flagCountBadge.textContent = `${result.flags.length} Flag${result.flags.length !== 1 ? 's' : ''}`;
        if (result.flags.length === 0) {
            let li = document.createElement('li');
            li.className = "text-sm text-slate-500 dark:text-slate-400 italic font-medium";
            li.textContent = "No significant flags detected. The code analysis passed without major issues.";
            flagsList.appendChild(li);
        } else {
            result.flags.forEach(f => {
                let li = document.createElement('li');
                li.className = 'flex items-start gap-4 text-sm font-medium';

                let icon = '';
                let colorClass = '';
                let bgClass = '';
                if (f.level === 'severe') {
                    icon = '<i data-lucide="alert-octagon" class="w-4 h-4 text-red-500"></i>';
                    colorClass = 'text-red-600 dark:text-red-400';
                    bgClass = 'bg-red-50 dark:bg-red-900/20';
                } else if (f.level === 'warning') {
                    icon = '<i data-lucide="alert-triangle" class="w-4 h-4 text-amber-500"></i>';
                    colorClass = 'text-amber-600 dark:text-amber-400';
                    bgClass = 'bg-amber-50 dark:bg-amber-900/20';
                } else if (f.level === 'good') {
                    icon = '<i data-lucide="check-circle" class="w-4 h-4 text-green-500"></i>';
                    colorClass = 'text-green-600 dark:text-green-400';
                    bgClass = 'bg-green-50 dark:bg-green-900/20';
                } else {
                    icon = '<i data-lucide="info" class="w-4 h-4 text-blue-500"></i>';
                    colorClass = 'text-blue-600 dark:text-blue-400';
                    bgClass = 'bg-blue-50 dark:bg-blue-900/20';
                }

                li.innerHTML = `<div class="flex-shrink-0 p-1.5 rounded-lg mt-0.5 shadow-sm ${bgClass}">${icon}</div><div class="text-slate-700 dark:text-slate-300 leading-relaxed flag-text-content pt-1"></div>`;
                li.querySelector('.flag-text-content').textContent = f.text;
                flagsList.appendChild(li);
            });
            lucide.createIcons(); // Re-render icons for dynamic content
        }

    }, 3000);
});

resetBtn.addEventListener('click', () => {
    resultsSection.style.display = 'none';
    resultsSection.classList.add('hidden');
    inputSection.style.display = 'block';
    codeInput.value = '';
    clearBtn.style.display = 'none';
    codeInput.focus();
});