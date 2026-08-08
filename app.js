/* ==========================================
   STATE MANAGEMENT
   ========================================== */
let accumulatedCompanies = [];
let allColumns = [];
let visibleColumns = new Set();
let batchesCount = 0;

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
        
        label.appendChild(checkbox);
        label.appendChild(span);
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
}

function loadFromLocalStorage() {
    const cachedCompanies = localStorage.getItem('screener_companies');
    const cachedCols = localStorage.getItem('screener_visible_cols');
    const cachedBatches = localStorage.getItem('screener_batches');
    
    if (cachedCompanies) {
        accumulatedCompanies = JSON.parse(cachedCompanies);
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
