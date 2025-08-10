/*────────────────────────────────────────────
  script.js
  Финальная Сборка - Версия 7.0
  Максимально стабильный и защищенный скрипт.
─────────────────────────────────────────────*/

// --- БЛОК 1: УТИЛИТЫ ---
const formatCurrency = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('ru-RU');
const showNotification = (message, type = 'success') => {
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

// --- БЛОК 2: ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  user: {},
  data: { weekOrders: [], todayOrders: [], leaderboard: [], weekStats: {} },
};

// --- БЛОК 3: ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) return;
    initTheme();
    initClock();
    initSocketConnection();
    initEventListeners();
  } catch (error) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА:", error);
    // В случае любой ошибки, лучше просто разлогинить пользователя
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
    state.currentUser = JSON.parse(userDataString);
    const userNameEl = document.getElementById('user-name-display');
    if (userNameEl) userNameEl.textContent = state.currentUser.name;
  } catch(e) {
    console.error("Ошибка парсинга данных пользователя", e);
    logout();
    return false;
  }
  return true;
}

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if (themeToggle) themeToggle.checked = savedTheme === 'light';
}

function initClock() {
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  if (!dateEl || !timeEl) return;
  const update = () => {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    timeEl.textContent = now.toLocaleTimeString('ru-RU');
  };
  update();
  setInterval(update, 1000);
}

function initSocketConnection() {
  state.socket = io({ auth: { token: state.token } });
  state.socket.on('connect', () => console.log('Подключено к серверу.'));
  state.socket.on('disconnect', () => showNotification('Соединение потеряно', 'error'));
  state.socket.on('connect_error', logout);
  state.socket.on('initialData', (data) => updateAndRender(data, true));
  state.socket.on('dataUpdate', (data) => { updateAndRender(data); showNotification('Данные обновлены', 'success'); });
  state.socket.on('serverError', (msg) => showNotification(msg, 'error'));
}

function initEventListeners() {
  document.body.addEventListener('click', (e) => {
    const actionTarget = e.target.closest('[data-action]');
    const tabTarget = e.target.closest('[data-tab]');
    if (actionTarget) handleAction(actionTarget);
    if (tabTarget) handleTabSwitch(tabTarget);
  });
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
      themeToggle.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('vipauto_theme', newTheme);
      });
  }
}

// --- БЛОК 4: ОБРАБОТЧИКИ ДЕЙСТВИЙ ---
function handleAction(target) {
  const { action, id } = target.dataset;
  const actions = {
    'logout': logout,
    'add-order': () => openOrderModal(),
    'view-salary': () => showNotification('Функционал в разработке', 'info'),
    'close-week': () => openConfirmationModal({ title: 'Закрыть неделю?', onConfirm: () => state.socket.emit('closeWeek') }),
    'clear-data': () => openConfirmationModal({ title: 'Очистить все данные?', onConfirm: () => state.socket.emit('clearData') }),
    'edit-order': () => {
      const order = (state.data.weekOrders || []).find(o => o.id === id);
      if (order) openOrderModal(order);
    },
    'delete-order': () => openConfirmationModal({ title: 'Подтвердить удаление', onConfirm: () => state.socket.emit('deleteOrder', id) }),
  };
  if (actions[action]) actions[action]();
}

function handleTabSwitch(target) {
  const tabId = target.dataset.tab;
  if (state.activeTab === tabId) return;
  document.querySelector('.nav-tab.active')?.classList.remove('active');
  target.classList.add('active');
  document.querySelector('.tab-content.active')?.classList.remove('active');
  const newTabContent = document.getElementById(tabId);
  if (newTabContent) newTabContent.classList.add('active');
  state.activeTab = tabId;
  renderContent();
}

// --- БЛОК 5: РЕНДЕРИНГ ---
function updateAndRender(data, isInitialLoad = false) {
  state.data = data;
  state.user = data.user;
  state.masters = data.masters;
  document.body.classList.toggle('is-privileged', state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER');
  if (isInitialLoad) renderHomePage();
  else renderContent();
}

function renderContent() {
  const handlers = { home: renderHomePage, orders: renderOrdersPage, archive: renderArchivePage };
  if (handlers[state.activeTab]) handlers[state.activeTab]();
}

function renderHomePage() {
  renderDashboard();
  renderLeaderboard();
}

function renderOrdersPage() { renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders); }
function renderArchivePage() { renderOrdersList(document.getElementById('archiveListContainer'), state.data.archive); }

function renderDashboard() {
  const { weekStats, todayOrders } = state.data;
  if (!weekStats || !todayOrders) return;
  const personalTodayRevenue = todayOrders.filter(o => o.masterName === state.user.name).reduce((sum, o) => sum + o.amount, 0);

  const priv = state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';

  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-revenue .dashboard-item-title').textContent = priv ? 'Выручка (неделя)' : 'Моя выручка';

  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);
  document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  if (!state.data.leaderboard?.length) {
    container.innerHTML = '<div class="empty-state"><p>Нет данных для рейтинга</p></div>';
    return;
  }
  container.innerHTML = `<table class="leaderboard-table"><thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th></tr></thead><tbody>
    ${state.data.leaderboard.map((m, i) => `<tr class="${m.name === state.user.name ? 'is-current-user' : ''}"><td>${i+1}</td><td>${m.name}</td><td>${formatCurrency(m.revenue)}</td></tr>`).join('')}
    </tbody></table>`;
}

function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders?.length) {
    container.innerHTML = '<div class="empty-state"><p>Заказов нет</p></div>';
    return;
  }
  container.innerHTML = '';
  orders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML = `
      <div>
        <div class="order-header">
          <p class="order-description">${order.carModel}: ${order.description}</p>
        </div>
        <div class="order-details">
          <div class="order-meta">
            ${state.user.role !== 'MASTER' ? `<span><i class="fas fa-user"></i>${order.masterName}</span>` : ''}
            <span><i class="fas fa-tag"></i>${order.paymentType}</span>
            <span><i class="far fa-calendar-alt"></i>${formatDate(order.createdAt)}</span>
          </div>
        </div>
      </div>
      <div style="text-align: right;">
        <div class="order-amount-value">${formatCurrency(order.amount)}</div>
        <div class="order-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>
          ${state.user.role !== 'MASTER' ? `<button class="btn btn-sm btn-danger" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
    container.appendChild(item);
  });
}

// --- БЛОК 6: МОДАЛЬНЫЕ ОКНА ---
function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

function openOrderModal(order = null) {
  closeModal();
  const isEdit = !!order;
  const priv = state.user.role !== 'MASTER';
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label>Исполнитель</label><select name="masterName" ${!priv ? 'disabled' : ''}>${priv ? state.masters.map(n => `<option value="${n}" ${isEdit && order.masterName === n ? 'selected' : ''}>${n}</option>`).join('') : `<option>${state.user.name}</option>`}</select></div><div class="form-group"><label>Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label>Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-group"><label>Сумма</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label>Тип оплаты</label><select name="paymentType">${['Картой', 'Наличные', 'Перевод'].map(t => `<option value="${t}" ${isEdit && order.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal();
  });

  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    if (!priv) formData.set('masterName', state.user.name);
    const data = Object.fromEntries(formData.entries());
    if (!data.amount || +data.amount <= 0) return showNotification('Сумма должна быть больше нуля.', 'error');
    data.amount = +data.amount;
    state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', data);
    closeModal();
  });
}

function openConfirmationModal({ title, onConfirm }) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body"><p>Это действие нельзя отменить.</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" id="confirmBtn">Подтвердить</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal();
    });
    modal.querySelector('#confirmBtn').addEventListener('click', () => { onConfirm(); closeModal(); });
}

// --- БЛОК 7: ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
