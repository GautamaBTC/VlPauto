/*────────────────────────────────────────────
  script.js
  Финальная Сборка - Версия 6.0
  Единый, монолитный, стабильный скрипт.
─────────────────────────────────────────────*/

// --- БЛОК 1: УТИЛИТЫ ---
const formatCurrency = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('ru-RU');
const createElement = (tag, { className, innerHTML, textContent, dataset } = {}) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  if (textContent) el.textContent = textContent;
  if (dataset) Object.assign(el.dataset, dataset);
  return el;
};
const showNotification = (message, type = 'success') => {
  const container = document.getElementById('notification-root');
  if (!container) return;
  const notification = createElement('div', { className: `notification ${type}`, innerHTML: `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-times-circle'}"></i><span>${message}</span>` });
  container.appendChild(notification);
  requestAnimationFrame(() => notification.classList.add('show'));
  setTimeout(() => {
    notification.classList.remove('show');
    notification.addEventListener('transitionend', () => notification.remove(), { once: true });
  }, 3000);
};

// --- БЛОК 2: ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  user: {},
  data: {},
};

// --- БЛОК 3: ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) return; // Если авторизация не пройдена, прекращаем выполнение
    initTheme();
    initClock();
    initSocketConnection();
    initEventListeners();
  } catch (error) {
    console.error("Критическая ошибка при инициализации:", error);
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
  state.currentUser = JSON.parse(userDataString);
  document.getElementById('user-name-display').textContent = state.currentUser.name;
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
  state.socket.on('connect_error', (err) => { if (err.message.includes('token')) logout(); });
  state.socket.on('initialData', (data) => updateAndRender(data, true));
  state.socket.on('dataUpdate', (data) => { updateAndRender(data); showNotification('Данные обновлены', 'success'); });
  state.socket.on('archiveData', (orders) => { state.data.archive = orders; renderArchivePage(); });
  state.socket.on('serverError', (msg) => showNotification(msg, 'error'));
}

function initEventListeners() {
  document.body.addEventListener('click', (e) => {
    const actionTarget = e.target.closest('[data-action]');
    const tabTarget = e.target.closest('[data-tab]');
    if (actionTarget) handleAction(actionTarget);
    if (tabTarget) handleTabSwitch(tabTarget);
  });
  document.getElementById('theme-toggle')?.addEventListener('change', (e) => {
    const newTheme = e.target.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipauto_theme', newTheme);
  });
}

// --- БЛОК 4: ОБРАБОТЧИКИ ДЕЙСТВИЙ ---
function handleAction(target) {
  const { action, id } = target.dataset;
  const actions = {
    'logout': logout,
    'add-order': () => openOrderModal(),
    'view-salary': () => showNotification('Функционал в разработке', 'info'),
    'close-week': openCloseWeekModal,
    'clear-data': openClearDataModal,
    'view-archive': () => {
      const start = document.getElementById('archiveStartDate').value;
      const end = document.getElementById('archiveEndDate').value;
      if (start && end) state.socket.emit('getArchiveData', { startDate: start, endDate: end });
      else showNotification('Выберите даты', 'error');
    },
    'edit-order': () => {
      const order = [...(state.data.weekOrders || []), ...(state.data.archive || [])].find(o => o.id === id);
      if (order) openOrderModal(order);
    },
    'delete-order': () => {
      openConfirmationModal({ title: 'Подтвердить удаление', onConfirm: () => state.socket.emit('deleteOrder', id) });
    }
  };
  if (actions[action]) actions[action]();
}

function handleTabSwitch(target) {
  const tabId = target.dataset.tab;
  if (state.activeTab === tabId) return;
  document.querySelector('.nav-tab.active')?.classList.remove('active');
  target.classList.add('active');
  document.querySelector('.tab-content.active')?.classList.remove('active');
  document.getElementById(tabId)?.classList.add('active');
  state.activeTab = tabId;
  renderContent();
}

// --- БЛОК 5: РЕНДЕРИНГ ---
function updateAndRender(data, isInitialLoad = false) {
  Object.assign(state, { masters: data.masters, user: data.user, data: data });
  adjustUIVisibility();
  if (isInitialLoad) renderHomePage();
  else renderContent();
}

function renderContent() {
  const handlers = { home: renderHomePage, orders: renderOrdersPage, archive: renderArchivePage };
  if (handlers[state.activeTab]) handlers[state.activeTab]();
}

const isPrivileged = () => state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';
const adjustUIVisibility = () => document.body.classList.toggle('is-privileged', isPrivileged());

function renderHomePage() {
  renderDashboard();
  renderLeaderboard();
}

function renderOrdersPage() { renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders); }
function renderArchivePage() { renderOrdersList(document.getElementById('archiveListContainer'), state.data.archive); }

function renderDashboard() {
  const { weekStats, todayOrders } = state.data;
  const personalTodayRevenue = (todayOrders || []).filter(o => o.masterName === state.user.name).reduce((sum, o) => sum + o.amount, 0);
  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);
  document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container || !state.data.leaderboard?.length) return container.innerHTML = '<div class="empty-state"><p>Нет данных для рейтинга</p></div>';
  container.innerHTML = `<table class="leaderboard-table"><thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th></tr></thead><tbody>
    ${state.data.leaderboard.map((m, i) => `<tr class="${m.name === state.user.name ? 'is-current-user' : ''}"><td>${i+1}</td><td>${m.name}</td><td>${formatCurrency(m.revenue)}</td></tr>`).join('')}
    </tbody></table>`;
}

function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders?.length) return container.innerHTML = '<div class="empty-state"><p>Заказов нет</p></div>';
  container.innerHTML = '';
  orders.forEach(order => {
    const item = createElement('div', { className: 'order-item' });
    item.innerHTML = `
      <div class="order-header">
        <p class="order-description">${order.carModel}: ${order.description}</p>
        ${isPrivileged() ? `<div class="order-master">${order.masterName}</div>` : ''}
      </div>
      <div class="order-details">
        <div class="order-meta"><span><i class="fas fa-tag"></i>${order.paymentType}</span><span><i class="far fa-calendar-alt"></i>${formatDate(order.createdAt)}</span></div>
        <div class="order-amount-value">${formatCurrency(order.amount)}</div>
      </div>
       <div class="order-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>
          ${isPrivileged() ? `<button class="btn btn-sm btn-danger" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
    `;
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
  const priv = isPrivileged();
  const modal = createElement('div', { className: 'modal-backdrop' });
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label for="masterName">Исполнитель</label><select name="masterName" id="masterName" ${!priv ? 'disabled' : ''}>${priv ? state.masters.map(n => `<option value="${n}" ${isEdit && order.masterName === n ? 'selected' : ''}>${n}</option>`).join('') : `<option>${state.user.name}</option>`}</select></div><div class="form-group"><label>Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label>Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-group"><label>Сумма</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label>Тип оплаты</label><select name="paymentType">${['Картой', 'Наличные', 'Перевод'].map(t => `<option value="${t}" ${isEdit && order.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
  document.body.appendChild(modal);

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
    const modal = createElement('div', { className: 'modal-backdrop' });
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body"><p>Это действие нельзя отменить.</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" data-action="confirm">Подтвердить</button></div></div>`;
    document.body.appendChild(modal);
    modal.querySelector('[data-action="confirm"]').addEventListener('click', () => { onConfirm(); closeModal(); });
}

function openCloseWeekModal() { openConfirmationModal({ title: 'Закрыть неделю?', onConfirm: () => state.socket.emit('closeWeek') }); }
function openClearDataModal() { openConfirmationModal({ title: 'Очистить все данные?', onConfirm: () => state.socket.emit('clearData') }); }

// --- БЛОК 7: ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
