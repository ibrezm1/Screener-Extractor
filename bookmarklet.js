/* ==========================================
   BOOKMARKLET ENGINE
   ========================================== */
function initBookmarklet() {
    const autoLink = document.getElementById('bookmarklet-auto');
    const copyLink = document.getElementById('bookmarklet-copy');
    
    const currentUrl = window.location.href.split('?')[0];
    
    if (autoLink) {
        autoLink.href = `javascript:(function(){
            const table = document.querySelector('table.data-table') || document.querySelector('table');
            if(!table){
                alert('No data table found on this page. Please run this bookmarklet while viewing a table on screener.in.');
                return;
            }
            const html = document.documentElement.outerHTML;
            
            if ('${currentUrl}'.startsWith('file://')) {
                navigator.clipboard.writeText(html).then(function() {
                    alert('Web browsers block opening local file:// paths from internet sites for security.\\n\\nHowever, the table HTML has been copied to your clipboard! Switch to your Screener Extractor tab and paste it (Ctrl+V or Cmd+V).');
                }).catch(function(err) {
                    alert('Failed to automatically copy to clipboard. Please copy page source manually.');
                });
                return;
            }
            
            const appWin = window.open('${currentUrl}', 'screener_extractor');
            if(!appWin){
                alert('Popup blocked! Please allow popups for screener.in to send data to the extractor.');
                return;
            }
            
            appWin.postMessage({type: 'SCREENER_HTML', html: html}, '*');
            
            const onMsg = (e) => {
                if(e.source === appWin && e.data && e.data.type === 'READY'){
                    appWin.postMessage({type: 'SCREENER_HTML', html: html}, '*');
                    window.removeEventListener('message', onMsg);
                }
            };
            window.addEventListener('message', onMsg);
            
            setTimeout(() => {
                appWin.postMessage({type: 'SCREENER_HTML', html: html}, '*');
            }, 1000);
        })();`.replace(/\s+/g, ' ');
    }
    
    if (copyLink) {
        copyLink.href = `javascript:(function(){
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
    }
}

// Automatically compile bookmarklet links on load
document.addEventListener('DOMContentLoaded', () => {
    initBookmarklet();
});
