/* ==========================================
   EXTRACTION LOGIC & UTILITIES
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
        const code = match[1].toUpperCase();
        // If the code is purely numeric (e.g., 511644), it belongs to BSE (BOM)
        if (/^\d+$/.test(code)) {
            return `https://www.google.com/finance/beta/quote/${code}:BOM`;
        }
        // Otherwise it is NSE
        return `https://www.google.com/finance/beta/quote/${code}:NSE`;
    }
    return '';
}

async function openScanX(screenerUrl) {
    // Extract company code
    const match = screenerUrl.match(/\/company\/([A-Z0-9_\-]+)/i);
    if (!match || !match[1]) {
        showToast('Could not extract company code for ScanX search', 'danger');
        return;
    }
    const code = match[1].toUpperCase();
    
    showToast(`Searching ScanX for "${code}"...`, 'info');
    
    const payload = {
        UserId: "Dhanweb",
        UserType: "C",
        Source: "X",
        Data: JSON.stringify({
            inst: "EQUITY",
            searchterm: code,
            exch: "",
            optionflag: false
        }),
        broker_code: "DHN1804"
    };
    
    try {
        const response = await fetch('https://scanx-search.dhan.co/Search/api/Search/Scrip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*'
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        if (result && result.code === "0" && result.data && result.data.length > 0) {
            const seoSymbol = result.data[0].Seo_symbol_s;
            if (seoSymbol) {
                window.open(`https://scanx.trade/company/${seoSymbol}`, '_blank');
                return;
            }
        }
        
        // Fallback if scrip not found on Dhan
        showToast(`Company "${code}" not found on ScanX. Using Google Search fallback...`, 'warning');
        window.open(`https://www.google.com/search?q=site:scanx.trade+${code}`, '_blank');
    } catch (err) {
        console.error('ScanX search error, using Google Search fallback...', err);
        // Fallback: search on google for the company scanx page
        window.open(`https://www.google.com/search?q=site:scanx.trade+${code}`, '_blank');
    }
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
        // Parse headers
        const ths = table.querySelectorAll('thead th');
        ths.forEach(th => {
            headers.push(cleanText(th.textContent));
        });
        
        // Parse rows
        rows = Array.from(table.querySelectorAll('tbody tr'));
    }
    
    if (rows.length === 0) {
        // Fallback if no table tag is structured nicely (e.g. paste of plain rows)
        const tempDiv = doc.createElement('div');
        tempDiv.innerHTML = htmlString;
        const trs = tempDiv.querySelectorAll('tr');
        if (trs.length > 0) {
            rows = Array.from(trs);
        }
    }
    
    // Match header indices
    let snoColIndex = -1;
    let nameColIndex = -1;
    
    headers.forEach((h, idx) => {
        const text = h.toLowerCase();
        if (text === 's.no.' || text === 's.no' || text === 'sno') {
            snoColIndex = idx;
        } else if (text === 'name' || text === 'company name' || text === 'company') {
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
