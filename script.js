/*────────────────────────────────────────────
  script.js
  Основной скрипт для бортового журнала VIPавто.
─────────────────────────────────────────────*/

import { showNotification, formatCurrency, formatDate, createElement, getEndings, downloadCSV } from './js/utils.js';

const SERVER_URL = '';

const state = {
  bonuses: {},
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  data: {
    todayOrders: [],
    weekOrders: [],
    salaryData: [],
    archive: [],
    weekStats: {},
    leaderboard: [],
  },
};

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (!state.currentUser) return;
  initTheme();
  initUI();
  initSocketConnection();
});

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

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  htmlEl.setAttribute('data-theme', savedTheme);
  themeToggle.checked = savedTheme === 'light';
  themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'light' : 'dark';
    htmlEl.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipauto_theme', newTheme);
  });
}

function initUI() {
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  const updateDateTime = () => {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    timeEl.textContent = now.toLocaleTimeString('ru-RU');
  };
  updateDateTime();
  setInterval(updateDateTime, 1000);

  document.querySelector('.nav-tabs').addEventListener('click', (e) => {
    const tabButton = e.target.closest('.nav-tab');
    if (tabButton && !tabButton.classList.contains('active')) {
      document.querySelector('.nav-tab.active').classList.remove('active');
      tabButton.classList.add('active');
      state.activeTab = tabButton.dataset.tab;
      document.querySelector('.tab-content.active').classList.remove('active');
      document.getElementById(state.activeTab).classList.add('active');
      renderContent();
    }
  });

  document.querySelector('.main-content').addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    const order = [...state.data.todayOrders, ...state.data.weekOrders].find(o => o.id === id);
    if (action === 'edit' && order) openOrderModal(order);
    if (action === 'delete' && order) {
      if (confirm(`Вы уверены, что хотите удалить заказ-наряд "${order.description}"?`)) {
        state.socket.emit('deleteOrder', id);
      }
    }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('addOrderBtn').addEventListener('click', () => openOrderModal());
  document.getElementById('quickAddOrderBtn').addEventListener('click', () => openOrderModal());
  document.getElementById('quickViewSalaryBtn').addEventListener('click', openSalaryModal);
  document.getElementById('quickCloseWeekBtn')?.addEventListener('click', openCloseWeekModal);
  document.getElementById('quickExportBtn')?.addEventListener('click', exportSalaryCSV);
  document.getElementById('clearAllDataBtn')?.addEventListener('click', openClearDataModal);
  document.getElementById('exportFinanceBtn')?.addEventListener('click', exportSalaryCSV);
  document.getElementById('exportArchiveBtn')?.addEventListener('click', exportArchiveCSV);
  document.getElementById('viewArchiveBtn').addEventListener('click', () => {
    const startDate = document.getElementById('archiveStartDate').value;
    const endDate = document.getElementById('archiveEndDate').value;
    if (startDate && endDate) state.socket.emit('getArchiveData', { startDate, endDate });
    else showNotification('Пожалуйста, выберите начальную и конечную даты', 'error');
  });
}

function initSocketConnection() {
  state.socket = io(SERVER_URL, { auth: { token: state.token } });
  state.socket.on('connect', () => console.log('Подключено к серверу'));
  state.socket.on('disconnect', () => showNotification('Соединение потеряно', 'error'));
  state.socket.on('connect_error', (err) => { if (err.message === 'Invalid token') logout(); });
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
    renderArchivePage();
    showNotification(`Найден${getEndings(archiveOrders.length, '', 'о', 'о')} ${archiveOrders.length} заказ-наряд${getEndings(archiveOrders.length, '', 'а', 'ов')}`, 'success');
  });
  state.socket.on('serverError', (message) => showNotification(message, 'error'));
}

function updateAndRender(data) {
    Object.assign(state.data, data);
    renderContent();
}

function renderContent() {
  adjustUIVisibility();
  const handlers = {
    home: renderHomePage,
    orders: renderOrdersPage,
    finance: renderFinancePage,
    archive: renderArchivePage,
  };
  handlers[state.activeTab]?.();
}

function adjustUIVisibility() {
  document.body.classList.toggle('is-director', state.currentUser.role === 'DIRECTOR');
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
  container.innerHTML = '';
  if (state.currentUser.role === 'DIRECTOR') {
    renderDirectorFinanceTable(container);
  } else {
    renderMasterFinanceView(container);
  }
}

function renderDirectorFinanceTable(container) {
    const tableContainer = createElement('div', { className: 'leaderboard-container' });
    const table = createElement('table', { className: 'leaderboard-table' });
    table.innerHTML = `
      <thead><tr><th>Мастер</th><th>Выручка</th><th>Зарплата (50%)</th></tr></thead>
      <tbody>
        ${state.data.salaryData.map(item => `
          <tr>
            <td>${item.name}</td>
            <td>${formatCurrency(item.total * 2)}</td>
            <td><strong>${formatCurrency(item.total)}</strong></td>
          </tr>`).join('')}
      </tbody>`;
    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
}

function renderMasterFinanceView(container) {
    const salary = state.data.salaryData.find(s => s.name === state.currentUser.name);
    const overview = createElement('div', { className: 'master-finance-overview' });
    overview.innerHTML = `
        <div class="master-finance-label">Ваша зарплата к выплате за неделю</div>
        <div class="master-finance-amount">${formatCurrency(salary ? salary.total : 0)}</div>`;
    const detailsSection = createElement('div', { className: 'section' });
    detailsSection.innerHTML = `<div class="section-header"><h3 class="section-title"><i class="fas fa-list-alt"></i> Детализация ваших работ</h3></div>`;
    const listContainer = createElement('div', { className: 'orders-list-container' });
    renderOrdersList(listContainer, state.data.weekOrders, { showDate: true });
    detailsSection.appendChild(listContainer);
    container.appendChild(overview);
    container.appendChild(detailsSection);
}

function renderArchivePage() {
  const container = document.getElementById('archiveListContainer');
  if (!state.data.archive || state.data.archive.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Выберите даты для просмотра архива.</p></div>';
    return;
  }
  renderOrdersList(container, state.data.archive, { showMaster: true, showDate: true });
}

// --- Рендеринг компонентов ---
function renderDashboard() {
  const grid = document.getElementById('dashboard-grid');
  const stats = state.data.weekStats;
  grid.innerHTML = `
    <div class="dashboard-item">
      <i class="fas fa-ruble-sign dashboard-icon"></i>
      <div class="dashboard-value">${formatCurrency(stats.revenue || 0)}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Общая выручка' : 'Моя выручка'}</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-box-open dashboard-icon"></i>
      <div class="dashboard-value">${stats.ordersCount || 0}</div>
      <div class="dashboard-label">${state.currentUser.role === 'DIRECTOR' ? 'Всего заказ-нарядов' : 'Мои заказ-наряды'}</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-chart-line dashboard-icon"></i>
      <div class="dashboard-value">${formatCurrency(stats.avgCheck || 0)}</div>
      <div class="dashboard-label">Средний чек</div>
    </div>
    <div class="dashboard-item">
      <i class="fas fa-users dashboard-icon"></i>
      <div class="dashboard-value">${state.masters.length}</div>
      <div class="dashboard-label">Мастеров в смене</div>
    </div>`;
}

function renderWeekStatistics(container) {
  if (!container) return;
  const { revenue, ordersCount, avgCheck } = state.data.weekStats;
  const paymentTypes = (state.data.weekOrders || []).reduce((acc, order) => {
    acc[order.paymentType] = (acc[order.paymentType] || 0) + 1;
    return acc;
  }, {});
  container.innerHTML = `
    <div class="week-summary-grid">
      <div class="summary-item"><div class="summary-label">Общая выручка</div><div class="summary-value">${formatCurrency(revenue)}</div></div>
      <div class="summary-item"><div class="summary-label">Всего заказ-нарядов</div><div class="summary-value">${ordersCount}</div></div>
      <div class="summary-item"><div class="summary-label">Средний чек</div><div class="summary-value">${formatCurrency(avgCheck)}</div></div>
      <div class="summary-item"><div class="summary-label">Нал / Карта / Перевод</div><div class="summary-value">${paymentTypes['Наличные'] || 0} / ${paymentTypes['Картой'] || 0} / ${paymentTypes['Перевод'] || 0}</div></div>
    </div>`;
}

function renderLeaderboard(container) {
  if (!container) return;
  if (!state.data.leaderboard || state.data.leaderboard.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных для рейтинга.</div>';
    return;
  }
  const table = createElement('table', { className: 'leaderboard-table' });
  table.innerHTML = `
    <thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th><th>Заказ-наряды</th></tr></thead>
    <tbody>
      ${state.data.leaderboard.map((master, index) => `
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
    const item = createElement('div', { className: 'order-item' });
    const canEdit = state.currentUser.role === 'DIRECTOR' || (state.currentUser.name === order.masterName && (new Date() - new Date(order.createdAt)) < 3600 * 1000 * 24);
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
      </div>`;
    container.appendChild(item);
  });
}

// --- МОДАЛЬНЫЕ ОКНА ---
function closeModal() {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) {
    modal.classList.remove('show');
    modal.addEventListener('transitionend', () => modal.remove());
  }
}

function openOrderModal(orderToEdit = null) {
  closeModal();
  const isEdit = orderToEdit !== null;
  const modal = createElement('div', { id: 'order-modal', className: 'modal-backdrop' });
  const masterOptions = state.masters.map(name => `<option value="${name}" ${isEdit && orderToEdit.masterName === name ? 'selected' : ''}>${name}</option>`).join('');
  const paymentOptions = ['Картой', 'Наличные', 'Перевод'].map(type => `<option value="${type}" ${isEdit && orderToEdit.paymentType === type ? 'selected' : ''}>${type}</option>`).join('');
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Редактировать заказ-наряд' : 'Добавить новый заказ-наряд'}</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <form id="order-form">
          <input type="hidden" name="id" value="${isEdit ? orderToEdit.id : ''}">
          <div class="form-group"><label for="description">Описание работ</label><textarea name="description" id="description" rows="3" required>${isEdit ? orderToEdit.description : ''}</textarea></div>
          <div class="form-grid">
            <div class="form-group"><label for="amount">Сумма (₽)</label><input type="number" name="amount" id="amount" required value="${isEdit ? orderToEdit.amount : ''}"></div>
            <div class="form-group"><label for="paymentType">Тип оплаты</label><select name="paymentType" id="paymentType">${paymentOptions}</select></div>
          </div>
          <div class="form-grid">
            <div class="form-group"><label for="clientName">Имя клиента</label><input type="text" name="clientName" id="clientName" value="${isEdit && orderToEdit.clientName ? orderToEdit.clientName : ''}"></div>
            <div class="form-group"><label for="clientPhone">Телефон клиента</label><input type="tel" name="clientPhone" id="clientPhone" value="${isEdit && orderToEdit.clientPhone ? orderToEdit.clientPhone : ''}"></div>
          </div>
          ${state.currentUser.role === 'DIRECTOR' ? `<div class="form-group"><label for="masterName">Исполнитель</label><select name="masterName" id="masterName">${masterOptions}</select></div>` : `<input type="hidden" name="masterName" value="${state.currentUser.name}">`}
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="cancelOrderBtn">Отмена</button>
            <button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button>
          </div>
        </form>
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('#cancelOrderBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const orderData = Object.fromEntries(formData.entries());
    orderData.amount = parseFloat(orderData.amount);
    state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', orderData);
    closeModal();
  });
}

function openSalaryModal() {
    closeModal();
    const isDirector = state.currentUser.role === 'DIRECTOR';
    const modal = createElement('div', { id: 'salary-modal', className: 'modal-backdrop' });
    const salaryData = state.data.salaryData || [];
    let tableRowsHtml = salaryData.filter(item => isDirector || item.name === state.currentUser.name).map(item => {
        const { name, total } = item;
        const bonusPercent = state.bonuses[name] || 0;
        const bonusAmount = total * (bonusPercent / 100);
        const finalSalary = total + bonusAmount;
        return `
          <tr data-master-name="${name}">
            <td>${name}</td><td>${formatCurrency(total * 2)}</td><td>${formatCurrency(total)}</td>
            <td class="bonus-cell">${isDirector ? `<div class="bonus-slider-wrapper"><input type="range" min="0" max="50" value="${bonusPercent}" data-master="${name}" class="bonus-slider"><span class="bonus-percent">${bonusPercent}%</span></div>` : `${bonusPercent}%`}</td>
            <td class="bonus-amount">${formatCurrency(bonusAmount)}</td><td class="final-salary"><strong>${formatCurrency(finalSalary)}</strong></td>
          </tr>`;
    }).join('');

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 700px;">
        <div class="modal-header"><h3 class="modal-title"><i class="fas fa-wallet"></i> Расчет зарплаты за неделю</h3><button class="modal-close-btn">&times;</button></div>
        <div class="modal-body"><div class="salary-table-container"><table class="leaderboard-table">
          <thead><tr><th>Мастер</th><th>Выручка</th><th>База (50%)</th><th>Премия</th><th>Сумма премии</th><th>Итог</th></tr></thead>
          <tbody>${tableRowsHtml}</tbody>
        </table></div></div>
        <div class="modal-footer">
          ${isDirector ? `<button type="button" class="btn btn-accent" id="applyBonusesBtn">Применить премии</button>` : ''}
          <button type="button" class="btn btn-secondary" id="exportSalaryBtn">Экспорт в CSV</button>
          <button type="button" class="btn btn-secondary" id="cancelSalaryModalBtn">Закрыть</button>
        </div>
      </div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#cancelSalaryModalBtn').addEventListener('click', closeModal);
    modal.querySelector('#exportSalaryBtn').addEventListener('click', exportSalaryCSV);
    if (isDirector) {
        modal.querySelectorAll('.bonus-slider').forEach(slider => {
            slider.addEventListener('input', e => {
                const masterName = e.target.dataset.master;
                state.bonuses[masterName] = parseInt(e.target.value, 10);
                updateSalaryRow(masterName);
            });
        });
        modal.querySelector('#applyBonusesBtn').addEventListener('click', () => showNotification('Проценты премий сохранены локально.', 'success'));
    }
}

function openConfirmationModal({ title, text, confirmText, confirmPhrase, onConfirm }) {
    closeModal();
    const modal = createElement('div', { className: 'modal-backdrop' });
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 450px;">
        <div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn">&times;</button></div>
        <div class="modal-body">
          <p>${text}</p>
          <p>Для подтверждения введите: <strong>${confirmPhrase}</strong></p>
          <div class="form-group"><input type="text" id="confirmInput" class="form-control" autocomplete="off"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelBtn">Отмена</button>
          <button type="button" class="btn btn-danger" id="confirmBtn" disabled>${confirmText}</button>
        </div>
      </div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    const confirmInput = modal.querySelector('#confirmInput');
    const confirmBtn = modal.querySelector('#confirmBtn');
    confirmInput.addEventListener('input', () => { confirmBtn.disabled = confirmInput.value !== confirmPhrase; });
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

function openCloseWeekModal() {
    openConfirmationModal({
        title: '<i class="fas fa-calendar-check"></i> Закрыть неделю',
        text: 'Вы уверены, что хотите закрыть текущую неделю? Все заказ-наряды будут перенесены в архив.',
        confirmText: 'Закрыть неделю',
        confirmPhrase: 'ПОДТВЕРЖДАЮ',
        onConfirm: () => {
            state.socket.emit('closeWeek');
            showNotification('Неделя успешно закрыта и заархивирована.', 'success');
        }
    });
}

function openClearDataModal() {
    openConfirmationModal({
        title: '<i class="fas fa-exclamation-triangle"></i> Очистить все данные',
        text: 'Это действие <strong>необратимо</strong>. Все заказ-наряды и вся история будут удалены навсегда. Пользователи останутся.',
        confirmText: 'Я понимаю, очистить все',
        confirmPhrase: 'ОЧИСТИТЬ',
        onConfirm: () => {
            state.socket.emit('clearData');
            showNotification('Все данные были успешно удалены.', 'success');
        }
    });
}

function updateSalaryRow(masterName) {
    const row = document.querySelector(`#salary-modal tr[data-master-name="${masterName}"]`);
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

// --- ВЫХОД ИЗ СИСТЕМЫ ---
function logout() {
  localStorage.removeItem('vipauto_token');
  localStorage.removeItem('vipauto_user');
  sessionStorage.removeItem('vipauto_token');
  sessionStorage.removeItem('vipauto_user');
  if (state.socket) state.socket.disconnect();
  window.location.href = 'login.html';
}
