export const Utils = {
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        const kind = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        notification.classList.remove('hidden', 'info', 'success', 'warning', 'error');
        notification.classList.add(kind);
        notification.textContent = message;
        clearTimeout(notification._timer);
        notification._timer = setTimeout(() => notification.classList.add('hidden'), 5000);
    }
};
