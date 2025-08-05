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

  // Появление
  requestAnimationFrame(() => {
    notification.classList.add('show');
  });

  // Автоматическое скрытие
  setTimeout(() => {
    notification.classList.remove('show');
    // Удаление из DOM после завершения анимации
    notification.addEventListener('transitionend', () => notification.remove());
  }, 4000);
}

/**
 * Форматирует число в валютный формат RUB.
 * @param {number} value - Число для форматирования.
 * @returns {string} - Отформатированная строка.
 */
export function formatCurrency(value) {
  if (typeof value !== 'number') {
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
  return new Date(date).toLocaleDateString('ru-RU');
}

/**
 * Создает простой элемент с классом и текстом.
 * @param {string} tag - HTML-тег.
 * @param {string} className - CSS-класс.
 * @param {string} [textContent] - Текстовое содержимое.
 * @returns {HTMLElement} - Созданный элемент.
 */
export function createElement(tag, className, textContent) {
  const element = document.createElement(tag);
  element.className = className;
  if (textContent) {
    element.textContent = textContent;
  }
  return element;
}
