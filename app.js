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
    rulesModal.classList.add('active');
});

const closeRules = () => {
    rulesModal.classList.remove('active');
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

    inputSection.classList.remove('active');
    loadingSection.classList.add('flex-active');
    loadingLogs.innerHTML = '';

    let logs = [
        "Initializing heuristic engine...",
        "Parsing Abstract Syntax Tree...",
        "Calculating Shannon entropy...",
        "Evaluating line-length variance...",
        "Cross-referencing known LLM patterns...",
        "Finalizing score..."
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
        loadingSection.classList.remove('flex-active');
        resultsSection.classList.add('active');

        scoreText.innerText = `${result.score}%`;

        // colorize score circle
        scoreCircle.classList.remove('score-red', 'score-orange', 'score-green');
        if (result.score > 70) {
            scoreCircle.classList.add('score-red');
            resultTitle.innerText = "Highly Likely AI-Generated";
            resultDesc.innerText = "Significant patterns matching LLM outputs were found.";
        } else if (result.score > 30) {
            scoreCircle.classList.add('score-orange');
            resultTitle.innerText = "Potentially AI-Assisted";
            resultDesc.innerText = "Some heuristics suggest possible AI generation or heavy template usage.";
        } else {
            scoreCircle.classList.add('score-green');
            resultTitle.innerText = "Likely Human-Written";
            resultDesc.innerText = "Code appears natural and lacks common LLM artifacts.";
        }

        modelTags.innerHTML = '';
        if (result.models.length > 0) {
            result.models.forEach(m => {
                let span = document.createElement('span');
                span.className = 'model-tag';
                span.innerText = m;
                modelTags.appendChild(span);
            });
        }

        flagsList.innerHTML = '';
        flagCountBadge.textContent = `${result.flags.length} Flag${result.flags.length !== 1 ? 's' : ''}`;
        if (result.flags.length === 0) {
            let li = document.createElement('li');
            li.className = "no-flags";
            li.textContent = "No significant flags detected.";
            flagsList.appendChild(li);
        } else {
            result.flags.forEach(f => {
                let li = document.createElement('li');
                li.className = 'flag-item';

                let icon = '';
                let colorClass = '';
                if (f.level === 'severe') {
                    icon = '<i data-lucide="alert-triangle"></i>';
                    colorClass = 'severe';
                } else if (f.level === 'warning') {
                    icon = '<i data-lucide="alert-circle"></i>';
                    colorClass = 'warning';
                } else if (f.level === 'good') {
                    icon = '<i data-lucide="check-circle-2"></i>';
                    colorClass = 'good';
                } else {
                    icon = '<i data-lucide="info"></i>';
                    colorClass = 'info';
                }

                li.innerHTML = `<div class="flag-icon ${colorClass}">${icon}</div><div class="flag-text flag-text-content"></div>`;
                li.querySelector('.flag-text-content').textContent = f.text;
                flagsList.appendChild(li);
            });
            lucide.createIcons(); // Re-render icons for dynamic content
        }

    }, 3000);
});

resetBtn.addEventListener('click', () => {
    resultsSection.classList.remove('active');
    inputSection.classList.add('active');
    codeInput.value = '';
    clearBtn.style.display = 'none';
    codeInput.focus();
});