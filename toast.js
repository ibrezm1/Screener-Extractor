/* ==========================================
   TOAST NOTIFICATION ENGINE
   ========================================== */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
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
