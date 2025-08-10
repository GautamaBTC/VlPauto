/*────────────────────────────────────────────
  script.js
  Версия 4.0 - Полная переработка с фокусом на стабильность
─────────────────────────────────────────────*/

// Вспомогательные утилиты импортируем из отдельного файла
import { showNotification, formatCurrency, formatDate, createElement, downloadCSV } from './js/utils.js';

// URL сервера (пусто для Render)
const SERVER_URL = '';

// Глобальное состояние приложения, где хранятся все данные
const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  user: {},
  data: {
    todayOrders: [],
    weekOrders: [],
    salaryData: [],
    archive: [],
    weekStats: {},
    leaderboard: [],
  },
};

// --- ГЛАВНАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ ---

// Запускается, когда весь HTML-документ загружен
document.addEventListener('DOMContentLoaded', () => {
  // Помещаем весь запуск в try-catch для отлова любых критических ошибок
  try {
    initAuth(); // 1. Проверяем авторизацию
    if (!state.currentUser) return; // Если не авторизован, прерываем выполнение

    initTheme(); // 2. Устанавливаем тему
    initSocketConnection(); // 3. Подключаемся к серверу
    initEventListeners(); // 4. Вешаем ЕДИНЫЙ обработчик событий
    initClock(); // 5. Запускаем часы в хедере
  } catch (error) {
    console.error("Критическая ошибка при инициализации:", error);
    // В случае любой ошибки - отправляем на страницу входа для безопасности
    logout();
  }
});


// --- ФУНКЦИИ ИНИЦИАЛИЗАЦИИ ---

/**
 * Проверяет наличие токена и данных пользователя.
 * Если их нет или они некорректны - перенаправляет на страницу входа.
 * Это ключевой барьер безопасности.
 */
function initAuth() {
  try {
    state.token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
    const userDataString = localStorage.getItem('vipauto_user') || sessionStorage.getItem('vipauto_user');

    if (!state.token || !userDataString) {
      logout(); // Если чего-то нет, выходим
      return;
    }

    state.currentUser = JSON.parse(userDataString);
    document.getElementById('user-name-display').textContent = state.currentUser.name;
  } catch (error) {
    console.error("Ошибка парсинга данных пользователя:", error);
    logout(); // Если данные пользователя 'битые', выходим
  }
}

/**
 * Инициализирует тему (светлую/темную) и переключатель.
 */
function initTheme() {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;

  const htmlEl = document.documentElement;
  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';

  htmlEl.setAttribute('data-theme', savedTheme);
  themeToggle.checked = savedTheme === 'light';
  // Обработчик теперь в initEventListeners
}

/**
 * Запускает часы в хедере
 */
function initClock() {
    const dateEl = document.getElementById('current-date');
    const timeEl = document.getElementById('current-time');
    if(!dateEl || !timeEl) return;

    const updateDateTime = () => {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' });
        timeEl.textContent = now.toLocaleTimeString('ru-RU');
    };
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

/**
 * Устанавливает соединение с сервером через Socket.IO
 */
function initSocketConnection() {
  state.socket = io(SERVER_URL, { auth: { token: state.token } });

  state.socket.on('connect', () => console.log('Подключено к серверу.'));
  state.socket.on('disconnect', () => showNotification('Соединение потеряно', 'error'));
  state.socket.on('connect_error', (err) => {
    if (err.message.includes('Invalid token')) {
        showNotification('Сессия истекла. Пожалуйста, войдите снова.', 'error');
        logout();
    }
  });

  state.socket.on('initialData', (data) => {
    updateAndRender(data, true);
  });

  state.socket.on('dataUpdate', (data) => {
    updateAndRender(data);
    showNotification('Данные обновлены', 'success');
  });

  state.socket.on('archiveData', (archiveOrders) => {
    state.data.archive = archiveOrders;
    renderArchivePage();
    showNotification(`Найдено ${archiveOrders.length} заказ-нарядов`, 'success');
  });

  state.socket.on('serverError', (message) => showNotification(message, 'error'));
}

/**
 * **КЛЮЧЕВОЕ ИЗМЕНЕНИЕ**
 * Устанавливает один глобальный обработчик кликов, который управляет всем.
 * Это решает проблему "неработающих кнопок".
 */
function initEventListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target;
        const actionTarget = target.closest('[data-action]');
        const tabTarget = target.closest('[data-tab]');

        if (actionTarget) {
            const { action, id } = actionTarget.dataset;
            handleAction(action, id);
        } else if (tabTarget) {
            handleTabSwitch(tabTarget.dataset.tab);
        } else if (target.matches('#theme-toggle')) {
            handleThemeChange(target.checked);
        }
    });
}

// --- ОБРАБОТЧИКИ ДЕЙСТВИЙ ---

/**
 * Выполняет действие в зависимости от атрибута data-action
 */
function handleAction(action, id) {
    const actions = {
        'logout': logout,
        'add-order': () => openOrderModal(),
        'view-salary': openSalaryModal,
        'close-week': openCloseWeekModal,
        'export-salary': exportSalaryCSV,
        'clear-data': openClearDataModal,
        'export-archive': exportArchiveCSV,
        'view-archive': () => {
            const startDate = document.getElementById('archiveStartDate').value;
            const endDate = document.getElementById('archiveEndDate').value;
            if (startDate && endDate) state.socket.emit('getArchiveData', { startDate, endDate });
            else showNotification('Пожалуйста, выберите даты', 'error');
        },
        'edit-order': () => {
            const order = [...state.data.weekOrders, ...state.data.archive].find(o => o.id === id);
            if (order) openOrderModal(order);
        },
        'delete-order': () => {
            const order = [...state.data.weekOrders, ...state.data.archive].find(o => o.id === id);
            if (order) openConfirmationModal({
                title: 'Подтвердите удаление',
                text: `Удалить заказ-наряд для "${order.carModel}"?`,
                confirmText: 'Удалить',
                onConfirm: () => state.socket.emit('deleteOrder', id)
            });
        }
    };
    if (actions[action]) {
        actions[action]();
    }
}

/**
 * Переключает вкладки
 */
function handleTabSwitch(tabId) {
    if (state.activeTab === tabId) return;

    document.querySelector('.nav-tab.active')?.classList.remove('active');
    document.querySelector(`.nav-tab[data-tab="${tabId}"]`)?.classList.add('active');

    document.querySelector('.tab-content.active')?.classList.remove('active');
    document.getElementById(tabId)?.classList.add('active');

    state.activeTab = tabId;
    renderContent();
}

/**
 * Изменяет тему
 */
function handleThemeChange(isChecked) {
    const newTheme = isChecked ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('vipauto_theme', newTheme);
}


// --- УПРАВЛЕНИЕ ДАННЫМИ И РЕНДЕРИНГ ---

function updateAndRender(data, isInitialLoad = false) {
    state.masters = data.masters || [];
    state.user = data.user || {};
    Object.assign(state.data, data);

    if (isInitialLoad) {
        adjustUIVisibility();
        renderHomePage();
    } else {
        renderContent();
    }
}

function renderContent() {
  adjustUIVisibility();
  const handlers = {
    home: renderHomePage,
    orders: renderOrdersPage,
    finance: renderFinancePage,
    archive: renderArchivePage,
  };
  if (handlers[state.activeTab]) {
      handlers[state.activeTab]();
  }
}

function isPrivileged() {
    return state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';
}

function adjustUIVisibility() {
    document.body.classList.toggle('is-privileged', isPrivileged());
}


// --- РЕНДЕРИНГ СТРАНИЦ И КОМПОНЕНТОВ ---

function renderHomePage() {
  renderDashboard();
  renderLeaderboard();
  renderOrdersList(document.getElementById('todayOrdersList'), state.data.todayOrders, { showMaster: isPrivileged(), showDate: false });
}

function renderOrdersPage() {
  renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders, { showMaster: isPrivileged(), showDate: true });
}

function renderFinancePage() {
    const container = document.getElementById('finance-content-wrapper');
    if (!container) return;
    container.innerHTML = '';

    const tableContainer = createElement('div', { className: 'leaderboard-container' });
    const table = createElement('table', { className: 'leaderboard-table' });

    const salaryDataToRender = isPrivileged()
        ? state.data.salaryData
        : state.data.salaryData.filter(s => s.name === state.user.name);

    table.innerHTML = `
      <thead><tr><th>Мастер</th><th>Выручка</th><th>Зарплата (50%)</th></tr></thead>
      <tbody>
        ${salaryDataToRender.map(item => `
          <tr>
            <td>${item.name}</td>
            <td>${formatCurrency(item.total * 2)}</td>
            <td><strong>${formatCurrency(item.total)}</strong></td>
          </tr>`).join('')}
      </tbody>`;
    tableContainer.appendChild(table);
    container.appendChild(tableContainer);
}

function renderArchivePage() {
  const container = document.getElementById('archiveListContainer');
  if (!state.data.archive || state.data.archive.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Данные за выбранный период отсутствуют.</p></div>';
    return;
  }
  renderOrdersList(container, state.data.archive, { showMaster: isPrivileged(), showDate: true });
}

function renderDashboard() {
    const { weekStats, todayOrders } = state.data;
    const personalTodayRevenue = (todayOrders || [])
        .filter(o => o.masterName === state.user.name)
        .reduce((sum, o) => sum + o.amount, 0);

    const isPriv = isPrivileged();

    document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue || 0);
    document.querySelector('#dash-revenue .dashboard-item-title').textContent = isPriv ? 'Выручка (неделя)' : 'Моя выручка (неделя)';

    document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
    document.querySelector('#dash-orders .dashboard-item-title').textContent = isPriv ? 'Заказ-наряды (неделя)' : 'Мои заказ-наряды';

    document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck || 0);

    document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container || !state.data.leaderboard || state.data.leaderboard.length === 0) {
    if(container) container.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>Нет данных для рейтинга.</p></div>';
    return;
  }
  const totalRevenue = state.data.leaderboard.reduce((sum, m) => sum + m.revenue, 0);
  container.innerHTML = `<table class="leaderboard-table">
    <thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th><th>Доля</th></tr></thead>
    <tbody>
      ${state.data.leaderboard.map((master, index) => `
        <tr class="${master.name === state.user.name ? 'is-current-user' : ''}">
          <td><span class="leaderboard-place" data-place="${index + 1}">${index < 3 ? `<i class="fas fa-trophy"></i>` : index + 1}</span></td>
          <td>${master.name}</td>
          <td>${formatCurrency(master.revenue)}</td>
          <td>${totalRevenue > 0 ? ((master.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%'}</td>
        </tr>`).join('')}
    </tbody></table>`;
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
    item.innerHTML = `
      <div class="order-info">
        <div class="order-header">
          <p class="order-description">${order.carModel || 'Авто'}: ${order.description}</p>
          ${options.showMaster ? `<div class="order-master">${order.masterName}</div>` : ''}
        </div>
        <div class="order-details">
          <span><i class="fas fa-tag"></i> ${order.paymentType}</span>
          ${options.showDate ? `<span><i class="far fa-calendar-alt"></i> ${formatDate(order.createdAt)}</span>` : ''}
        </div>
      </div>
      <div class="order-amount">
        <div class="order-amount-value">${formatCurrency(order.amount)}</div>
        <div class="order-actions">
            <button class="btn btn-sm btn-secondary" data-action="edit-order" data-id="${order.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
            ${isPrivileged() ? `<button class="btn btn-sm btn-secondary" data-action="delete-order" data-id="${order.id}" title="Удалить"><i class="fas fa-trash"></i></button>` : ''}
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

function openOrderModal(orderToEdit = null) {
  closeModal();
  const isEdit = !!orderToEdit;
  const priv = isPrivileged();
  const modal = createElement('div', { id: 'order-modal', className: 'modal-backdrop' });

  const masterOptions = state.masters.map(name => `<option value="${name}" ${isEdit && orderToEdit.masterName === name ? 'selected' : ''}>${name}</option>`).join('');
  const paymentOptions = ['Картой', 'Наличные', 'Перевод'].map(type => `<option value="${type}" ${isEdit && orderToEdit.paymentType === type ? 'selected' : ''}>${type}</option>`).join('');

  modal.innerHTML = `
    <div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ-наряд</h3><button class="modal-close-btn">&times;</button></div>
      <div class="modal-body"><form id="order-form">
          <input type="hidden" name="id" value="${isEdit ? orderToEdit.id : ''}">
          <div class="form-group"><label for="masterName">Исполнитель</label><select name="masterName" id="masterName" ${!priv ? 'disabled' : ''}>${priv ? masterOptions : `<option value="${state.user.name}">${state.user.name}</option>`}</select></div>
          <div class="form-group"><label for="carModel">Модель авто</label><input type="text" name="carModel" id="carModel" required value="${isEdit ? orderToEdit.carModel || '' : ''}"></div>
          <div class="form-group"><label for="description">Описание работ</label><textarea name="description" id="description" rows="3" required>${isEdit ? orderToEdit.description : ''}</textarea></div>
          <div class="form-grid"><div class="form-group"><label for="amount">Сумма (₽)</label><input type="number" name="amount" id="amount" required value="${isEdit ? orderToEdit.amount : ''}"></div><div class="form-group"><label for="paymentType">Тип оплаты</label><select name="paymentType" id="paymentType">${paymentOptions}</select></div></div>
          <div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div>
      </form></div></div>`;
  document.getElementById('modal-root').appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('show'));

  modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    if (form.querySelector('#masterName').disabled) {
        formData.append('masterName', form.querySelector('#masterName').value);
    }
    const orderData = Object.fromEntries(formData.entries());
    if (!orderData.amount || parseFloat(orderData.amount) <= 0) return showNotification('Сумма должна быть больше нуля.', 'error');
    orderData.amount = parseFloat(orderData.amount);
    state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', orderData);
    closeModal();
  });
}

function openConfirmationModal({ title, text, confirmText, onConfirm }) {
    closeModal();
    const modal = createElement('div', { className: 'modal-backdrop' });
    modal.innerHTML = `<div class="modal-content" style="max-width: 450px;"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn">&times;</button></div><div class="modal-body"><p>${text}</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" id="confirmBtn">${confirmText}</button></div></div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('[data-action="close-modal"]').addEventListener('click', closeModal);
    modal.querySelector('#confirmBtn').addEventListener('click', () => { onConfirm(); closeModal(); });
}

function openCloseWeekModal() { openConfirmationModal({ title: 'Закрыть неделю', text: 'Перенести все текущие заказ-наряды в архив?', confirmText: 'Да, закрыть', onConfirm: () => state.socket.emit('closeWeek') }); }
function openClearDataModal() { openConfirmationModal({ title: 'Очистить данные', text: 'Все заказ-наряды и история будут удалены и заменены тестовым набором. Уверены?', confirmText: 'Да, очистить', onConfirm: () => state.socket.emit('clearData') }); }
function openSalaryModal() { /* ... implementation needed ... */ showNotification('Просмотр зарплаты в разработке', 'info'); }


// --- УТИЛИТЫ ---

function exportSalaryCSV() { downloadCSV(state.data.salaryData.map(i => ({ Мастер: i.name, Выручка: i.total * 2, 'З/П': i.total })), 'salary'); }
function exportArchiveCSV() { downloadCSV(state.data.archive, 'archive'); }

function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.href = 'login.html';
}
