/*────────────────────────────────────────────
  js/utils.js
  Общие вспомогательные функции для всего приложения.
─────────────────────────────────────────────*/

/**
 * Показывает всплывающее уведомление.
 * @param {string} message - Текст сообщения.
 * @param {string} type - Тип уведомления ('success' или 'error').
 */
export function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-root');
  if (!container) return;

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  
  const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
  notification.innerHTML = `
    <i class="fas ${iconClass}"></i>
    <span>${message}</span>
  `;

  container.appendChild(notification);

  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  setTimeout(() => {
    notification.classList.remove('show');
    notification.addEventListener('transitionend', () => notification.remove());
  }, 4000);
}

/**
 * Форматирует число в валютный формат RUB.
 * @param {number} value - Число для форматирования.
 * @returns {string} - Отформатированная строка.
 */
export function formatCurrency(value) {
  if (typeof value !== 'number' || isNaN(value)) {
    value = 0;
  }
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Форматирует дату в формат "ДД.ММ.ГГГГ".
 * @param {Date | string | number} date - Дата для форматирования.
 * @returns {string} - Отформатированная строка.
 */
export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU');
}

/**
 * Создает простой HTML-элемент.
 * @param {string} tag - HTML-тег.
 * @param {object} [options] - Опции для элемента.
 * @returns {HTMLElement} - Созданный элемент.
 */
export function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.id) element.id = options.id;
  if (options.textContent) element.textContent = options.textContent;
  if (options.dataset) {
    for (const key in options.dataset) {
      element.dataset[key] = options.dataset[key];
    }
  }
  return element;
}

/**
 * Возвращает правильное окончание для числительных.
 * @param {number} number - Число.
 * @returns {string} - Правильное окончание.
 */
export function getEndings(number, one, two, five) {
    let n = Math.abs(number);
    n %= 100;
    if (n >= 5 && n <= 20) return five;
    n %= 10;
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return two;
    return five;
}

/**
 * Инициирует скачивание файла CSV.
 * @param {string} csvContent - Содержимое CSV файла.
 * @param {string} fileName - Имя файла для скачивания.
 */
export function downloadCSV(csvContent, fileName) {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
