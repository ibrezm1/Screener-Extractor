/* ==========================================
   CUSTOM COLUMNS / INDICATORS ENGINE & AI PROMPTS
   ========================================== */

// Helper to construct AI prompt
function generateAIPrompt(company) {
    let prompt = `Analyze this company: ${company.name}\n`;
    if (company.url) {
        prompt += `Screener URL: ${company.url}\n`;
    }
    
    prompt += `\nFinancial Metrics:\n`;
    Object.entries(company.data).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
            prompt += `- ${key}: ${val}\n`;
        }
    });
    
    prompt += `\nProvide a detailed financial analysis of this company. Search for recent earnings, news, valuations, and market trends to assess its investment potential, drivers, and risks.`;
    return encodeURIComponent(prompt);
}

// Helper to evaluate formula string dynamically
function evaluateFormula(formulaText, companyData) {
    let expression = formulaText;
    const tokenRegex = /\{([^}]+)\}/g;
    expression = expression.replace(tokenRegex, (match, columnName) => {
        const value = companyData[columnName];
        if (value === undefined || value === null || value === '') {
            return '0';
        }
        const cleaned = value.toString().replace(/,/g, '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? '0' : parsed.toString();
    });
    
    const safeRegex = /^[0-9\+\-\*\/\(\)\.\s]+$/;
    if (!safeRegex.test(expression)) {
        return '';
    }
    
    try {
        const evalFn = new Function(`return (${expression});`);
        const result = evalFn();
        if (isNaN(result) || !isFinite(result)) {
            return '';
        }
        return Number(result.toFixed(2)).toString();
    } catch (e) {
        return '';
    }
}

// Compute custom columns for all loaded companies
function computeCustomColumns() {
    accumulatedCompanies.forEach(comp => {
        customColumns.forEach(cc => {
            comp.data[cc.name] = evaluateFormula(cc.formula, comp.data);
        });
    });
}

// Modal handling variables
let indicatorModal;
let indicatorNameInput;
let indicatorFormulaInput;
let modalColumnsList;

function openIndicatorModal() {
    if (!indicatorNameInput || !indicatorFormulaInput || !modalColumnsList) return;
    
    indicatorNameInput.value = '';
    indicatorFormulaInput.value = '';
    modalColumnsList.innerHTML = '';
    
    // Fill columns list with standard columns (i.e. those that are not custom indicators)
    const standardCols = allColumns.filter(c => !customColumns.some(cc => cc.name === c));
    
    if (standardCols.length === 0) {
        modalColumnsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; padding: 5px;">No source columns available yet. Extract some data first!</div>';
    } else {
        standardCols.forEach(col => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'col-btn';
            btn.textContent = col;
            btn.addEventListener('click', () => {
                insertAtCursor(indicatorFormulaInput, `{${col}}`);
            });
            modalColumnsList.appendChild(btn);
        });
    }
    
    indicatorModal.classList.remove('hidden');
}

function closeIndicatorModal() {
    if (indicatorModal) {
        indicatorModal.classList.add('hidden');
    }
}

function insertAtCursor(input, text) {
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const val = input.value;
    input.value = val.substring(0, startPos) + text + val.substring(endPos, val.length);
    input.selectionStart = input.selectionEnd = startPos + text.length;
    input.focus();
}

function saveCustomIndicator() {
    if (!indicatorNameInput || !indicatorFormulaInput) return;
    
    const name = indicatorNameInput.value.trim();
    const formula = indicatorFormulaInput.value.trim();
    
    if (!name) {
        showToast('Please enter an indicator name', 'danger');
        return;
    }
    if (!formula) {
        showToast('Please enter a formula', 'danger');
        return;
    }
    
    // Check if the indicator name conflicts with standard columns (excluding custom columns)
    const standardCols = allColumns.filter(c => !customColumns.some(cc => cc.name === c));
    if (standardCols.includes(name)) {
        showToast(`An original column named "${name}" already exists`, 'danger');
        return;
    }
    
    // Check if custom column already exists
    if (customColumns.some(cc => cc.name === name)) {
        showToast(`A custom indicator named "${name}" already exists`, 'danger');
        return;
    }
    
    // Validate formula tokens against allColumns
    let testExpression = formula;
    const tokenRegex = /\{([^}]+)\}/g;
    const tokens = [];
    testExpression = testExpression.replace(tokenRegex, (match, colName) => {
        tokens.push(colName);
        return '1';
    });
    
    const invalidTokens = tokens.filter(t => !allColumns.includes(t));
    if (invalidTokens.length > 0) {
        showToast(`Formula contains invalid columns: ${invalidTokens.join(', ')}`, 'danger');
        return;
    }
    
    const safeRegex = /^[0-9\+\-\*\/\(\)\.\s]+$/;
    if (!safeRegex.test(testExpression)) {
        showToast('Formula contains invalid characters. Only column names in braces, numbers, and basic operators (+ - * / ( ) .) are allowed.', 'danger');
        return;
    }
    
    try {
        const evalFn = new Function(`return (${testExpression});`);
        evalFn();
    } catch (err) {
        showToast(`Invalid formula syntax: ${err.message}`, 'danger');
        return;
    }
    
    // Add custom column
    customColumns.push({ name, formula });
    
    // Recalculate, show, update, save
    updateActiveColumns();
    visibleColumns.add(name); // Auto-enable the new column
    renderTableHeaders();
    renderTable();
    updateStats();
    saveToLocalStorage();
    
    closeIndicatorModal();
    showToast(`Custom indicator "${name}" created successfully!`, 'success');
}

function deleteCustomColumn(name) {
    customColumns = customColumns.filter(cc => cc.name !== name);
    
    // Clean data from companies
    accumulatedCompanies.forEach(comp => {
        delete comp.data[name];
    });
    
    visibleColumns.delete(name);
    
    updateActiveColumns();
    renderTableHeaders();
    renderTable();
    updateStats();
    saveToLocalStorage();
}

// Bind event listeners
document.addEventListener('DOMContentLoaded', () => {
    indicatorModal = document.getElementById('indicator-modal');
    indicatorNameInput = document.getElementById('indicator-name');
    indicatorFormulaInput = document.getElementById('indicator-formula');
    modalColumnsList = document.getElementById('modal-columns-list');
    
    const addIndicatorBtn = document.getElementById('add-indicator-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelIndicatorBtn = document.getElementById('cancel-indicator-btn');
    const saveIndicatorBtn = document.getElementById('save-indicator-btn');
    
    if (addIndicatorBtn) addIndicatorBtn.addEventListener('click', openIndicatorModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeIndicatorModal);
    if (cancelIndicatorBtn) cancelIndicatorBtn.addEventListener('click', closeIndicatorModal);
    if (saveIndicatorBtn) saveIndicatorBtn.addEventListener('click', saveCustomIndicator);
});
