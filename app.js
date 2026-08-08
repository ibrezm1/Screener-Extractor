/* ==========================================
   STATE MANAGEMENT
   ========================================== */
let accumulatedCompanies = [];
let allColumns = [];
let visibleColumns = new Set();
let batchesCount = 0;
let customColumns = [];

// Sorting state
let currentSortColumn = null;
let currentSortOrder = 'asc';

/* ==========================================
   DOM ELEMENTS
   ========================================== */
const htmlInput = document.getElementById('html-input');
const extractBtn = document.getElementById('extract-btn');
const clearInputBtn = document.getElementById('clear-input-btn');
const themeBtn = document.getElementById('theme-btn');
const tableSearch = document.getElementById('table-search');
const columnFilterBtn = document.getElementById('column-filter-btn');
const columnSelectorDropdown = document.getElementById('column-selector-dropdown');
const columnsCheckboxList = document.getElementById('columns-checkbox-list');
const selectAllColsBtn = document.getElementById('select-all-columns');
const deselectAllColsBtn = document.getElementById('deselect-all-columns');
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');
const clearTableBtn = document.getElementById('clear-table-btn');
const tableBody = document.getElementById('table-body');
const tableHeaderRow = document.getElementById('table-header-row');

// Custom Indicator Modal Elements
const indicatorModal = document.getElementById('indicator-modal');
const addIndicatorBtn = document.getElementById('add-indicator-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelIndicatorBtn = document.getElementById('cancel-indicator-btn');
const saveIndicatorBtn = document.getElementById('save-indicator-btn');
const indicatorNameInput = document.getElementById('indicator-name');
const indicatorFormulaInput = document.getElementById('indicator-formula');
const modalColumnsList = document.getElementById('modal-columns-list');

// Stats elements
const statCompanies = document.getElementById('stat-companies');
const statColumns = document.getElementById('stat-columns');
const statBatches = document.getElementById('stat-batches');

// Drag and drop wrappers
const textareaWrapper = document.querySelector('.textarea-wrapper');

/* ==========================================
   INITIALIZATION
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadFromLocalStorage();
    setupEventListeners();
    initBookmarklet();
    
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
   EVENT LISTENERS Setup
   ========================================== */
function setupEventListeners() {
    // Theme Toggle
    themeBtn.addEventListener('click', toggleTheme);

    // Extraction actions
    extractBtn.addEventListener('click', handleExtraction);
    clearInputBtn.addEventListener('click', () => {
        htmlInput.value = '';
        showToast('Input area cleared', 'info');
    });

    // Drag and Drop files
    textareaWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        textareaWrapper.classList.add('dragover');
    });

    textareaWrapper.addEventListener('dragleave', () => {
        textareaWrapper.classList.remove('dragover');
    });

    textareaWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        textareaWrapper.classList.remove('dragover');
        
        if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === "text/html") {
                const reader = new FileReader();
                reader.onload = (event) => {
                    htmlInput.value = event.target.result;
                    showToast(`File "${file.name}" loaded successfully!`, 'success');
                };
                reader.readAsText(file);
            } else {
                showToast('Please drop a valid HTML file.', 'danger');
            }
        }
    });

    // Table search/filtering
    tableSearch.addEventListener('input', renderTable);

    // Column visibility manager
    columnFilterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        columnSelectorDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!columnSelectorDropdown.contains(e.target) && e.target !== columnFilterBtn) {
            columnSelectorDropdown.classList.add('hidden');
        }
    });

    selectAllColsBtn.addEventListener('click', () => {
        allColumns.forEach(col => visibleColumns.add(col));
        updateColumnCheckboxes();
        renderTableHeaders();
        renderTable();
        saveToLocalStorage();
    });

    deselectAllColsBtn.addEventListener('click', () => {
        visibleColumns.clear();
        updateColumnCheckboxes();
        renderTableHeaders();
        renderTable();
        saveToLocalStorage();
    });

    // Export & Clear actions
    copyBtn.addEventListener('click', copyCSVToClipboard);
    downloadBtn.addEventListener('click', downloadCSV);
    clearTableBtn.addEventListener('click', confirmClearTable);

    // Custom Indicator Actions
    addIndicatorBtn.addEventListener('click', openIndicatorModal);
    closeModalBtn.addEventListener('click', closeIndicatorModal);
    cancelIndicatorBtn.addEventListener('click', closeIndicatorModal);
    saveIndicatorBtn.addEventListener('click', saveCustomIndicator);

    // Listen for incoming Screener HTML from bookmarklet
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'SCREENER_HTML') {
            htmlInput.value = e.data.html;
            handleExtraction();
            showToast('Data received automatically from bookmarklet!', 'success');
        }
    });
}

/* ==========================================
   THEME SWITCHING
   ========================================== */
function toggleTheme() {
    const isDark = document.body.classList.contains('dark-theme');
    if (isDark) {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeBtn.innerHTML = '<i class="ti ti-moon"></i>';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        themeBtn.innerHTML = '<i class="ti ti-sun"></i>';
        localStorage.setItem('theme', 'dark');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        themeBtn.innerHTML = '<i class="ti ti-moon"></i>';
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        themeBtn.innerHTML = '<i class="ti ti-sun"></i>';
    }
}

/* ==========================================
   EXTRACTION LOGIC
   ========================================== */
function cleanText(text) {
    if (!text) return "";
    return text.replace(/\s+/g, ' ').trim();
}

function getGoogleFinanceUrl(screenerUrl) {
    if (!screenerUrl) return '';
    // Extract company code from Screener URL (e.g. /company/GMBREW/ -> GMBREW)
    const match = screenerUrl.match(/\/company\/([A-Z0-9_\-]+)/i);
    if (match && match[1]) {
        return `https://www.google.com/finance/beta/quote/${match[1].toUpperCase()}:NSE`;
    }
    return '';
}

function parseScreenerHTML(htmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    // Find table element
    let table = doc.querySelector('table.data-table');
    if (!table) {
        table = doc.querySelector('table');
    }
    
    let rows = [];
    let headers = [];
    
    if (table) {
        // Grab header fields from first row of table (usually contains th tags)
        const thElements = table.querySelectorAll('th');
        if (thElements.length > 0) {
            headers = Array.from(thElements).map(th => cleanText(th.textContent));
        }
        rows = Array.from(table.querySelectorAll('tr'));
    } else {
        // Fallback: search row structures directly
        rows = Array.from(doc.querySelectorAll('tr'));
        const firstRowThs = doc.querySelectorAll('tr th');
        if (firstRowThs.length > 0) {
            headers = Array.from(firstRowThs).map(th => cleanText(th.textContent));
        }
    }
    
    if (rows.length === 0) {
        throw new Error("No table rows could be identified in the pasted content.");
    }
    
    // Identify S.No and Name columns
    let nameColIndex = -1;
    let snoColIndex = -1;
    
    headers.forEach((h, idx) => {
        if (/s\.?\s*no/i.test(h)) {
            snoColIndex = idx;
        } else if (/name/i.test(h)) {
            nameColIndex = idx;
        }
    });
    
    // Default fallback indices if headers could not be fully parsed
    if (snoColIndex === -1 && headers.length > 0) snoColIndex = 0;
    if (nameColIndex === -1 && headers.length > 1) nameColIndex = 1;
    
    const parsedCompanies = [];
    
    rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length === 0) return; // Skip headers / spacer rows
        
        const companyId = row.getAttribute('data-row-company-id') || '';
        
        let companyName = "";
        let companyUrl = "";
        
        // Find anchor linking to the company profile page
        const companyAnchor = row.querySelector('a[href*="/company/"]');
        if (companyAnchor) {
            companyName = cleanText(companyAnchor.textContent);
            companyUrl = companyAnchor.getAttribute('href');
            if (companyUrl.startsWith('/')) {
                companyUrl = 'https://www.screener.in' + companyUrl;
            }
        }
        
        // Fallback using name index if anchor is missing or structured differently
        if (!companyName && nameColIndex !== -1 && tds[nameColIndex]) {
            companyName = cleanText(tds[nameColIndex].textContent);
            const anchor = tds[nameColIndex].querySelector('a');
            if (anchor) {
                companyUrl = anchor.getAttribute('href');
                if (companyUrl.startsWith('/')) {
                    companyUrl = 'https://www.screener.in' + companyUrl;
                }
            }
        }
        
        // Skip row if we couldn't resolve a valid company name
        if (!companyName) return;
        
        const companyData = {};
        
        tds.forEach((td, idx) => {
            if (idx === snoColIndex || idx === nameColIndex) return;
            
            const headerName = headers[idx];
            if (headerName) {
                companyData[headerName] = cleanText(td.textContent);
            }
        });
        
        parsedCompanies.push({
            id: companyId,
            name: companyName,
            url: companyUrl,
            data: companyData
        });
    });
    
    // Return extracted list and only metrics columns (excluding S.No & Name)
    const metricsHeaders = headers.filter((h, idx) => h && idx !== snoColIndex && idx !== nameColIndex);
    return {
        companies: parsedCompanies,
        headers: metricsHeaders
    };
}

function handleExtraction() {
    const rawHTML = htmlInput.value.trim();
    if (!rawHTML) {
        showToast('Please paste some HTML content first!', 'warning');
        return;
    }
    
    try {
        const { companies, headers } = parseScreenerHTML(rawHTML);
        
        if (companies.length === 0) {
            showToast('No company rows found in pasted HTML structure.', 'danger');
            return;
        }
        
        const dedupStrategy = document.getElementById('dedup-strategy').value;
        const dedupKey = document.getElementById('dedup-key').value;
        
        let skipped = 0;
        let overwritten = 0;
        let added = 0;
        
        companies.forEach(newComp => {
            let matchIdx = -1;
            
            if (dedupKey === 'name') {
                matchIdx = accumulatedCompanies.findIndex(
                    c => c.name.toLowerCase() === newComp.name.toLowerCase()
                );
            } else {
                matchIdx = accumulatedCompanies.findIndex(
                    c => c.url && newComp.url && c.url.toLowerCase() === newComp.url.toLowerCase()
                );
            }
            
            if (matchIdx !== -1) {
                if (dedupStrategy === 'skip') {
                    skipped++;
                } else if (dedupStrategy === 'overwrite') {
                    // Overwrite values but merge columns in case different lists were used
                    accumulatedCompanies[matchIdx].data = {
                        ...accumulatedCompanies[matchIdx].data,
                        ...newComp.data
                    };
                    if (newComp.id) accumulatedCompanies[matchIdx].id = newComp.id;
                    if (newComp.url) accumulatedCompanies[matchIdx].url = newComp.url;
                    overwritten++;
                } else {
                    // keep/duplicate
                    accumulatedCompanies.push(newComp);
                    added++;
                }
            } else {
                accumulatedCompanies.push(newComp);
                added++;
            }
        });
        
        batchesCount++;
        
        // Sync Columns
        updateActiveColumns(headers);
        
        // Save & Render
        saveToLocalStorage();
        renderTableHeaders();
        renderTable();
        updateStats();
        
        // Feedback toast
        let summaryMsg = `Extracted ${companies.length} records. `;
        if (added > 0) summaryMsg += `Added: ${added}. `;
        if (overwritten > 0) summaryMsg += `Overwrote: ${overwritten}. `;
        if (skipped > 0) summaryMsg += `Skipped: ${skipped}. `;
        
        showToast(summaryMsg, 'success');
        
        // Clear input area to signal completion
        htmlInput.value = '';
        
    } catch (err) {
        console.error(err);
        showToast(`Extraction failed: ${err.message}`, 'danger');
    }
}

/* ==========================================
   COLUMNS MANAGEMENT
   ========================================== */
function updateActiveColumns(newHeaders = []) {
    computeCustomColumns();
    const colSet = new Set();
    
    // Find all metrics columns present in current companies
    accumulatedCompanies.forEach(comp => {
        Object.keys(comp.data).forEach(col => {
            colSet.add(col);
        });
    });
    
    allColumns = Array.from(colSet);
    
    // Determine new visible columns (all existing visible columns, plus any newly parsed ones)
    const nextVisible = new Set();
    
    allColumns.forEach(col => {
        if (visibleColumns.has(col) || newHeaders.includes(col) || visibleColumns.size === 0) {
            nextVisible.add(col);
        }
    });
    
    // Special check: if visibleColumns was empty but we have columns now, show all by default
    if (visibleColumns.size === 0 && allColumns.length > 0) {
        allColumns.forEach(c => nextVisible.add(c));
    }
    
    visibleColumns = nextVisible;
    updateColumnCheckboxes();
}

function updateColumnCheckboxes() {
    columnsCheckboxList.innerHTML = '';
    
    if (allColumns.length === 0) {
        columnsCheckboxList.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.8rem;">No custom columns loaded</div>';
        return;
    }
    
    allColumns.forEach(col => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        
        const leftWrap = document.createElement('div');
        leftWrap.className = 'dropdown-item-left';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = visibleColumns.has(col);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                visibleColumns.add(col);
            } else {
                visibleColumns.delete(col);
            }
            renderTableHeaders();
            renderTable();
            saveToLocalStorage();
        });
        
        const span = document.createElement('span');
        span.textContent = col;
        
        leftWrap.appendChild(checkbox);
        leftWrap.appendChild(span);
        label.appendChild(leftWrap);
        
        const isCustom = customColumns.some(cc => cc.name === col);
        if (isCustom) {
            label.classList.add('custom-col-item');
            
            const rightWrap = document.createElement('div');
            rightWrap.className = 'dropdown-item-right';
            
            const badge = document.createElement('span');
            badge.className = 'col-badge';
            badge.textContent = 'Custom';
            rightWrap.appendChild(badge);
            
            const deleteIcon = document.createElement('button');
            deleteIcon.className = 'btn-col-delete';
            deleteIcon.title = 'Delete custom column';
            deleteIcon.innerHTML = '<i class="ti ti-trash"></i>';
            deleteIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm(`Are you sure you want to delete the custom column "${col}"?`)) {
                    deleteCustomColumn(col);
                }
            });
            rightWrap.appendChild(deleteIcon);
            label.appendChild(rightWrap);
        }
        
        columnsCheckboxList.appendChild(label);
    });
}

/* ==========================================
   TABLE RENDERING & SORTING
   ========================================== */
function renderTableHeaders() {
    // Keep fixed S.No and Name header, then insert visible columns, then Actions
    const fixedHeaders = `
        <th class="col-fixed-sno sortable" data-col="sno">S.No.</th>
        <th class="col-fixed-name sortable" data-col="name">Company Name</th>
    `;
    
    let dynamicHeaders = '';
    visibleColumns.forEach(col => {
        dynamicHeaders += `<th class="sortable" data-col="${col}">${col}</th>`;
    });
    
    const actionHeader = `<th class="col-actions">Actions</th>`;
    
    tableHeaderRow.innerHTML = fixedHeaders + dynamicHeaders + actionHeader;
    
    // Setup Sort Click Event Listeners
    tableHeaderRow.querySelectorAll('th.sortable').forEach(th => {
        const colName = th.getAttribute('data-col');
        
        // Highlight active sort column
        if (colName === currentSortColumn) {
            th.classList.add(currentSortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
        }
        
        th.addEventListener('click', () => {
            handleHeaderSort(colName);
        });
    });
}

function handleHeaderSort(colName) {
    if (currentSortColumn === colName) {
        // Toggle sort order
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = colName;
        currentSortOrder = 'asc';
    }
    
    renderTableHeaders();
    renderTable();
}

function getCellValue(comp, col) {
    if (col === 'name') return comp.name;
    const val = comp.data[col];
    if (val === undefined || val === null || val === '') return -Infinity; // Push empties to bottom
    
    // Clean currency formatting or commas
    const cleaned = val.replace(/,/g, '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? val : parsed;
}

function renderTable() {
    const query = tableSearch.value.trim().toLowerCase();
    
    // Filter companies
    let filtered = [...accumulatedCompanies];
    if (query) {
        filtered = filtered.filter(comp => 
            comp.name.toLowerCase().includes(query) || 
            (comp.url && comp.url.toLowerCase().includes(query)) ||
            Object.values(comp.data).some(val => val.toLowerCase().includes(query))
        );
    }
    
    // Sort companies
    if (currentSortColumn) {
        filtered.sort((a, b) => {
            let valA, valB;
            
            if (currentSortColumn === 'sno') {
                // Keep original index sorting
                const idxA = accumulatedCompanies.indexOf(a);
                const idxB = accumulatedCompanies.indexOf(b);
                return currentSortOrder === 'asc' ? idxA - idxB : idxB - idxA;
            }
            
            if (currentSortColumn === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else {
                valA = getCellValue(a, currentSortColumn);
                valB = getCellValue(b, currentSortColumn);
            }
            
            if (valA === valB) return 0;
            
            // Keep empty values at the bottom regardless of sort order
            if (valA === -Infinity) return 1;
            if (valB === -Infinity) return -1;
            
            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    // Render rows
    tableBody.innerHTML = '';
    
    if (filtered.length === 0) {
        const colCount = 3 + visibleColumns.size;
        tableBody.innerHTML = `
            <tr class="empty-state-row">
                <td colspan="${colCount}" class="empty-state">
                    <div class="empty-state-content">
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
                    td.style.textAlign = 'right';
                }
            } else {
                td.textContent = '-';
                td.style.color = 'var(--text-muted)';
                td.style.textAlign = 'center';
            }
            tr.appendChild(td);
        });
        
        // Actions
        const tdActions = document.createElement('td');
        tdActions.className = 'col-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-row-action';
        deleteBtn.title = 'Remove company';
        deleteBtn.innerHTML = '<i class="ti ti-trash"></i>';
        deleteBtn.addEventListener('click', () => {
            removeCompany(comp);
        });
        
        tdActions.appendChild(deleteBtn);
        tr.appendChild(tdActions);
        
        tableBody.appendChild(tr);
    });
}

function removeCompany(company) {
    const idx = accumulatedCompanies.indexOf(company);
    if (idx !== -1) {
        accumulatedCompanies.splice(idx, 1);
        
        updateActiveColumns();
        saveToLocalStorage();
        renderTableHeaders();
        renderTable();
        updateStats();
        
        showToast(`Removed "${company.name}"`, 'info');
    }
}

/* ==========================================
   STATS COUNTERS
   ========================================== */
function updateStats() {
    statCompanies.textContent = accumulatedCompanies.length;
    statColumns.textContent = allColumns.length;
    statBatches.textContent = batchesCount;
}

/* ==========================================
   CSV EXPORT GENERATOR
   ========================================== */
function generateCSV() {
    if (accumulatedCompanies.length === 0) return '';
    
    // Columns to export are Name, URL, and visible metric headers
    const headers = ['Company Name', 'Company URL', ...Array.from(visibleColumns)];
    const csvRows = [headers];
    
    accumulatedCompanies.forEach(comp => {
        const row = [
            comp.name,
            comp.url || ''
        ];
        
        visibleColumns.forEach(col => {
            row.push(comp.data[col] || '');
        });
        
        csvRows.push(row);
    });
    
    // Format values safely (escaping quotes, commas, newlines)
    return csvRows.map(row => 
        row.map(val => {
            let cell = val.replace(/"/g, '""');
            if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
                cell = `"${cell}"`;
            }
            return cell;
        }).join(',')
    ).join('\r\n');
}

function copyCSVToClipboard() {
    const csvContent = generateCSV();
    if (!csvContent) {
        showToast('No data to export. Paste some HTML first!', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(csvContent).then(() => {
        showToast('CSV successfully copied to clipboard!', 'success');
    }).catch(err => {
        showToast(`Failed to copy CSV: ${err}`, 'danger');
    });
}

function downloadCSV() {
    const csvContent = generateCSV();
    if (!csvContent) {
        showToast('No data to export. Paste some HTML first!', 'warning');
        return;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    // Filename timestamped
    const dateStr = new Date().toISOString().slice(0,10);
    link.setAttribute("href", url);
    link.setAttribute("download", `screener_extractor_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Download started!', 'success');
}

function confirmClearTable() {
    if (accumulatedCompanies.length === 0) {
        showToast('Table is already empty!', 'info');
        return;
    }
    
    const verified = confirm("Are you sure you want to clear all accumulated company data? This cannot be undone.");
    if (verified) {
        accumulatedCompanies = [];
        allColumns = [];
        visibleColumns.clear();
        batchesCount = 0;
        
        saveToLocalStorage();
        updateColumnCheckboxes();
        renderTableHeaders();
        renderTable();
        updateStats();
        
        showToast('All data cleared.', 'info');
    }
}

/* ==========================================
   LOCALSTORAGE CACHING
   ========================================== */
function saveToLocalStorage() {
    localStorage.setItem('screener_companies', JSON.stringify(accumulatedCompanies));
    localStorage.setItem('screener_visible_cols', JSON.stringify(Array.from(visibleColumns)));
    localStorage.setItem('screener_batches', batchesCount);
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
    
    // Resync total column dictionary based on parsed companies
    updateActiveColumns();
    
    if (cachedCols) {
        const colsArr = JSON.parse(cachedCols);
        // Clean missing columns if any
        visibleColumns = new Set(colsArr.filter(c => allColumns.includes(c)));
        updateColumnCheckboxes();
    }
    
    renderTableHeaders();
    renderTable();
    updateStats();
}

/* ==========================================
   CUSTOM COLUMNS / INDICATORS ENGINE
   ========================================== */
function openIndicatorModal() {
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
    indicatorModal.classList.add('hidden');
}

function insertAtCursor(input, text) {
    const startPos = input.selectionStart;
    const endPos = input.selectionEnd;
    const val = input.value;
    input.value = val.substring(0, startPos) + text + val.substring(endPos, val.length);
    input.selectionStart = input.selectionEnd = startPos + text.length;
    input.focus();
}

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

function computeCustomColumns() {
    accumulatedCompanies.forEach(comp => {
        customColumns.forEach(cc => {
            comp.data[cc.name] = evaluateFormula(cc.formula, comp.data);
        });
    });
}

function saveCustomIndicator() {
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

/* ==========================================
   TOAST NOTIFICATION ENGINE
   ========================================== */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'ti-info-circle';
    if (type === 'success') iconClass = 'ti-circle-check';
    if (type === 'danger') iconClass = 'ti-alert-circle';
    if (type === 'warning') iconClass = 'ti-alert-triangle';
    
    toast.innerHTML = `
        <i class="ti ${iconClass}"></i>
        <div class="toast-message">${message}</div>
        <button class="toast-close"><i class="ti ti-x"></i></button>
    `;
    
    // Close on button click
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    });
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

/* ==========================================
   BOOKMARKLET ENGINE
   ========================================== */
function initBookmarklet() {
    const bookmarkletLink = document.getElementById('bookmarklet-link');
    if (!bookmarkletLink) return;
    
    const bookmarkletCode = `javascript:(function(){
        const table = document.querySelector('table.data-table') || document.querySelector('table');
        if(!table){
            alert('No data table found on this page.');
            return;
        }
        const html = document.documentElement.outerHTML;
        navigator.clipboard.writeText(html).then(function() {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;z-index:99999;font-family:sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;font-size:14px;font-weight:bold;';
            div.textContent = 'Screener HTML Copied!';
            document.body.appendChild(div);
            setTimeout(function(){
                div.style.opacity = '0';
                setTimeout(function(){ div.remove(); }, 300);
            }, 2000);
        }).catch(function(err) {
            alert('Failed to copy: ' + err);
        });
    })();`.replace(/\s+/g, ' ');
    
    bookmarkletLink.href = bookmarkletCode;
}
