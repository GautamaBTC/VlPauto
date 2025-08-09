/*────────────────────────────────────────────
  script.js
  Основной скрипт для бортового журнала VIPавто.
  Реализует ролевую модель и взаимодействие с сервером.
─────────────────────────────────────────────*/

import { showNotification, formatCurrency, formatDate, createElement, getEndings, downloadCSV } from './js/utils.js';

// URL сервера
const SERVER_URL = '';

// --- Глобальное состояние приложения ---
const state = {
  bonuses: {},
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  weekStats: {},
  leaderboard: [],
  // Данные, получаемые от сервера
  data: {
    todayOrders: [],
    weekOrders: [],
    salaryData: [],
    archive: [],
  },
};

// --- Инициализация ---
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (!state.currentUser) return; // Прерываем, если нет пользователя

  initTheme();
  initUI();
  initSocketConnection();
});


/**
 * 1. АУТЕНТИФИКАЦИЯ
 */
function initAuth() {
  state.token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
  const userData = localStorage.getItem('vipauto_user') || sessionStorage.getItem('vipauto_user');

  if (!state.token || !userData) {
    window.location.href = 'login.html';
    return;
  }
  
  state.currentUser = JSON.parse(userData);
  document.getElementById('user-name-display').textContent = state.currentUser.name;
}

// --- ЭКСПОРТ В CSV ---
function exportSalaryCSV() {
    if (state.currentUser.role !== 'DIRECTOR') {
        showNotification('Доступно только для директора.', 'error');
        return;
    }
    const headers = ['Мастер', 'Выручка', 'База (50%)', 'Премия %', 'Сумма премии', 'Итог к выплате'];
    const rows = state.data.salaryData.map(item => {
        const masterName = item.name;
        const totalRevenue = item.total * 2;
        const baseSalary = item.total;
        const bonusPercent = state.bonuses[masterName] || 0;
        const bonusAmount = baseSalary * (bonusPercent / 100);
        const finalSalary = baseSalary + bonusAmount;
        return [masterName, totalRevenue, baseSalary, bonusPercent, bonusAmount, finalSalary].join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\n');
    downloadCSV(csvContent, `salary-report-${new Date().toISOString().slice(0,10)}.csv`);
}

function exportArchiveCSV() {
    if (state.currentUser.role !== 'DIRECTOR') {
        showNotification('Доступно только для директора.', 'error');
        return;
    }
    if (!state.data.archive || state.data.archive.length === 0) {
        showNotification('Нет данных для экспорта. Сначала выполните поиск в архиве.', 'error');
        return;
    }

    const headers = ['ID Заказ-наряда', 'Мастер', 'Дата', 'Сумма', 'Тип оплаты', 'Описание', 'Клиент', 'Телефон клиента'];
    const rows = state.data.archive.map(order => {
        const row = [
            order.id,
            order.masterName,
            formatDate(order.createdAt),
            order.amount,
            order.paymentType,
            `"${order.description.replace(/"/g, '""')}"`,
            order.clientName || '',
            order.clientPhone || ''
        ];
        return row.join(';');
    });

    const csvContent = [headers.join(';'), ...rows].join('\n');
    downloadCSV(csvContent, `archive-report-${new Date().toISOString().slice(0,10)}.csv`);
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

function openSalaryModal() {
  closeModal(); // Закрываем другие модальные окна

  const isDirector = state.currentUser.role === 'DIRECTOR';
  const modal = createElement('div', { id: 'salary-modal', className: 'modal-backdrop' });

  let tableRowsHtml = '';
  const salaryData = state.data.salaryData || [];

  salaryData.forEach(item => {
    const masterName = item.name;
    const totalRevenue = item.total * 2;
    const baseSalary = item.total;
    const bonusPercent = state.bonuses[masterName] || 0;
    const bonusAmount = baseSalary * (bonusPercent / 100);
    const finalSalary = baseSalary + bonusAmount;

    if (!isDirector && masterName !== state.currentUser.name) {
      return; // Мастер видит только себя
    }

    tableRowsHtml += `
      <tr data-master-name="${masterName}">
        <td>${masterName}</td>
        <td>${formatCurrency(totalRevenue)}</td>
        <td>${formatCurrency(baseSalary)}</td>
        <td class="bonus-cell">
          ${isDirector ? `
            <div class="bonus-slider-wrapper">
              <input type="range" min="0" max="50" value="${bonusPercent}" data-master="${masterName}" class="bonus-slider">
              <span class="bonus-percent">${bonusPercent}%</span>
            </div>
          ` : `${bonusPercent}%`}
        </td>
        <td class="bonus-amount">${formatCurrency(bonusAmount)}</td>
        <td class="final-salary"><strong>${formatCurrency(finalSalary)}</strong></td>
      </tr>
    `;
  });

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 700px;">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-wallet"></i> Расчет зарплаты за неделю</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <div class="salary-table-container">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>Мастер</th>
                <th>Выручка</th>
                <th>База (50%)</th>
                <th>Премия</th>
                <th>Сумма премии</th>
                <th>Итог</th>
              </tr>
            </thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        ${isDirector ? `<button type="button" class="btn btn-accent" id="applyBonusesBtn">Применить премии</button>` : ''}
        <button type="button" class="btn btn-secondary" id="exportSalaryBtn">Экспорт в CSV</button>
        <button type="button" class="btn btn-secondary" id="cancelSalaryModalBtn">Закрыть</button>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  // --- Обработчики ---
  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#cancelSalaryModalBtn').addEventListener('click', closeModal);

  if (isDirector) {
    modal.querySelectorAll('.bonus-slider').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const masterName = e.target.dataset.master;
        const bonusPercent = parseInt(e.target.value, 10);
        state.bonuses[masterName] = bonusPercent;
        updateSalaryRow(masterName);
      });
    });
    modal.querySelector('#applyBonusesBtn').addEventListener('click', () => {
        showNotification('Проценты премий сохранены локально.', 'success');
    });
  }

  modal.querySelector('#exportSalaryBtn').addEventListener('click', exportSalaryCSV);
}

function openCloseWeekModal() {
  closeModal();
  const modal = createElement('div', { id: 'close-week-modal', className: 'modal-backdrop' });
  const CONFIRM_PHRASE = 'ПОДТВЕРЖДАЮ';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-calendar-check"></i> Закрыть неделю</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <p>Вы уверены, что хотите закрыть текущую неделю? Все заказ-наряды будут перенесены в архив.</p>
        <p>Для подтверждения введите: <strong>${CONFIRM_PHRASE}</strong></p>
        <div class="form-group">
          <input type="text" id="closeWeekConfirmInput" class="form-control" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="cancelCloseWeekBtn">Отмена</button>
        <button type="button" class="btn btn-danger" id="confirmCloseWeekBtn" disabled>Закрыть неделю</button>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  const confirmInput = modal.querySelector('#closeWeekConfirmInput');
  const confirmBtn = modal.querySelector('#confirmCloseWeekBtn');

  confirmInput.addEventListener('input', () => {
    confirmBtn.disabled = confirmInput.value !== CONFIRM_PHRASE;
  });

  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#cancelCloseWeekBtn').addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', () => {
    state.socket.emit('closeWeek');
    closeModal();
    showNotification('Неделя успешно закрыта и заархивирована.', 'success');
  });
}

function openClearDataModal() {
  closeModal();
  const modal = createElement('div', { id: 'clear-data-modal', className: 'modal-backdrop' });
  const CONFIRM_PHRASE = 'ОЧИСТИТЬ';

  modal.innerHTML = `
    <div class="modal-content" style="max-width: 450px;">
      <div class="modal-header">
        <h3 class="modal-title"><i class="fas fa-exclamation-triangle"></i> Очистить все данные</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <p>Это действие <strong>необратимо</strong>. Все заказ-наряды и вся история будут удалены навсегда. Пользователи останутся.</p>
        <p>Для подтверждения введите: <strong>${CONFIRM_PHRASE}</strong></p>
        <div class="form-group">
          <input type="text" id="clearDataConfirmInput" class="form-control" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="cancelClearDataBtn">Отмена</button>
        <button type="button" class="btn btn-danger" id="confirmClearDataBtn" disabled>Я понимаю, очистить все</button>
      </div>
    </div>
  `;

  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  const confirmInput = modal.querySelector('#clearDataConfirmInput');
  const confirmBtn = modal.querySelector('#confirmClearDataBtn');

  confirmInput.addEventListener('input', () => {
    confirmBtn.disabled = confirmInput.value !== CONFIRM_PHRASE;
  });

  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#cancelClearDataBtn').addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', () => {
    state.socket.emit('clearData');
    closeModal();
    showNotification('Все данные были успешно удалены.', 'success');
  });
}

function updateSalaryRow(masterName) {
    const row = document.querySelector(`tr[data-master-name="${masterName}"]`);
    if (!row) return;

    const salaryInfo = state.data.salaryData.find(s => s.name === masterName);
    if (!salaryInfo) return;

    const baseSalary = salaryInfo.total;
    const bonusPercent = state.bonuses[masterName] || 0;
    const bonusAmount = baseSalary * (bonusPercent / 100);
    const finalSalary = baseSalary + bonusAmount;

    row.querySelector('.bonus-percent').textContent = `${bonusPercent}%`;
    row.querySelector('.bonus-amount').textContent = formatCurrency(bonusAmount);
    row.querySelector('.final-salary').innerHTML = `<strong>${formatCurrency(finalSalary)}</strong>`;
}


/**
 * 3. UI И ОБРАБОТЧИКИ
 */
function initUI() {
  // --- Дата и время ---
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  const updateDateTime = () => {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    timeEl.textContent = now.toLocaleTimeString('ru-RU');
  };
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // --- Навигация ---
  const navTabs = document.querySelector('.nav-tabs');
  navTabs.addEventListener('click', (e) => {
    const tabButton = e.target.closest('.nav-tab');
    if (tabButton && !tabButton.classList.contains('active')) {
      navTabs.querySelector('.active').classList.remove('active');
      tabButton.classList.add('active');
      state.activeTab = tabButton.dataset.tab;
      
      document.querySelector('.tab-content.active').classList.remove('active');
      document.getElementById(state.activeTab).classList.add('active');
      
      renderContent();
    }
  });

  // --- Глобальный обработчик кликов для кнопок действий ---
  document.querySelector('.main-content').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;
    const order = [...state.data.todayOrders, ...state.data.weekOrders].find(o => o.id === id);

    if (action === 'edit' && order) {
      openOrderModal(order);
    }

    if (action === 'delete' && order) {
      if (confirm(`Вы уверены, что хотите удалить заказ-наряд "${order.description}"?`)) {
        state.socket.emit('deleteOrder', id);
      }
    }
  });

  // --- Кнопки ---
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('addOrderBtn').addEventListener('click', () => openOrderModal());

  // Кнопки быстрых действий
  document.getElementById('quickAddOrderBtn').addEventListener('click', () => openOrderModal());
  document.getElementById('quickViewSalaryBtn').addEventListener('click', () => openSalaryModal());
  document.getElementById('quickCloseWeekBtn')?.addEventListener('click', openCloseWeekModal);
  document.getElementById('quickExportBtn')?.addEventListener('click', exportSalaryCSV);
  document.getElementById('clearAllDataBtn')?.addEventListener('click', openClearDataModal);
  document.getElementById('exportFinanceBtn')?.addEventListener('click', exportSalaryCSV);
  document.getElementById('exportArchiveBtn')?.addEventListener('click', exportArchiveCSV);


  document.getElementById('viewArchiveBtn').addEventListener('click', () => {
    const startDate = document.getElementById('archiveStartDate').value;
    const endDate = document.getElementById('archiveEndDate').value;
    if (startDate && endDate) {
      state.socket.emit('getArchiveData', { startDate, endDate });
    } else {
      showNotification('Пожалуйста, выберите начальную и конечную даты', 'error');
    }
  });
}


/**
 * 4. ПОДКЛЮЧЕНИЕ К СЕРВЕРУ (SOCKET.IO)
 */
function initSocketConnection() {
  state.socket = io(SERVER_URL, { auth: { token: state.token } });

  state.socket.on('connect', () => console.log('Подключено к серверу'));
  state.socket.on('disconnect', () => showNotification('Соединение потеряно', 'error'));
  state.socket.on('connect_error', (err) => {
    if (err.message === 'Invalid token') logout();
  });
  
  state.socket.on('initialData', (data) => {
    state.masters = data.masters || [];
    updateAndRender(data);
  });
  
  state.socket.on('dataUpdate', (data) => {
    updateAndRender(data);
    showNotification('Данные обновлены', 'success');
  });
  
  state.socket.on('archiveData', (archiveOrders) => {
    state.data.archive = archiveOrders;
    renderArchivePage(); // Перерисовываем только страницу архива
    showNotification(`Найден${getEndings(archiveOrders.length, 'о', '', 'о')} ${archiveOrders.length} заказ-наряд${getEndings(archiveOrders.length, '', 'а', 'ов')}`, 'success');
  });

  state.socket.on('serverError', (message) => showNotification(message, 'error'));
}

function updateAndRender(data) {
    Object.assign(state.data, data);
    if (data.weekStats) state.weekStats = data.weekStats;
    if (data.leaderboard) state.leaderboard = data.leaderboard;
    renderContent();
}


/**
 * 5. РЕНДЕРИНГ КОНТЕНТА
 */
function renderContent() {
  adjustUIVisibility();
  switch (state.activeTab) {
    case 'home': renderHomePage(); break;
    case 'orders': renderOrdersPage(); break;
    case 'finance': renderFinancePage(); break;
    case 'archive': renderArchivePage(); break;
  }
}

function adjustUIVisibility() {
  const financeTab = document.querySelector('.nav-tab[data-tab="finance"]');
  const isDirector = state.currentUser.role === 'DIRECTOR';

  // Управляем видимостью элементов в зависимости от роли
  document.body.classList.toggle('is-director', isDirector);

  if (!isDirector) {
    // Скрываем/показываем то, что не управляется через CSS
  }
}

// --- Рендеринг страниц ---

function renderHomePage() {
  renderDashboard();
  renderWeekStatistics(document.getElementById('week-stats-container'));
  renderLeaderboard(document.getElementById('leaderboard-container'));
  renderOrdersList(document.getElementById('todayOrdersList'), state.data.todayOrders, { showMaster: true });
}

function renderOrdersPage() {
  renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders, { showMaster: true, showDate: true });
}

function renderFinancePage() {
  const container = document.getElementById('finance-content-wrapper');
  if (!container) return;
  container.innerHTML = ''; // Очищаем
  
  if (state.currentUser.role === 'DIRECTOR') {
    renderDirectorFinanceTable(container);
  } else {
    // Рендеринг урезанной версии для мастера
    const overview = createElement('div', {className: 'master-finance-overview'});
    const salary = state.data.salaryData.find(s => s.name === state.currentUser.name);
    overview.innerHTML = `
        <div class="master-finance-label">Ваша зарплата к выплате за неделю</div>
        <div class="master-finance-amount">${formatCurrency(salary ? salary.total : 0)}</div>
    `;

    const section = createElement('div', {className: 'section'});
    section.innerHTML = `
        <div class="section-header">
            <h3 class="section-title"><i class="fas fa-list-alt"></i> Детализация ваших работ</h3>
        </div>
    `;
    const listContainer = createElement('div', {className: 'orders-list-container'});
    renderOrdersList(listContainer, state.data.weekOrders, { showDate: true });

    section.appendChild(listContainer);
    container.appendChild(overview);
    container.appendChild(section);
  }
}

function renderDirectorFinanceTable(container) {
    const tableContainer = createElement('div', { className: 'leaderboard-container' }); // Используем тот же стиль

    const table = createElement('table', { className: 'leaderboard-table' });
    table.innerHTML = `
      <thead>
        <tr>
          <th>Мастер</th>
          <th>Выручка за неделю</th>
          <th>Зарплата к выплате (50%)</th>
        </tr>
      </thead>
      <tbody>
        ${state.data.salaryData.map(item => `
          <tr>
            <td>${item.name}</td>
            <td>${formatCurrency(item.total * 2)}</td>
            <td><strong>${formatCurrency(item.total)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    `;

    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
}

function renderArchivePage() {
  const container = document.getElementById('archiveListContainer');
  // При первом рендере (до поиска) показываем подсказку
  if (!state.data.archive || state.data.archive.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Выберите даты для просмотра архива.</p></div>';
    return;
  }

  // После поиска рендерим список
  renderOrdersList(container, state.data.archive, { showMaster: true, showDate: true });
}


// --- Рендеринг компонентов ---

function renderDashboard() {
  const grid = document.getElementById('dashboard-grid');
  grid.innerHTML = `
    <div class="dashboard-item">
      <i class="fas fa-ruble-sign dashboard-icon"></i>
      <div class="dashboard-value">${formatCurrency(state.weekStats.revenue || 0)}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Общая выручка' : 'Моя выручка'}</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-box-open dashboard-icon"></i>
      <div class="dashboard-value">${state.weekStats.ordersCount || 0}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Всего заказ-нарядов' : 'Мои заказ-наряды'}</div>
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
}

function renderWeekStatistics(container) {
  if (!container) return;

  const weekOrders = state.data.weekOrders || [];
  const { revenue, ordersCount, avgCheck } = state.weekStats;

  const paymentTypes = weekOrders.reduce((acc, order) => {
    acc[order.paymentType] = (acc[order.paymentType] || 0) + 1;
    return acc;
  }, {});
  const cashCount = paymentTypes['Наличные'] || 0;
  const cardCount = paymentTypes['Картой'] || 0;
  const transferCount = paymentTypes['Перевод'] || 0;

  container.innerHTML = `
    <div class="week-summary-grid">
      <div class="summary-item">
        <div class="summary-label">Общая выручка</div>
        <div class="summary-value">${formatCurrency(revenue)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Всего заказ-нарядов</div>
        <div class="summary-value">${ordersCount}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Средний чек</div>
        <div class="summary-value">${formatCurrency(avgCheck)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Наличные / Карта / Перевод</div>
        <div class="summary-value">${cashCount} / ${cardCount} / ${transferCount}</div>
      </div>
    </div>
  `;
}

function renderLeaderboard(container) {
  if (!container) return;
  if (!state.leaderboard || state.leaderboard.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных для рейтинга.</div>';
    return;
  }
  
  const table = createElement('table', {className: 'leaderboard-table'});
  table.innerHTML = `
    <thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th><th>Заказ-наряды</th></tr></thead>
    <tbody>
      ${state.leaderboard.map((master, index) => `
        <tr class="${master.name === state.currentUser.name ? 'is-current-user' : ''}">
          <td><span class="leaderboard-place" data-place="${index + 1}">${index < 3 ? `<i class="fas fa-trophy"></i>` : index + 1}</span></td>
          <td>${master.name}</td>
          <td>${formatCurrency(master.revenue)}</td>
          <td>${master.ordersCount}</td>
        </tr>`).join('')}
    </tbody>`;
  container.innerHTML = '';
  container.appendChild(table);
}

function renderOrdersList(container, orders, options = {}) {
  if (!container) return;
  if (!orders || orders.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Заказ-нарядов пока нет.</p></div>';
    return;
  }
  
  container.innerHTML = '';
  orders.forEach(order => {
    const item = createElement('div', {className: 'order-item'});
    const canEdit = state.currentUser.role === 'DIRECTOR' || 
                   (state.currentUser.name === order.masterName && (new Date() - new Date(order.createdAt)) < 3600 * 1000 * 24); // 24 часа на редактирование

    // SMS-сообщение
    const smsMessage = encodeURIComponent(`Ваш автомобиль готов. VIPавто, тел. +7(XXX)XXX-XX-XX`);

    item.innerHTML = `
      <div class="order-info">
        ${(options.showMaster && state.currentUser.role === 'DIRECTOR') ? `<div class="order-master">${order.masterName}</div>` : ''}

        <div class="order-client-info">
          <span class="client-name"><i class="fas fa-user"></i> ${order.clientName || 'Клиент не указан'}</span>
          ${order.clientPhone ? `<a href="tel:${order.clientPhone}" class="client-phone"><i class="fas fa-phone"></i> ${order.clientPhone}</a>` : ''}
        </div>

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
            ${order.clientPhone ? `<a href="sms:${order.clientPhone}?body=${smsMessage}" class="btn btn-sm btn-secondary btn-notify" title="Уведомить клиента"><i class="fas fa-comment-sms"></i></a>` : ''}
            ${canEdit ? `<button class="btn btn-sm btn-secondary" data-action="edit" data-id="${order.id}" title="Редактировать"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-secondary" data-action="delete" data-id="${order.id}" title="Удалить"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}


/**
 * 6. МОДАЛЬНЫЕ ОКНА
 */
function closeModal() {
  const modal = document.getElementById('order-modal') || document.getElementById('salary-modal') || document.getElementById('close-week-modal') || document.getElementById('clear-data-modal');
  if (modal) {
    modal.classList.remove('show');
    modal.addEventListener('transitionend', () => modal.remove());
  }
}

function openOrderModal(orderToEdit = null) {
  closeModal(); // Закрываем любое открытое модальное окно на всякий случай

  const isEdit = orderToEdit !== null;
  const modalTitle = isEdit ? 'Редактировать заказ-наряд' : 'Добавить новый заказ-наряд';
  const modalRoot = document.getElementById('modal-root');

  const modal = createElement('div', { id: 'order-modal', className: 'modal-backdrop' });

  const masterOptions = state.masters.map(name =>
    `<option value="${name}" ${isEdit && orderToEdit.masterName === name ? 'selected' : ''}>${name}</option>`
  ).join('');

  const paymentOptions = ['Картой', 'Наличные', 'Перевод'].map(type =>
    `<option value="${type}" ${isEdit && orderToEdit.paymentType === type ? 'selected' : ''}>${type}</option>`
  ).join('');

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${modalTitle}</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <form id="order-form">
          <input type="hidden" name="id" value="${isEdit ? orderToEdit.id : ''}">

          <div class="form-group">
            <label for="description">Описание работ</label>
            <textarea name="description" id="description" rows="3" required>${isEdit ? orderToEdit.description : ''}</textarea>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="amount">Сумма (₽)</label>
              <input type="number" name="amount" id="amount" required value="${isEdit ? orderToEdit.amount : ''}">
            </div>
            <div class="form-group">
              <label for="paymentType">Тип оплаты</label>
              <select name="paymentType" id="paymentType">${paymentOptions}</select>
            </div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label for="clientName">Имя клиента</label>
              <input type="text" name="clientName" id="clientName" value="${isEdit ? orderToEdit.clientName || '' : ''}">
            </div>
            <div class="form-group">
              <label for="clientPhone">Телефон клиента</label>
              <input type="tel" name="clientPhone" id="clientPhone" value="${isEdit ? orderToEdit.clientPhone || '' : ''}">
            </div>
          </div>

          ${state.currentUser.role === 'DIRECTOR' ? `
          <div class="form-group">
            <label for="masterName">Исполнитель</label>
            <select name="masterName" id="masterName">${masterOptions}</select>
          </div>` : `<input type="hidden" name="masterName" value="${state.currentUser.name}">`}

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelOrderBtn">Отмена</button>
            <button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  modalRoot.appendChild(modal);

  // Плавное появление
  requestAnimationFrame(() => modal.classList.add('show'));

  // --- Обработчики событий модального окна ---
  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#cancelOrderBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(); // Закрыть по клику на фон
  });

  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const orderData = Object.fromEntries(formData.entries());

    // Преобразуем сумму в число
    orderData.amount = parseFloat(orderData.amount);

    if (isEdit) {
      state.socket.emit('updateOrder', orderData);
    } else {
      state.socket.emit('addOrder', orderData);
    }
    closeModal();
  });
}


/**
 * 7. ВЫХОД ИЗ СИСТЕМЫ
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
