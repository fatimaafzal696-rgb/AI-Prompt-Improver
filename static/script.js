/* ============================================================
   PromptCraft AI — script.js
   Handles UI state, API calls, history, and score animations.
   ============================================================ */

'use strict';

// ── DOM References ──────────────────────────────────────────
const promptInput       = document.getElementById('prompt-input');
const charCount         = document.getElementById('char-count');
const improveBtn        = document.getElementById('improve-btn');
const btnContent        = improveBtn.querySelector('.btn-content');
const btnLoading        = improveBtn.querySelector('.btn-loading');
const modeRadios        = document.querySelectorAll('input[name="mode"]');
const modeDetailsText   = document.getElementById('mode-details-text');
const exampleChips      = document.querySelectorAll('.example-chip');

const outputBox         = document.getElementById('output-box');
const copyBtn           = document.getElementById('copy-btn');
const clearBtn          = document.getElementById('clear-btn');

const viewSingleBtn     = document.getElementById('view-single-btn');
const viewCompareBtn    = document.getElementById('view-compare-btn');
const viewSingle        = document.getElementById('view-single');
const viewCompare       = document.getElementById('view-compare');

const compareBefore     = document.getElementById('compare-before');
const compareAfter      = document.getElementById('compare-after');

const originalScoreVal  = document.getElementById('original-score-val');
const improvedScoreVal  = document.getElementById('improved-score-val');
const originalCircle    = document.getElementById('original-circle');
const improvedCircle    = document.getElementById('improved-circle');

const improvementsSection = document.getElementById('improvements-section');
const improvementsList    = document.getElementById('improvements-list');
const improvementExplanation = document.getElementById('improvement-explanation');

const historyBtn        = document.getElementById('history-btn');
const closeHistoryBtn   = document.getElementById('close-history-btn');
const historyOverlay    = document.getElementById('history-overlay');
const historyDrawer     = document.getElementById('history-drawer');
const historyList       = document.getElementById('history-list');
const historyCountBadge = document.getElementById('history-count-badge');
const clearHistoryBtn   = document.getElementById('clear-history-btn');

const apiStatusIndicator = document.getElementById('api-status-indicator');

const toast             = document.getElementById('toast');
const toastIcon         = document.getElementById('toast-icon');
const toastMessage      = document.getElementById('toast-message');

// ── Constants ───────────────────────────────────────────────
const SCORE_CIRCUMFERENCE = 2 * Math.PI * 32; // r=32

const MODE_DESCRIPTIONS = {
    better:       'Fixes grammar and spelling errors, improves clarity and precision, and removes redundancy while keeping your original intent intact.',
    professional: 'Adds proper context and background, creates a structured format, improves specificity of instructions, and uses professional language to produce a well-structured prompt.',
    expert:       'Transforms your prompt into a comprehensive, expert-level instruction with a defined role, clear objectives, rich context, specific constraints, output formatting, target audience, and success criteria.'
};

const HISTORY_STORAGE_KEY = 'promptcraft_history';
const MAX_HISTORY = 20;

// ── State ────────────────────────────────────────────────────
let currentResult = null;
let isLoading = false;
let toastTimeout = null;

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    injectSvgGradient();
    updateCharCount();
    updateModeDetails();
    checkApiStatus();
    renderHistoryBadge();
});

// ── SVG Gradient ─────────────────────────────────────────────
function injectSvgGradient() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML = `
        <defs>
            <linearGradient id="improved-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#00f2fe"/>
                <stop offset="100%" stop-color="#a855f7"/>
            </linearGradient>
        </defs>`;
    document.body.prepend(svg);
}

// ── Character Counter ────────────────────────────────────────
promptInput.addEventListener('input', updateCharCount);

function updateCharCount() {
    const count = promptInput.value.length;
    const counterEl = charCount.parentElement;
    charCount.textContent = count;
    counterEl.classList.remove('warning', 'danger');
    if (count > 4500) counterEl.classList.add('danger');
    else if (count > 3500) counterEl.classList.add('warning');
}

// ── Example Chips ────────────────────────────────────────────
exampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
        promptInput.value = chip.dataset.prompt;
        updateCharCount();
        promptInput.focus();
        promptInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
});

// ── Mode Selection ────────────────────────────────────────────
modeRadios.forEach(radio => {
    radio.addEventListener('change', updateModeDetails);
});

function updateModeDetails() {
    const selected = document.querySelector('input[name="mode"]:checked');
    if (selected) {
        modeDetailsText.textContent = MODE_DESCRIPTIONS[selected.value] || '';
    }
}

function getSelectedMode() {
    const selected = document.querySelector('input[name="mode"]:checked');
    return selected ? selected.value : 'better';
}

// ── Main Improve Action ───────────────────────────────────────
improveBtn.addEventListener('click', handleImprove);

promptInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleImprove();
    }
});

async function handleImprove() {
    if (isLoading) return;

    const prompt = promptInput.value.trim();

    if (!prompt) {
        showToast('⚠️', 'Please enter a prompt first.', 'error');
        promptInput.focus();
        return;
    }

    if (prompt.length < 5) {
        showToast('⚠️', 'Prompt is too short. Add more detail.', 'error');
        promptInput.focus();
        return;
    }

    const mode = getSelectedMode();

    setLoadingState(true);
    clearOutput();

    try {
        const response = await fetch('/api/improve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, mode })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || `Server error: ${response.status}`);
        }

        currentResult = data;
        displayResult(data);
        saveToHistory(data);
        if (data.mocked) {
            showToast('⚡', 'Demo Mode: Prompt enhanced using templates.', 'info');
        } else {
            showToast('✅', 'Prompt improved successfully!', 'success');
        }

    } catch (err) {
        console.error('Improve error:', err);
        showToast('❌', err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
        setLoadingState(false);
    }
}

// ── Loading State ─────────────────────────────────────────────
function setLoadingState(loading) {
    isLoading = loading;
    improveBtn.disabled = loading;
    improveBtn.classList.toggle('loading', loading);
    btnContent.classList.toggle('hidden', loading);
    btnLoading.classList.toggle('hidden', !loading);
}

// ── Display Result ────────────────────────────────────────────
function displayResult(data) {
    const { improved_prompt, original_prompt, original_score, improved_score, improvements_made, explanation } = data;

    // -- Output Box
    outputBox.innerHTML = '';
    outputBox.textContent = improved_prompt;
    outputBox.classList.add('has-content');

    // -- Compare boxes
    compareBefore.textContent = original_prompt;
    compareAfter.textContent = improved_prompt;

    // -- Enable buttons
    copyBtn.disabled = false;
    clearBtn.disabled = false;

    // -- Animate Scores
    animateScore(originalCircle, originalScoreVal, original_score, false);
    animateScore(improvedCircle, improvedScoreVal, improved_score, true);

    // -- Improvements
    if (improvements_made && improvements_made.length) {
        improvementsSection.classList.remove('hidden');
        improvementsList.innerHTML = improvements_made
            .map(tag => `<span class="improvement-tag">${escapeHtml(tag)}</span>`)
            .join('');
    }

    if (explanation) {
        improvementExplanation.textContent = explanation;
        improvementExplanation.style.display = 'block';
    } else {
        improvementExplanation.style.display = 'none';
    }
}

// ── Score Animation ───────────────────────────────────────────
function animateScore(circleEl, valueEl, targetScore, gradient) {
    const circumference = SCORE_CIRCUMFERENCE;
    let current = 0;
    valueEl.textContent = '0';

    const duration = 1000;
    const start = performance.now();

    if (gradient) {
        // Set the stroke via attribute to use the SVG gradient
        circleEl.setAttribute('stroke', 'url(#improved-gradient)');
        circleEl.style.stroke = '';
    }

    function frame(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        current = Math.round(eased * targetScore);

        const offset = circumference - (current / 100) * circumference;
        circleEl.style.strokeDashoffset = offset;
        valueEl.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(frame);
        }
    }

    requestAnimationFrame(frame);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// ── Clear Output ───────────────────────────────────────────────
function clearOutput() {
    outputBox.innerHTML = `
        <div class="output-placeholder">
            <div class="placeholder-icon">✨</div>
            <p>Your improved prompt will appear here.</p>
            <p class="placeholder-sub">Select a mode and click <strong>Improve Prompt</strong> to get started.</p>
        </div>`;
    outputBox.classList.remove('has-content');

    compareBefore.textContent = '';
    compareAfter.textContent = '';
    copyBtn.disabled = true;
    clearBtn.disabled = true;
    improvementsSection.classList.add('hidden');
    improvementsList.innerHTML = '';

    // Reset score circles
    originalCircle.style.strokeDashoffset = SCORE_CIRCUMFERENCE;
    improvedCircle.style.strokeDashoffset = SCORE_CIRCUMFERENCE;
    originalScoreVal.textContent = '—';
    improvedScoreVal.textContent = '—';

    currentResult = null;
}

clearBtn.addEventListener('click', () => {
    clearOutput();
    promptInput.value = '';
    updateCharCount();
    setViewMode('single');
});

// ── Copy to Clipboard ──────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
    const text = outputBox.textContent.trim();
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        showToast('📋', 'Copied to clipboard!', 'success');
    } catch {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('📋', 'Copied to clipboard!', 'success');
    }
});

// ── View Toggle ────────────────────────────────────────────────
viewSingleBtn.addEventListener('click', () => setViewMode('single'));
viewCompareBtn.addEventListener('click', () => setViewMode('compare'));

function setViewMode(mode) {
    const isSingle = mode === 'single';
    viewSingleBtn.classList.toggle('active', isSingle);
    viewCompareBtn.classList.toggle('active', !isSingle);
    viewSingle.classList.toggle('hidden', !isSingle);
    viewCompare.classList.toggle('hidden', isSingle);
}

// ── History ────────────────────────────────────────────────────
historyBtn.addEventListener('click', openHistory);
closeHistoryBtn.addEventListener('click', closeHistory);
historyOverlay.addEventListener('click', closeHistory);

function openHistory() {
    historyOverlay.classList.add('open');
    historyDrawer.classList.add('open');
    historyOverlay.setAttribute('aria-hidden', 'false');
    renderHistory();
}

function closeHistory() {
    historyOverlay.classList.remove('open');
    historyDrawer.classList.remove('open');
    historyOverlay.setAttribute('aria-hidden', 'true');
}

function getHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
    } catch { return []; }
}

function saveToHistory(data) {
    const history = getHistory();
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        mode: data.mode,
        original_prompt: data.original_prompt,
        improved_prompt: data.improved_prompt,
        original_score: data.original_score,
        improved_score: data.improved_score,
        improvements_made: data.improvements_made
    };
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    renderHistoryBadge();
}

function renderHistoryBadge() {
    const count = getHistory().length;
    if (count > 0) {
        historyCountBadge.textContent = count > 9 ? '9+' : count;
        historyCountBadge.classList.remove('hidden');
    } else {
        historyCountBadge.classList.add('hidden');
    }
}

function renderHistory() {
    const history = getHistory();
    if (!history.length) {
        historyList.innerHTML = `
            <div class="history-empty">
                <div class="history-empty-icon">📝</div>
                <p>No history yet. Start improving prompts!</p>
            </div>`;
        return;
    }

    historyList.innerHTML = history.map(entry => `
        <div class="history-item" data-id="${entry.id}" role="button" tabindex="0" aria-label="Load history item">
            <div class="history-item-meta">
                <span class="history-item-mode ${entry.mode}">${capitalize(entry.mode)}</span>
                <span class="history-item-score">Score: <span>${entry.original_score} → ${entry.improved_score}</span></span>
            </div>
            <div class="history-item-text">${escapeHtml(entry.original_prompt)}</div>
        </div>
    `).join('');

    // Click handlers for each item
    historyList.querySelectorAll('.history-item').forEach(item => {
        const handler = () => loadHistoryItem(parseInt(item.dataset.id));
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') handler(); });
    });
}

function loadHistoryItem(id) {
    const history = getHistory();
    const entry = history.find(h => h.id === id);
    if (!entry) return;

    promptInput.value = entry.original_prompt;
    updateCharCount();

    // Set correct mode radio
    const radio = document.getElementById(`mode-${entry.mode}`);
    if (radio) { radio.checked = true; updateModeDetails(); }

    currentResult = { ...entry };
    displayResult(entry);

    closeHistory();
    showToast('🕘', 'History item loaded.', 'info');
}

clearHistoryBtn.addEventListener('click', () => {
    if (!getHistory().length) return;
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    renderHistory();
    renderHistoryBadge();
    showToast('🗑', 'History cleared.', 'info');
});

// ── API Status Check ───────────────────────────────────────────
async function checkApiStatus() {
    try {
        const resp = await fetch('/api/health');
        const data = await resp.json();
        const statusText = apiStatusIndicator.querySelector('.status-text');
        apiStatusIndicator.classList.remove('status-ok', 'status-error', 'status-warning');
        if (data.api_key_configured) {
            apiStatusIndicator.classList.add('status-ok');
            statusText.textContent = 'API Ready';
        } else {
            apiStatusIndicator.classList.add('status-warning');
            statusText.textContent = 'Demo Mode';
        }
    } catch {
        const statusText = apiStatusIndicator.querySelector('.status-text');
        apiStatusIndicator.classList.add('status-error');
        statusText.textContent = 'Offline';
    }
}

// ── Toast Notifications ────────────────────────────────────────
function showToast(icon, message, type = 'info') {
    clearTimeout(toastTimeout);

    toast.className = `toast toast-${type}`;
    toastIcon.textContent = icon;
    toastMessage.textContent = message;

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ── Helpers ────────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
