/*────────────────────────────────────────────
  js/modules/socket.js
  Управление WebSocket соединением и событиями.
─────────────────────────────────────────────*/

import { state } from './state.js';
import { showNotification } from './utils.js';
import { updateAndRender } from './ui.js';

export function initSocketConnection() {
  state.socket = io({ auth: { token: state.token } });

  state.socket.on('connect', () => {
    console.log('Подключено к серверу.');
  });

  state.socket.on('connect_error', (err) => {
    console.error('Socket connect_error:', err);
  });

  state.socket.on('initialData', (data) => {
    updateAndRender(data, true);
  });

  state.socket.on('dataUpdate', (data) => {
    updateAndRender(data);
    showNotification('Данные обновлены', 'success');
  });

  state.socket.on('serverError', (msg) => {
    showNotification(msg, 'error');
  });

  state.socket.on('clientSearchResults', (results) => {
    const activeResultsContainer = document.querySelector('.search-results-list.active');
    if (!activeResultsContainer) return;

    if (results.length === 0) {
        activeResultsContainer.innerHTML = '<div class="search-result-item disabled">Совпадений не найдено</div>';
        return;
    }

    activeResultsContainer.innerHTML = results.map(client =>
        `<div class="search-result-item" data-id="${client.id}" data-name="${client.name}" data-phone="${client.phone}">
            <strong>${client.name}</strong> (${client.phone})
         </div>`
    ).join('');
  });
}
