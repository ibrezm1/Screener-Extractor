/* ==========================================
   STATE MANAGEMENT
   ========================================== */
let accumulatedCompanies = [];
let allColumns = [];
let visibleColumns = new Set();
let batchesCount = 0;
let customColumns = [];
let currentSortColumn = null;
let currentSortOrder = 'asc'; // 'asc' or 'desc'

/* ==========================================
   DOM ELEMENTS & INITIALIZATION
   ========================================== */
let htmlInput;
let extractBtn;
let clearInputBtn;
let companySearch;
let columnToggleBtn;
let columnsDropdown;
let selectAllCols;
let deselectAllCols;
let copyCsvBtn;
let downloadCsvBtn;
let clearDataBtn;
let tableHeaderRow;
let tableBody;
let themeToggleBtn;
let dedupKeySelect;

document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM Elements
    htmlInput = document.getElementById('html-input');
    extractBtn = document.getElementById('extract-btn');
    clearInputBtn = document.getElementById('clear-input-btn');
    companySearch = document.getElementById('company-search');
    columnToggleBtn = document.getElementById('column-toggle-btn');
    columnsDropdown = document.getElementById('columns-dropdown');
    selectAllCols = document.getElementById('select-all-cols');
    deselectAllCols = document.getElementById('deselect-all-cols');
    copyCsvBtn = document.getElementById('copy-csv-btn');
    downloadCsvBtn = document.getElementById('download-csv-btn');
    clearDataBtn = document.getElementById('clear-data-btn');
    tableHeaderRow = document.getElementById('table-header-row');
    tableBody = document.getElementById('table-body');
    themeToggleBtn = document.getElementById('theme-toggle');
    dedupKeySelect = document.getElementById('dedup-key');

    loadTheme();
    loadFromLocalStorage();
    setupEventListeners();
    
    // Notify opener that we are ready to receive data
    if (window.opener) {
        try {
            window.opener.postMessage({ type: 'READY' }, '*');
        } catch (e) {
            // Ignore potential cross-origin issues
        }
    }
});

/* ==========================================
   EVENT LISTENERS SETUP
   ========================================== */
function setupEventListeners() {
    // Main extraction
    extractBtn.addEventListener('click', handleExtraction);
    clearInputBtn.addEventListener('click', () => {
        htmlInput.value = '';
        showToast('Input area cleared', 'info');
    });

    // Filtering & Sorting
    companySearch.addEventListener('input', renderTable);
    
    // Dropdown toggle
    columnToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        columnsDropdown.classList.toggle('hidden');
    });
    
    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
        if (!columnsDropdown.classList.contains('hidden') && !e.target.closest('.columns-dropdown-wrapper')) {
            columnsDropdown.classList.add('hidden');
        }
    });

    // Checkbox selections
    selectAllCols.addEventListener('click', () => {
        allColumns.forEach(col => visibleColumns.add(col));
        updateColumnCheckboxes();
        renderTableHeaders();
        renderTable();
        saveToLocalStorage();
    });

    deselectAllCols.addEventListener('click', () => {
        visibleColumns.clear();
        updateColumnCheckboxes();
        renderTableHeaders();
        renderTable();
        saveToLocalStorage();
    });

    // Clear data action
    clearDataBtn.addEventListener('click', clearAllData);

    // CSV Exports
    copyCsvBtn.addEventListener('click', copyCSV);
    downloadCsvBtn.addEventListener('click', downloadCSV);

    // Theme switching
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Listen for incoming Screener HTML from bookmarklet
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SCREENER_HTML') {
            htmlInput.value = e.data.html;
            handleExtraction();
            showToast('Data received automatically from bookmarklet!', 'success');
        }
    });

    // Paste Section Collapsible Actions
    const pasteHeader = document.getElementById('paste-header');
    const pasteSection = document.getElementById('paste-section');
    if (pasteHeader && pasteSection) {
        console.log('Collapsible panel initialized successfully');
        pasteHeader.addEventListener('click', () => {
            console.log('Paste header clicked. Toggling collapsed class.');
            pasteSection.classList.toggle('collapsed');
        });
    } else {
        console.error('Collapsible panel elements not found in DOM!');
    }

    // Toggle AI dropdown menus
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-btn');
        if (btn) {
            e.stopPropagation();
            const menu = btn.nextElementSibling;
            const cell = btn.closest('.col-fixed-name');
            
            // Close all other open AI menus and remove active-dropdown class
            document.querySelectorAll('.ai-dropdown-menu').forEach(m => {
                if (m !== menu) {
                    m.classList.add('hidden');
                    const otherCell = m.closest('.col-fixed-name');
                    if (otherCell) otherCell.classList.remove('active-dropdown');
                }
            });
            
            const isHidden = menu.classList.toggle('hidden');
            if (cell) {
                if (!isHidden) {
                    cell.classList.add('active-dropdown');
                } else {
                    cell.classList.remove('active-dropdown');
                }
            }
            return;
        }
        
        // Clicked elsewhere: close all AI dropdown menus
        document.querySelectorAll('.ai-dropdown-menu').forEach(m => {
            m.classList.add('hidden');
            const cell = m.closest('.col-fixed-name');
            if (cell) cell.classList.remove('active-dropdown');
        });
    });
}

/* ==========================================
   THEME SWITCHING
   ========================================== */
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        themeToggleBtn.innerHTML = '<i class="ti ti-moon-stars"></i>';
        localStorage.setItem('screener_theme', 'light');
    } else {
        document.body.classList.add('dark-theme');
        themeToggleBtn.innerHTML = '<i class="ti ti-sun-filled"></i>';
        localStorage.setItem('screener_theme', 'dark');
    }
}

function loadTheme() {
    const cachedTheme = localStorage.getItem('screener_theme');
    if (cachedTheme === 'dark' || (!cachedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
        themeToggleBtn.innerHTML = '<i class="ti ti-sun-filled"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        themeToggleBtn.innerHTML = '<i class="ti ti-moon-stars"></i>';
    }
}

/* ==========================================
   MAIN DATA EXTRACTION HANDLER
   ========================================== */
function handleExtraction() {
    const htmlString = htmlInput.value.trim();
    if (!htmlString) {
        showToast('Please paste some HTML source code first', 'warning');
        return;
    }
    
    const parsed = parseScreenerHTML(htmlString);
    if (parsed.companies.length === 0) {
        showToast('Could not extract any company rows. Make sure you copy the entire page HTML source containing a table.', 'danger');
        return;
    }
    
    const dedupKey = dedupKeySelect.value;
    let duplicateCount = 0;
    let addedCount = 0;
    
    parsed.companies.forEach(newComp => {
        // Dedup check check based on name or url
        const existingIdx = accumulatedCompanies.findIndex(c => {
            if (dedupKey === 'url' && c.url && newComp.url) {
                return c.url === newComp.url;
            }
            return c.name.toLowerCase() === newComp.name.toLowerCase();
        });
        
        if (existingIdx !== -1) {
            // Overwrite existing data with newly extracted fields (merging)
            accumulatedCompanies[existingIdx].data = {
                ...accumulatedCompanies[existingIdx].data,
                ...newComp.data
            };
            if (newComp.url && !accumulatedCompanies[existingIdx].url) {
                accumulatedCompanies[existingIdx].url = newComp.url;
            }
            duplicateCount++;
        } else {
            accumulatedCompanies.push(newComp);
            addedCount++;
        }
    });
    
    // Sync visible columns with new metrics
    updateActiveColumns(parsed.headers);
    
    // Increment batch count
    batchesCount++;
    
    renderTableHeaders();
    renderTable();
    updateStats();
    saveToLocalStorage();
    
    // Clear textarea for next paste
    htmlInput.value = '';
    
    let summaryMessage = `Successfully extracted ${addedCount} new companies.`;
    if (duplicateCount > 0) {
        summaryMessage += ` Merged/updated data for ${duplicateCount} existing entries.`;
    }
    showToast(summaryMessage, 'success');
}

/* ==========================================
   COLUMNS SYNC & MANAGEMENT
   ========================================== */
function updateActiveColumns(newHeaders = []) {
    computeCustomColumns();
    const colSet = new Set();
    
    // Read headers from loaded records to find all existing attributes
    accumulatedCompanies.forEach(comp => {
        Object.keys(comp.data).forEach(k => colSet.add(k));
    });
    
    // Incorporate any newly parsed headers
    newHeaders.forEach(h => colSet.add(h));
    
    // Ensure all custom columns are in the columns list
    customColumns.forEach(cc => colSet.add(cc.name));
    
    allColumns = Array.from(colSet).sort((a, b) => {
        // Keep custom columns at the end, sorted alphabetically
        const aCustom = customColumns.some(cc => cc.name === a);
        const bCustom = customColumns.some(cc => cc.name === b);
        if (aCustom && !bCustom) return 1;
        if (!aCustom && bCustom) return -1;
        return a.localeCompare(b);
    });
    
    // Auto-enable any new visible columns
    if (visibleColumns.size === 0) {
        allColumns.forEach(col => visibleColumns.add(col));
    } else {
        newHeaders.forEach(h => visibleColumns.add(h));
    }
    
    updateColumnCheckboxes();
}

function updateColumnCheckboxes() {
    const listContainer = document.getElementById('column-checklist');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    allColumns.forEach(col => {
        const item = document.createElement('div');
        item.className = 'column-checklist-item';
        
        const label = document.createElement('label');
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = visibleColumns.has(col);
        cb.addEventListener('change', () => {
            if (cb.checked) {
                visibleColumns.add(col);
            } else {
                visibleColumns.delete(col);
            }
            renderTableHeaders();
            renderTable();
            saveToLocalStorage();
        });
        
        label.appendChild(cb);
        
        // Col name node
        const nameSpan = document.createElement('span');
        nameSpan.textContent = col;
        label.appendChild(nameSpan);
        
        // Add badges/delete buttons for custom indicator columns
        const customCol = customColumns.find(cc => cc.name === col);
        if (customCol) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.style.marginLeft = '0.5rem';
            badge.style.fontSize = '0.65rem';
            badge.textContent = 'Formula';
            item.appendChild(label);
            item.appendChild(badge);
            
            const delBtn = document.createElement('button');
            delBtn.className = 'col-delete-btn';
            delBtn.title = `Delete Custom Indicator "${col}"`;
            delBtn.innerHTML = '<i class="ti ti-trash"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Are you sure you want to delete the custom indicator "${col}"?`)) {
                    deleteCustomColumn(col);
                    showToast(`Custom indicator "${col}" deleted`, 'info');
                }
            });
            item.appendChild(delBtn);
        } else {
            item.appendChild(label);
        }
        
        listContainer.appendChild(item);
    });
}

/* ==========================================
   TABLE HEADERS GENERATION & SORTING
   ========================================== */
function renderTableHeaders() {
    tableHeaderRow.innerHTML = '';
    
    // Fixed S.No Column
    const thSno = document.createElement('th');
    thSno.className = 'col-fixed-sno text-center';
    thSno.textContent = 'S.No.';
    tableHeaderRow.appendChild(thSno);
    
    // Fixed Name Column
    const thName = document.createElement('th');
    thName.className = 'col-fixed-name sortable';
    thName.innerHTML = 'Company Name <i class="ti ti-arrows-sort"></i>';
    thName.addEventListener('click', () => sortTable('name'));
    tableHeaderRow.appendChild(thName);
    
    // Dynamic Columns
    visibleColumns.forEach(col => {
        const th = document.createElement('th');
        th.className = 'sortable';
        th.innerHTML = `${col} <i class="ti ti-arrows-sort"></i>`;
        th.addEventListener('click', () => sortTable(col));
        tableHeaderRow.appendChild(th);
    });
}

/* ==========================================
   TABLE ROWS RENDERING
   ========================================== */
function renderTable() {
    tableBody.innerHTML = '';
    
    const query = companySearch.value.trim().toLowerCase();
    const filtered = accumulatedCompanies.filter(comp => comp.name.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${visibleColumns.size + 2}" class="text-center" style="padding: 3rem;">
                    <div class="empty-state">
                        <i class="ti ti-search-off"></i>
                        <h3>No matching results found</h3>
                        <p>Adjust your search filters or try pasting more HTML data.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach((comp, idx) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-company-id', comp.id);
        
        // S.No
        const tdSno = document.createElement('td');
        tdSno.className = 'col-fixed-sno text-center';
        // Display original list index + 1
        tdSno.textContent = accumulatedCompanies.indexOf(comp) + 1;
        tr.appendChild(tdSno);
        
        // Name
        const tdName = document.createElement('td');
        tdName.className = 'col-fixed-name';
        if (comp.url) {
            const anchor = document.createElement('a');
            anchor.href = comp.url;
            anchor.target = '_blank';
            anchor.className = 'company-link';
            anchor.textContent = comp.name;
            tdName.appendChild(anchor);
            
            const gfUrl = getGoogleFinanceUrl(comp.url);
            if (gfUrl) {
                const gfAnchor = document.createElement('a');
                gfAnchor.href = gfUrl;
                gfAnchor.target = '_blank';
                gfAnchor.className = 'finance-link';
                gfAnchor.title = `Open ${comp.name} in Google Finance`;
                gfAnchor.innerHTML = '<i class="ti ti-chart-line"></i>';
                tdName.appendChild(gfAnchor);
            }
            
            // Add ScanX link
            const scanxAnchor = document.createElement('a');
            scanxAnchor.href = '#';
            scanxAnchor.className = 'scanx-link';
            scanxAnchor.title = `Search ${comp.name} on ScanX`;
            scanxAnchor.innerHTML = '<i class="ti ti-radar"></i>';
            scanxAnchor.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openScanX(comp.url);
            });
            tdName.appendChild(scanxAnchor);
            
            // Add AI dropdown
            const promptStr = generateAIPrompt(comp);
            const aiWrapper = document.createElement('div');
            aiWrapper.className = 'ai-dropdown-wrapper';
            
            const aiBtn = document.createElement('button');
            aiBtn.className = 'ai-btn';
            aiBtn.title = `AI analysis for ${comp.name}`;
            aiBtn.innerHTML = '<i class="ti ti-sparkles"></i>';
            aiWrapper.appendChild(aiBtn);
            
            const aiMenu = document.createElement('div');
            aiMenu.className = 'ai-dropdown-menu hidden';
            
            const chatGptLink = document.createElement('a');
            chatGptLink.href = `https://chatgpt.com/?q=${promptStr}`;
            chatGptLink.target = '_blank';
            chatGptLink.className = 'ai-dropdown-item';
            chatGptLink.innerHTML = '<i class="ti ti-brain"></i> ChatGPT Analysis';
            aiMenu.appendChild(chatGptLink);
            
            const perplexityLink = document.createElement('a');
            perplexityLink.href = `https://www.perplexity.ai/?q=${promptStr}`;
            perplexityLink.target = '_blank';
            perplexityLink.className = 'ai-dropdown-item';
            perplexityLink.innerHTML = '<i class="ti ti-search"></i> Perplexity Search';
            aiMenu.appendChild(perplexityLink);
            
            const mistralLink = document.createElement('a');
            mistralLink.href = `https://chat.mistral.ai/chat?q=${promptStr}`;
            mistralLink.target = '_blank';
            mistralLink.className = 'ai-dropdown-item';
            mistralLink.innerHTML = '<i class="ti ti-message-chatbot"></i> Mistral AI Chat';
            aiMenu.appendChild(mistralLink);
            
            const googleLink = document.createElement('a');
            googleLink.href = `https://www.google.com/search?q=${promptStr}`;
            googleLink.target = '_blank';
            googleLink.className = 'ai-dropdown-item';
            googleLink.innerHTML = '<i class="ti ti-brand-google"></i> Google Web Search';
            aiMenu.appendChild(googleLink);
            
            aiWrapper.appendChild(aiMenu);
            tdName.appendChild(aiWrapper);
        } else {
            tdName.textContent = comp.name;
        }
        tr.appendChild(tdName);
        
        // Dynamic visible fields
        visibleColumns.forEach(col => {
            const td = document.createElement('td');
            const val = comp.data[col];
            
            if (val !== undefined && val !== null && val !== '') {
                td.textContent = val;
                // Align numbers to the right
                const cleaned = val.replace(/,/g, '').trim();
                if (!isNaN(parseFloat(cleaned)) && isFinite(cleaned)) {
                    td.className = 'text-right';
                }
            } else {
                td.textContent = '-';
                td.style.color = 'var(--text-muted)';
            }
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    });
}

/* ==========================================
   TABLE COLUMN SORTING ENGINE
   ========================================== */
function sortTable(columnName) {
    if (currentSortColumn === columnName) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = columnName;
        currentSortOrder = 'asc';
    }
    
    accumulatedCompanies.sort((a, b) => {
        let valA, valB;
        if (columnName === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        } else {
            valA = a.data[columnName] || '';
            valB = b.data[columnName] || '';
        }
        
        // Clean numeric symbols
        const cleanNum = (str) => {
            if (typeof str !== 'string') return str;
            return parseFloat(str.replace(/,/g, '').trim());
        };
        
        const numA = cleanNum(valA);
        const numB = cleanNum(valB);
        
        const isNumA = !isNaN(numA) && isFinite(numA);
        const isNumB = !isNaN(numB) && isFinite(numB);
        
        if (isNumA && isNumB) {
            return currentSortOrder === 'asc' ? numA - numB : numB - numA;
        }
        
        // String sort fallback
        const strA = valA.toString();
        const strB = valB.toString();
        
        if (currentSortOrder === 'asc') {
            return strA.localeCompare(strB);
        } else {
            return strB.localeCompare(strA);
        }
    });
    
    renderTable();
}

/* ==========================================
   METRICS STATISTICS UPDATING
   ========================================== */
function updateStats() {
    const statCompanies = document.getElementById('stat-companies');
    const statColumns = document.getElementById('stat-columns');
    const statBatches = document.getElementById('stat-batches');
    
    if (statCompanies) statCompanies.textContent = accumulatedCompanies.length;
    if (statColumns) statColumns.textContent = allColumns.length;
    if (statBatches) statBatches.textContent = batchesCount;
}

/* ==========================================
   CLEAR STATE
   ========================================== */
function clearAllData() {
    if (confirm('Are you sure you want to clear all extracted data? This will clear the table, custom indicators, and reset statistics.')) {
        accumulatedCompanies = [];
        allColumns = [];
        visibleColumns.clear();
        customColumns = [];
        batchesCount = 0;
        currentSortColumn = null;
        
        renderTableHeaders();
        renderTable();
        updateStats();
        
        // Clear LocalStorage cache
        localStorage.removeItem('screener_companies');
        localStorage.removeItem('screener_visible_cols');
        localStorage.removeItem('screener_batches');
        localStorage.removeItem('screener_custom_cols');
        
        // Re-sync UI checklists
        updateColumnCheckboxes();
        
        showToast('All extractor records and configurations cleared successfully', 'success');
    }
}

/* ==========================================
   LOCALSTORAGE CACHING HANDLERS
   ========================================== */
function saveToLocalStorage() {
    localStorage.setItem('screener_companies', JSON.stringify(accumulatedCompanies));
    localStorage.setItem('screener_visible_cols', JSON.stringify(Array.from(visibleColumns)));
    localStorage.setItem('screener_batches', batchesCount.toString());
    localStorage.setItem('screener_custom_cols', JSON.stringify(customColumns));
}

function loadFromLocalStorage() {
    const cachedCompanies = localStorage.getItem('screener_companies');
    const cachedCols = localStorage.getItem('screener_visible_cols');
    const cachedBatches = localStorage.getItem('screener_batches');
    const cachedCustom = localStorage.getItem('screener_custom_cols');
    
    if (cachedCompanies) {
        accumulatedCompanies = JSON.parse(cachedCompanies);
    }
    if (cachedCustom) {
        customColumns = JSON.parse(cachedCustom);
    }
    if (cachedBatches) {
        batchesCount = parseInt(cachedBatches, 10);
    }
    
    // Resync visible columns list based on parsed records
    updateActiveColumns();
    
    if (cachedCols) {
        const colsArr = JSON.parse(cachedCols);
        visibleColumns = new Set(colsArr.filter(c => allColumns.includes(c)));
        updateColumnCheckboxes();
    }
    
    renderTableHeaders();
    renderTable();
    updateStats();
}

/* ==========================================
   CSV EXPORT ROUTINES
   ========================================== */
function exportToCSVString() {
    if (accumulatedCompanies.length === 0) return '';
    
    const activeColsArr = Array.from(visibleColumns);
    
    // Prepare headers row
    const headers = ['S.No.', 'Company Name', ...activeColsArr];
    let csvContent = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
    
    // Prepare data rows
    accumulatedCompanies.forEach((comp, idx) => {
        const row = [
            idx + 1,
            comp.name,
            ...activeColsArr.map(col => {
                const val = comp.data[col] || '';
                return val;
            })
        ];
        csvContent += row.map(v => `"${v.toString().replace(/"/g, '""')}"`).join(',') + '\n';
    });
    
    return csvContent;
}

/* ==========================================
   CSV EXPORTS TRIGGER UTILS
   ========================================== */
function downloadCSV() {
    const csvContent = exportToCSVString();
    if (!csvContent) {
        showToast('No records available to export', 'danger');
        return;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `screener_extracted_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV export downloaded successfully', 'success');
}

function copyCSV() {
    const csvContent = exportToCSVString();
    if (!csvContent) {
        showToast('No records available to copy', 'danger');
        return;
    }
    
    navigator.clipboard.writeText(csvContent).then(() => {
        showToast('All active table columns copied to clipboard as CSV format!', 'success');
    }).catch(err => {
        showToast('Failed to copy to clipboard: ' + err, 'danger');
    });
}
