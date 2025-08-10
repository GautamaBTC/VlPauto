/*────────────────────────────────────────────
  script.js
  Версия 5.0 - "Чистый лист". Единый, монолитный, стабильный скрипт.
─────────────────────────────────────────────*/

// --- БЛОК 1: УТИЛИТЫ (бывший utils.js) ---

/**
 * Показывает всплывающее уведомление.
 */
function showNotification(message, type = 'success') {
  const container = document.getElementById('notification-root');
  if (!container) return;
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
  notification.innerHTML = `<i class="fas ${iconClass}"></i><span>${message}</span>`;
  container.appendChild(notification);
  requestAnimationFrame(() => notification.classList.add('show'));
  setTimeout(() => {
    notification.classList.remove('show');
    notification.addEventListener('transitionend', () => notification.remove(), { once: true });
  }, 4000);
}

/**
 * Форматирует число в валютный формат RUB.
 */
function formatCurrency(value) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}

/**
 * Форматирует дату в формат "ДД.ММ.ГГГГ".
 */
function formatDate(date, withTime = false) {
  if (!date) return '';
  const d = new Date(date);
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
  if (withTime) {
      options.hour = '2-digit';
      options.minute = '2-digit';
  }
  return d.toLocaleDateString('ru-RU', options);
}

/**
 * Создает простой HTML-элемент.
 */
function createElement(tag, options = {}) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.innerHTML) element.innerHTML = options.innerHTML;
  if (options.textContent) element.textContent = options.textContent;
  if (options.dataset) Object.assign(element.dataset, options.dataset);
  return element;
}

/**
 * Скачивает данные как CSV файл.
 */
function downloadCSV(data, filename = 'export') {
    if (!data || data.length === 0) {
        showNotification('Нет данных для экспорта', 'error');
        return;
    }
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// --- БЛОК 2: ЛОГИКА ПРИЛОЖЕНИЯ ---

const SERVER_URL = '';

const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  user: {},
  data: {},
};

// --- ИНИЦИАЛИЗАЦИЯ ---

document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) {
        // Если initAuth вернул false, значит, мы не авторизованы.
        // Перенаправление уже произошло внутри logout().
        return;
    }
    initTheme();
    initSocketConnection();
    initEventListeners();
    initClock();
  } catch (error) {
    console.error("Критическая ошибка при инициализации:", error);
    logout();
  }
});

function initAuth() {
  try {
    state.token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
    const userDataString = localStorage.getItem('vipauto_user') || sessionStorage.getItem('vipauto_user');

    if (!state.token || !userDataString) {
      logout();
      return false; // Явно указываем на неудачу
    }

    state.currentUser = JSON.parse(userDataString);
    document.getElementById('user-name-display').textContent = state.currentUser.name;
    return true; // Успех
  } catch (error) {
    console.error("Ошибка аутентификации:", error);
    logout();
    return false; // Неудача
  }
}

function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.checked = savedTheme === 'light';
}

function initClock() {
    const dateEl = document.getElementById('current-date');
    const timeEl = document.getElementById('current-time');
    if(!dateEl || !timeEl) return;
    const update = () => {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
        timeEl.textContent = now.toLocaleTimeString('ru-RU');
    };
    update();
    setInterval(update, 1000);
}

function initSocketConnection() {
  state.socket = io(SERVER_URL, { auth: { token: state.token } });
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
        const themeToggle = e.target.closest('#theme-toggle');

        if (actionTarget) handleAction(actionTarget);
        else if (tabTarget) handleTabSwitch(tabTarget);
        else if (themeToggle) handleThemeChange(themeToggle);
    });
}


// --- ОБРАБОТЧИКИ ДЕЙСТВИЙ ---

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
            const order = [...state.data.weekOrders, ...state.data.archive].find(o => o.id === id);
            if (order) openOrderModal(order);
        },
        'delete-order': () => {
            const order = [...state.data.weekOrders, ...state.data.archive].find(o => o.id === id);
            if (order) openConfirmationModal({
                title: 'Подтвердить удаление', text: `Удалить заказ-наряд для "${order.carModel}"?`,
                onConfirm: () => state.socket.emit('deleteOrder', id)
            });
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

function handleThemeChange(target) {
    const newTheme = target.checked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipauto_theme', newTheme);
}


// --- РЕНДЕРИНГ ---

function updateAndRender(data, isInitialLoad = false) {
    Object.assign(state, { masters: data.masters, user: data.user, data: data });
    adjustUIVisibility();
    if (isInitialLoad) renderHomePage();
    else renderContent();
}

function renderContent() {
  const handlers = { home: renderHomePage, orders: renderOrdersPage, finance: renderFinancePage, archive: renderArchivePage };
  if (handlers[state.activeTab]) handlers[state.activeTab]();
}

function isPrivileged() { return state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER'; }
function adjustUIVisibility() { document.body.classList.toggle('is-privileged', isPrivileged()); }

function renderHomePage() {
  renderDashboard();
  renderLeaderboard();
  renderOrdersList(document.getElementById('todayOrdersList'), state.data.todayOrders);
}
function renderOrdersPage() { renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders, { showDate: true }); }
function renderFinancePage() { renderOrdersList(document.getElementById('finance-content-wrapper'), state.data.weekOrders, { showDate: true }); }
function renderArchivePage() { renderOrdersList(document.getElementById('archiveListContainer'), state.data.archive, { showDate: true }); }

function renderDashboard() {
    const { weekStats, todayOrders } = state.data;
    const personalTodayRevenue = (todayOrders || []).filter(o => o.masterName === state.user.name).reduce((sum, o) => sum + o.amount, 0);
    const priv = isPrivileged();
    document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
    document.querySelector('#dash-revenue .dashboard-item-title').textContent = priv ? 'Выручка (неделя)' : 'Моя выручка';
    document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount;
    document.querySelector('#dash-orders .dashboard-item-title').textContent = priv ? 'Заказ-наряды' : 'Мои з/н';
    document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);
    document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container || !state.data.leaderboard?.length) return container.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>Нет данных</p></div>';
  container.innerHTML = `<table class="leaderboard-table"><thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th></tr></thead><tbody>
      ${state.data.leaderboard.map((m, i) => `<tr class="${m.name === state.user.name ? 'is-current-user' : ''}"><td>${i+1}</td><td>${m.name}</td><td>${formatCurrency(m.revenue)}</td></tr>`).join('')}
    </tbody></table>`;
}

function renderOrdersList(container, orders, options = {}) {
  if (!container) return;
  if (!orders || !orders.length) return container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Заказов нет</p></div>';
  container.innerHTML = '';
  orders.forEach(order => {
    const item = createElement('div', { className: 'order-item' });
    item.innerHTML = `
      <div class="order-info"><p class="order-description">${order.carModel || 'Авто'}: ${order.description}</p>
        <div class="order-meta">
          ${isPrivileged() ? `<span><i class="fas fa-user"></i>${order.masterName}</span>` : ''}
          <span><i class="fas fa-tag"></i>${order.paymentType}</span>
          ${options.showDate ? `<span><i class="far fa-calendar-alt"></i>${formatDate(order.createdAt)}</span>` : ''}
        </div>
      </div>
      <div class="order-amount"><div class="order-amount-value">${formatCurrency(order.amount)}</div>
        <div class="order-actions">
          <button class="btn btn-sm btn-secondary" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>
          ${isPrivileged() ? `<button class="btn btn-sm btn-secondary" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
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
    modal.addEventListener('transitionend', () => modal.remove(), { once: true });
  }
}

function openOrderModal(order = null) {
  closeModal();
  const isEdit = !!order;
  const priv = isPrivileged();
  const modal = createElement('div', {className: 'modal-backdrop'});
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ-наряд</h3><button class="modal-close-btn">&times;</button></div><div class="modal-body"><form id="order-form"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label for="masterName">Исполнитель</label><select name="masterName" id="masterName" ${!priv ? 'disabled' : ''}>${priv ? state.masters.map(n => `<option value="${n}" ${isEdit && order.masterName === n ? 'selected' : ''}>${n}</option>`).join('') : `<option>${state.user.name}</option>`}</select></div><div class="form-group"><label for="carModel">Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label for="description">Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-grid"><div class="form-group"><label for="amount">Сумма (₽)</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label for="paymentType">Тип оплаты</label><select name="paymentType">${['Картой', 'Наличные', 'Перевод'].map(t => `<option value="${t}" ${isEdit && order.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div></div>`;
  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);

  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    if (e.target.querySelector('#masterName').disabled) formData.append('masterName', state.user.name);
    const data = Object.fromEntries(formData.entries());
    if (!data.amount || +data.amount <= 0) return showNotification('Сумма должна быть больше нуля.', 'error');
    data.amount = +data.amount;
    state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', data);
    closeModal();
  });
}

function openConfirmationModal({ title, text, onConfirm }) {
    closeModal();
    const modal = createElement('div', {className: 'modal-backdrop'});
    modal.innerHTML = `<div class="modal-content" style="max-width: 450px;"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn">&times;</button></div><div class="modal-body"><p>${text}</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" id="confirmBtn">Подтвердить</button></div></div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);
    modal.querySelector('#confirmBtn').addEventListener('click', () => { onConfirm(); closeModal(); });
}

function openCloseWeekModal() { openConfirmationModal({ title: 'Закрыть неделю', text: 'Перенести все заказы в архив?', onConfirm: () => state.socket.emit('closeWeek') }); }
function openClearDataModal() { openConfirmationModal({ title: 'Очистить данные', text: 'Удалить все заказы и сбросить базу к тестовому состоянию?', onConfirm: () => state.socket.emit('clearData') }); }

// --- ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html'); // .replace() чтобы нельзя было вернуться назад по истории браузера
}
