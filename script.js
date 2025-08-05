/*────────────────────────────────────────────
  script.js
  Основной скрипт для бортового журнала VIPавто.
  Реализует ролевую модель и взаимодействие с сервером.
─────────────────────────────────────────────*/

import { showNotification, formatCurrency, formatDate, createElement } from './js/utils.js';

// URL вашего сервера
const SERVER_URL = 'http://localhost:3000'; // Позже заменим на реальный адрес

// --- Глобальное состояние приложения ---
const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [], // Список мастеров будет приходить с сервера
  todayOrders: [],
  weekOrders: [],
  weekStats: {},
  leaderboard: [],
  salaryData: [],
  archive: [],
};

// --- Инициализация приложения ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (!state.currentUser) return; // Если нет пользователя, ничего не делаем

  initTheme();
  initSocketConnection();
  initUI();
});

/**
 * 1. АУТЕНТИФИКАЦИЯ И ЗАЩИТА СТРАНИЦЫ
 */
function initAuth() {
  state.token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
  const userData = localStorage.getItem('vipauto_user') || sessionStorage.getItem('vipauto_user');

  if (!state.token || !userData) {
    window.location.href = 'login.html'; // Если нет токена, отправляем на логин
    return;
  }
  
  state.currentUser = JSON.parse(userData);
}

/**
 * 2. УПРАВЛЕНИЕ ТЕМОЙ
 */
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;
  
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  htmlEl.setAttribute('data-theme', savedTheme);
  themeToggle.checked = (savedTheme === 'light');

  themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipauto_theme', newTheme);
  });
}

/**
 * 3. ПОДКЛЮЧЕНИЕ К СЕРВЕРУ (SOCKET.IO)
 */
function initSocketConnection() {
  state.socket = io(SERVER_URL, {
    auth: { token: state.token } // Отправляем токен для авторизации сокет-соединения
  });

  // --- Обработчики событий от сервера ---
  state.socket.on('connect', () => {
    console.log('Успешно подключено к серверу');
  });

  state.socket.on('disconnect', () => {
    showNotification('Соединение с сервером потеряно', 'error');
  });

  state.socket.on('connect_error', (err) => {
    console.error('Ошибка подключения:', err.message);
    // Если токен невалидный, разлогиниваем
    if (err.message === 'Invalid token') {
      logout();
    }
  });
  
  // Получаем начальные данные
  state.socket.on('initialData', (data) => {
    state.masters = data.masters;
    updateAndRender(data);
  });
  
  // Получаем обновления
  state.socket.on('dataUpdate', (data) => {
    updateAndRender(data);
    showNotification('Данные обновлены', 'success');
  });
  
  // Обработка ошибок от сервера
  state.socket.on('serverError', (message) => {
    showNotification(message, 'error');
  });
}

/**
 * Обновляет состояние и перерисовывает активную вкладку
 */
function updateAndRender(data) {
    // Обновляем состояние на основе данных с сервера
    if(data.todayOrders) state.todayOrders = data.todayOrders;
    if(data.weekOrders) state.weekOrders = data.weekOrders;
    if(data.weekStats) state.weekStats = data.weekStats;
    if(data.leaderboard) state.leaderboard = data.leaderboard;
    if(data.salaryData) state.salaryData = data.salaryData;

    // Перерисовываем интерфейс
    renderContent();
}

/**
 * 4. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА (UI)
 */
function initUI() {
  // --- Дата и время в хедере ---
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  const updateDateTime = () => {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    timeEl.textContent = now.toLocaleTimeString('ru-RU');
  };
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // --- Навигация по вкладкам ---
  const navTabs = document.querySelector('.nav-tabs');
  navTabs.addEventListener('click', (e) => {
    const tabButton = e.target.closest('.nav-tab');
    if (tabButton) {
      navTabs.querySelector('.active').classList.remove('active');
      tabButton.classList.add('active');
      state.activeTab = tabButton.dataset.tab;
      
      document.querySelector('.tab-content.active').classList.remove('active');
      document.getElementById(state.activeTab).classList.add('active');
      
      renderContent();
    }
  });
  
  // --- Кнопка выхода ---
  const logoutBtn = document.querySelector('#logoutBtn');
  if(logoutBtn) logoutBtn.addEventListener('click', logout);

  // Первоначальная отрисовка
  renderContent();
}

/**
 * 5. РЕНДЕРИНГ (ОТРИСОВКА КОНТЕНТА)
 */
function renderContent() {
  // В зависимости от активной вкладки вызываем нужную функцию рендеринга
  switch (state.activeTab) {
    case 'home':
      renderHomePage();
      break;
    case 'orders':
      renderOrdersPage();
      break;
    case 'finance':
      renderFinancePage();
      break;
    case 'archive':
      renderArchivePage();
      break;
  }
}

// --- Функции рендеринга для каждой страницы ---

function renderHomePage() {
  // Рендеринг дашборда
  const dashboardGrid = document.getElementById('dashboard-grid');
  dashboardGrid.innerHTML = `
    <div class="dashboard-item">
      <i class="fas fa-ruble-sign dashboard-icon"></i>
      <div class="dashboard-value">${formatCurrency(state.weekStats.totalRevenue || 0)}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Общая выручка' : 'Моя выручка'}</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-box-open dashboard-icon"></i>
      <div class="dashboard-value">${state.weekStats.totalOrders || 0}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Всего заказов' : 'Мои заказы'}</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-chart-line dashboard-icon"></i>
      <div class="dashboard-value">${formatCurrency(state.weekStats.avgCheck || 0)}</div>
      <div class="dashboard-label">Средний чек</div>
    </div>
     <div class="dashboard-item">
      <i class="fas fa-users dashboard-icon"></i>
      <div class="dashboard-value">${state.masters.length}</div>
      <div class="dashboard-label">Мастеров в смене</div>
    </div>
  `;
  
  // Рендеринг доски лидеров
  renderLeaderboard(document.getElementById('leaderboard-container'));
  
  // Рендеринг заказов на сегодня
  renderOrdersList(document.getElementById('todayOrdersList'), state.todayOrders, { showMaster: true });
}

function renderOrdersPage() {
    renderOrdersList(document.getElementById('ordersList'), state.weekOrders, { showMaster: true, showDate: true });
}

function renderFinancePage() {
    const container = document.getElementById('finance');
    if(state.currentUser.role === 'DIRECTOR') {
        // Рендеринг для директора
    } else {
        // Рендеринг для мастера
    }
}

function renderArchivePage() {
  // Логика для архива
}

// --- Вспомогательные функции рендеринга ---

function renderLeaderboard(container) {
  if (!container) return;
  if (!state.leaderboard || state.leaderboard.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных для рейтинга.</div>';
    return;
  }
  
  const table = createElement('table', 'leaderboard-table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Место</th>
        <th>Мастер</th>
        <th>Выручка</th>
        <th>Заказы</th>
      </tr>
    </thead>
    <tbody>
      ${state.leaderboard.map((master, index) => `
        <tr class="${master.name === state.currentUser.name ? 'is-current-user' : ''}">
          <td>
            <span class="leaderboard-place" data-place="${index + 1}">
              ${index < 3 ? `<i class="fas fa-trophy"></i>` : index + 1}
            </span>
          </td>
          <td>${master.name}</td>
          <td>${formatCurrency(master.revenue)}</td>
          <td>${master.ordersCount}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  container.innerHTML = '';
  container.appendChild(table);
}

function renderOrdersList(container, orders, options = {}) {
  if (!container) return;
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Заказов пока нет.</p></div>';
    return;
  }
  
  container.innerHTML = '';
  orders.forEach(order => {
    const item = createElement('div', 'order-item');
    
    // Проверяем, можно ли редактировать/удалять заказ
    const canEdit = state.currentUser.role === 'DIRECTOR' || 
                   (state.currentUser.name === order.masterName && (new Date() - new Date(order.createdAt)) < 3600 * 1000);

    item.innerHTML = `
      <div class="order-info">
        ${options.showMaster ? `<div class="order-master">${order.masterName}</div>` : ''}
        <p class="order-description">${order.description}</p>
        <div class="order-details">
          <span><i class="fas fa-tag"></i> ${order.paymentType}</span>
          ${options.showDate ? `<span><i class="far fa-calendar-alt"></i> ${formatDate(order.createdAt)}</span>` : ''}
        </div>
      </div>
      <div class="order-amount">
        <div class="order-amount-value">${formatCurrency(order.amount)}</div>
        <div class="order-time">${new Date(order.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="order-actions">
            ${canEdit ? `<button class="btn btn-sm" data-action="edit" data-id="${order.id}"><i class="fas fa-pen"></i></button>` : ''}
            ${canEdit ? `<button class="btn btn-sm" data-action="delete" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

/**
 * 6. ВЫХОД ИЗ СИСТЕМЫ
 */
function logout() {
  localStorage.removeItem('vipauto_token');
  localStorage.removeItem('vipauto_user');
  sessionStorage.removeItem('vipauto_token');
  sessionStorage.removeItem('vipauto_user');
  if (state.socket) {
    state.socket.disconnect();
  }
  window.location.href = 'login.html';
}

// TODO: Добавить обработчики кликов для модальных окон, редактирования, удаления и т.д.
// TODO: Реализовать рендеринг финансовых страниц для директора и мастера.
