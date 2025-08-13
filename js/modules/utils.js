/*────────────────────────────────────────────
  js/modules/utils.js
  Вспомогательные утилиты.
─────────────────────────────────────────────*/

export const formatCurrency = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);

export const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('ru-RU');

export const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    const options = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    };
    return date.toLocaleString('ru-RU', options);
};

export function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-root');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-times-circle'}"></i><span>${message}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3000);
};

export function downloadCSV(data, filename) {
    if (!data || data.length === 0) {
        showNotification('Нет данных для экспорта.', 'error');
        return;
    }
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(h => JSON.stringify(row[h])).join(','))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
};

export function canEditOrder(order, user) {
  if (!user || !order || !order.createdAt) return false;

  const orderAge = Date.now() - new Date(order.createdAt).getTime();
  const twoHours = 2 * 60 * 60 * 1000;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER') {
    return orderAge < sevenDays;
  }

  if (user.role === 'MASTER') {
    return order.masterName === user.name && orderAge < twoHours;
  }

  return false;
}
