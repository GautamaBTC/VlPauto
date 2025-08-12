/*────────────────────────────────────────────
  js/modules/app.js
  Основной файл приложения (точка входа).
  Отвечает за инициализацию приложения.
─────────────────────────────────────────────*/

import { state } from './state.js';
import { initSocketConnection } from './socket.js';
import { initEventListeners, handleAction, handleTabSwitch } from './handlers.js';
import { showNotification } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) return;
    initTheme();
    initSocketConnection();
    initEventListeners();

    // Определяем начальную вкладку, но пока не активируем ее
    const savedTabId = localStorage.getItem('vipauto_active_tab') || 'home';
    const tabToActivate = document.querySelector(`.nav-tab[data-tab="${savedTabId}"]`);

    if (tabToActivate && getComputedStyle(tabToActivate).display !== 'none') {
      state.activeTab = savedTabId;
    } else {
      state.activeTab = 'home';
    }

    // Глобальный обработчик кликов для data-action и data-tab
    document.body.addEventListener('click', (e) => {
      const actionTarget = e.target.closest('[data-action]');
      const tabTarget = e.target.closest('[data-tab]');
      if (actionTarget) handleAction(actionTarget);
      if (tabTarget) handleTabSwitch(tabTarget);
    });

  } catch (error) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА:", error);
    logout();
  }
});

function initAuth() {
  state.token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
  const userDataString = localStorage.getItem('vipauto_user') || sessionStorage.getItem('vipauto_user');

  if (!state.token || !userDataString) {
    logout();
    return false;
  }

  try {
    state.user = JSON.parse(userDataString);
    document.getElementById('user-name-display').textContent = state.user.name;
    document.body.classList.toggle('is-privileged', state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER');
  } catch(e) {
    logout();
    return false;
  }
  return true;
}

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeToggle) {
    themeToggle.checked = savedTheme === 'light';
    themeToggle.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('vipauto_theme', newTheme);
    });
  }
}

export function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
