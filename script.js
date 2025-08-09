/*────────────────────────────────────────────
  script.js
  Версия 3.0 - Полная переработка логики клиента
─────────────────────────────────────────────*/

import { showNotification, formatCurrency, formatDate, createElement, downloadCSV } from './js/utils.js';

// URL сервера можно оставить пустым для Render, он подхватит автоматически
const SERVER_URL = '';

// Глобальное состояние приложения
const state = {
  currentUser: null,
  token: null,
  socket: null,
  activeTab: 'home',
  masters: [],
  user: {}, // Информация о текущем пользователе с сервера
  data: {
    todayOrders: [],
    weekOrders: [],
    salaryData: [],
    archive: [],
    weekStats: {},
    leaderboard: [],
  },
};

// --- ИНИЦИАЛИЗАЦИЯ ---

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  if (!state.currentUser) return; // Если нет авторизации, ничего не делаем

  initTheme();
  initUI();
  initSocketConnection();
});

// Проверка токена и данных пользователя
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

// Настройка темы (светлая/темная)
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

// Настройка базовых элементов интерфейса и событий
function initUI() {
    // Обновление даты и времени в хедере
    const dateEl = document.getElementById('current-date');
    const timeEl = document.getElementById('current-time');
    if(dateEl && timeEl) {
        const updateDateTime = () => {
            const now = new Date();
            dateEl.textContent = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
            timeEl.textContent = now.toLocaleTimeString('ru-RU');
        };
        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    // Переключение вкладок
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

    // Делегирование кликов по кнопкам действий в списках заказ-нарядов
    document.querySelector('.main-content').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const { action, id } = button.dataset;
        const order = [...state.data.weekOrders, ...state.data.archive].find(o => o.id === id);

        if (action === 'edit' && order) openOrderModal(order);
        if (action === 'delete' && order) {
            openConfirmationModal({
                title: 'Подтвердите удаление',
                text: `Вы уверены, что хотите удалить заказ-наряд для "${order.carModel}" на сумму ${formatCurrency(order.amount)}? Это действие необратимо.`,
                confirmText: 'Удалить',
                onConfirm: () => state.socket.emit('deleteOrder', id)
            });
        }
    });

    // Кнопки быстрых действий и прочие
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('addOrderBtn').addEventListener('click', () => openOrderModal());
    document.getElementById('quickAddOrderBtn').addEventListener('click', () => openOrderModal());
    document.getElementById('quickViewSalaryBtn').addEventListener('click', () => openSalaryModal());
    document.getElementById('quickCloseWeekBtn').addEventListener('click', openCloseWeekModal);
    document.getElementById('quickExportBtn').addEventListener('click', exportSalaryCSV);
    document.getElementById('clearAllDataBtn').addEventListener('click', openClearDataModal);
    document.getElementById('exportFinanceBtn').addEventListener('click', exportSalaryCSV);
    document.getElementById('exportArchiveBtn').addEventListener('click', exportArchiveCSV);
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

// Настройка соединения через Socket.IO
function initSocketConnection() {
  state.socket = io(SERVER_URL, { auth: { token: state.token } });

  state.socket.on('connect', () => console.log('Подключено к серверу'));
  state.socket.on('disconnect', () => showNotification('Соединение потеряно', 'error'));
  state.socket.on('connect_error', (err) => { if (err.message === 'Invalid token') logout(); });

  // Получение первоначальных данных
  state.socket.on('initialData', (data) => {
    console.log('Получены первоначальные данные:', data);
    updateAndRender(data, true); // true - флаг первоначальной загрузки
  });

  // Получение обновлений
  state.socket.on('dataUpdate', (data) => {
    updateAndRender(data);
    showNotification('Данные обновлены', 'success');
  });

  // Получение данных архива
  state.socket.on('archiveData', (archiveOrders) => {
    state.data.archive = archiveOrders;
    renderArchivePage();
    showNotification(`Найдено ${archiveOrders.length} заказ-нарядов`, 'success');
  });

  // Обработка ошибок с сервера
  state.socket.on('serverError', (message) => showNotification(message, 'error'));
}


// --- УПРАВЛЕНИЕ ДАННЫМИ И РЕНДЕРИНГ ---

// Главная функция обновления состояния и перерисовки интерфейса
function updateAndRender(data, isInitialLoad = false) {
    state.masters = data.masters || [];
    state.user = data.user || {};
    Object.assign(state.data, data);

    // **КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ**: при первой загрузке сразу рендерим домашнюю страницу
    if (isInitialLoad) {
        adjustUIVisibility();
        renderHomePage();
    } else {
        renderContent();
    }
}

// Рендеринг контента для активной вкладки
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

// Проверка, является ли пользователь привилегированным
function isPrivileged() {
    return state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';
}

// Настройка видимости элементов в зависимости от роли
function adjustUIVisibility() {
    document.body.classList.toggle('is-privileged', isPrivileged());
}


// --- РЕНДЕРИНГ СТРАНИЦ ---

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


// --- РЕНДЕРИНГ КОМПОНЕНТОВ ---

// **НОВЫЙ РЕНДЕРИНГ ДАШБОРДА**
function renderDashboard() {
    const { weekStats, todayOrders } = state.data;
    const personalTodayRevenue = todayOrders
        .filter(o => o.masterName === state.user.name)
        .reduce((sum, o) => sum + o.amount, 0);

    const isPriv = isPrivileged();

    document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue || 0);
    document.querySelector('#dash-revenue .dashboard-item-title').textContent = isPriv ? 'Выручка (неделя)' : 'Моя выручка (неделя)';

    document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
    document.querySelector('#dash-orders .dashboard-item-title').textContent = isPriv ? 'Заказ-наряды (неделя)' : 'Мои заказ-наряды';

    document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck || 0);

    document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
    document.querySelector('#dash-today-personal .dashboard-item-title').textContent = `Выработка (${new Date().toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})})`;
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container) return;
  if (!state.data.leaderboard || state.data.leaderboard.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-trophy"></i><p>Нет данных для рейтинга.</p></div>';
    return;
  }
  const totalRevenue = state.data.leaderboard.reduce((sum, m) => sum + m.revenue, 0);
  const table = createElement('table', { className: 'leaderboard-table' });
  table.innerHTML = `
    <thead><tr><th>Место</th><th>Мастер</th><th>Выручка</th><th>Доля</th></tr></thead>
    <tbody>
      ${state.data.leaderboard.map((master, index) => `
        <tr class="${master.name === state.user.name ? 'is-current-user' : ''}">
          <td><span class="leaderboard-place" data-place="${index + 1}">${index < 3 ? `<i class="fas fa-trophy"></i>` : index + 1}</span></td>
          <td>${master.name}</td>
          <td>${formatCurrency(master.revenue)}</td>
          <td>${totalRevenue > 0 ? ((master.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%'}</td>
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
    item.innerHTML = `
      <div class="order-info">
        <div class="order-header">
          <p class="order-description">${order.carModel}: ${order.description}</p>
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
            <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${order.id}" title="Редактировать"><i class="fas fa-pen"></i></button>
            ${isPrivileged() ? `<button class="btn btn-sm btn-secondary" data-action="delete" data-id="${order.id}" title="Удалить"><i class="fas fa-trash"></i></button>` : ''}
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
  const isEdit = orderToEdit !== null;
  const priv = isPrivileged();
  const modal = createElement('div', { id: 'order-modal', className: 'modal-backdrop' });

  const masterOptions = state.masters.map(name => `<option value="${name}" ${isEdit && orderToEdit.masterName === name ? 'selected' : ''}>${name}</option>`).join('');
  const paymentOptions = ['Картой', 'Наличные', 'Перевод'].map(type => `<option value="${type}" ${isEdit && orderToEdit.paymentType === type ? 'selected' : ''}>${type}</option>`).join('');

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Редактировать заказ-наряд' : 'Добавить заказ-наряд'}</h3>
        <button class="modal-close-btn">&times;</button>
      </div>
      <div class="modal-body">
        <form id="order-form">
          <input type="hidden" name="id" value="${isEdit ? orderToEdit.id : ''}">
          <div class="form-group">
            <label for="masterName">Исполнитель</label>
            <select name="masterName" id="masterName" ${!priv ? 'disabled' : ''}>
              ${priv ? masterOptions : `<option value="${state.user.name}">${state.user.name}</option>`}
            </select>
          </div>
          <div class="form-group"><label for="carModel">Модель авто</label><input type="text" name="carModel" id="carModel" required value="${isEdit ? orderToEdit.carModel : ''}"></div>
          <div class="form-group"><label for="description">Описание работ</label><textarea name="description" id="description" rows="3" required>${isEdit ? orderToEdit.description : ''}</textarea></div>
          <div class="form-grid">
            <div class="form-group"><label for="amount">Сумма (₽)</label><input type="number" name="amount" id="amount" required value="${isEdit ? orderToEdit.amount : ''}"></div>
            <div class="form-group"><label for="paymentType">Тип оплаты</label><select name="paymentType" id="paymentType">${paymentOptions}</select></div>
          </div>
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
    const form = e.target;
    const formData = new FormData(form);

    // Включаем заблокированное поле исполнителя для отправки
    const masterNameSelect = form.querySelector('#masterName');
    if (masterNameSelect.disabled) {
        formData.append('masterName', masterNameSelect.value);
    }

    const orderData = Object.fromEntries(formData.entries());

    if (!orderData.amount || parseFloat(orderData.amount) <= 0) {
        showNotification('Сумма должна быть больше нуля.', 'error');
        return;
    }
    orderData.amount = parseFloat(orderData.amount);

    state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', orderData);
    closeModal();
  });
}

function openSalaryModal() {
    closeModal();
    const modal = createElement('div', { id: 'salary-modal', className: 'modal-backdrop' });
    const salaryData = state.data.salaryData || [];

    const salaryDataToRender = isPrivileged()
        ? salaryData
        : salaryData.filter(s => s.name === state.user.name);

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 800px;">
        <div class="modal-header"><h3 class="modal-title"><i class="fas fa-wallet"></i> Расчет зарплаты за неделю</h3><button class="modal-close-btn">&times;</button></div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;"><div class="salary-table-container"><table class="leaderboard-table">
          <thead><tr><th>Мастер</th><th>Выручка</th><th>База (50%)</th><th>Премия</th><th>Итог</th></tr></thead>
          <tbody>
            ${salaryDataToRender.map(item => `
              <tr><td>${item.name}</td><td>${formatCurrency(item.total * 2)}</td><td>${formatCurrency(item.total)}</td><td><input type="number" class="bonus-input" data-master="${item.name}" value="0" style="width: 80px;"></td><td class="final-salary"><strong>${formatCurrency(item.total)}</strong></td></tr>
            `).join('')}
          </tbody>
        </table></div></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="exportSalaryBtn">Экспорт в CSV</button>
          <button type="button" class="btn btn-secondary" id="cancelSalaryModalBtn">Закрыть</button>
        </div>
      </div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#cancelSalaryModalBtn').addEventListener('click', closeModal);
    modal.querySelector('#exportSalaryBtn').addEventListener('click', () => exportSalaryCSV(true));

    modal.querySelectorAll('.bonus-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const masterName = e.target.dataset.master;
            const bonus = parseFloat(e.target.value) || 0;
            const baseSalary = salaryData.find(s => s.name === masterName)?.total || 0;
            const finalSalary = baseSalary + bonus;
            const row = e.target.closest('tr');
            row.querySelector('.final-salary').innerHTML = `<strong>${formatCurrency(finalSalary)}</strong>`;
        });
    });
}

function openConfirmationModal({ title, text, confirmText, onConfirm }) {
    closeModal();
    const modal = createElement('div', { className: 'modal-backdrop' });
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 450px;">
        <div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn">&times;</button></div>
        <div class="modal-body"><p>${text}</p></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="cancelBtn">Отмена</button>
          <button type="button" class="btn btn-danger" id="confirmBtn">${confirmText}</button>
        </div>
      </div>`;
    document.getElementById('modal-root').appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));

    modal.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#confirmBtn').addEventListener('click', () => {
        onConfirm();
        closeModal();
    });
}

function openCloseWeekModal() {
    openConfirmationModal({
        title: '<i class="fas fa-calendar-check"></i> Закрыть неделю',
        text: 'Вы уверены? Все текущие заказ-наряды будут перенесены в архив. Это действие нельзя отменить.',
        confirmText: 'Да, закрыть неделю',
        onConfirm: () => state.socket.emit('closeWeek')
    });
}

function openClearDataModal() {
    openConfirmationModal({
        title: '<i class="fas fa-exclamation-triangle"></i> Очистить данные',
        text: 'Вы уверены? Все заказ-наряды и история будут удалены и заменены тестовыми данными. Это действие нельзя отменить.',
        confirmText: 'Да, очистить и сбросить',
        onConfirm: () => state.socket.emit('clearData')
    });
}


// --- ЭКСПОРТ ---

function exportSalaryCSV(includeBonus = false) {
    const dataToExport = state.data.salaryData.map(item => {
        const row = {
            'Мастер': item.name,
            'Выручка': item.total * 2,
            'Зарплата (50%)': item.total,
        };
        if (includeBonus) {
            const bonusInput = document.querySelector(`.bonus-input[data-master="${item.name}"]`);
            const bonus = bonusInput ? parseFloat(bonusInput.value) || 0 : 0;
            row['Премия'] = bonus;
            row['Итог'] = item.total + bonus;
        }
        return row;
    });
    downloadCSV(dataToExport, `salary-report-${new Date().toISOString().slice(0,10)}`);
}

function exportArchiveCSV() {
    if (!state.data.archive || state.data.archive.length === 0) {
        return showNotification('Нет данных в архиве для экспорта.', 'error');
    }
    const dataToExport = state.data.archive.map(order => ({
        'Дата': formatDate(order.createdAt, true),
        'Мастер': order.masterName,
        'Автомобиль': order.carModel,
        'Описание': order.description,
        'Сумма': order.amount,
        'Тип оплаты': order.paymentType,
    }));
    downloadCSV(dataToExport, `archive-report-${new Date().toISOString().slice(0,10)}`);
}


// --- ВЫХОД ИЗ СИСТЕМЫ ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.href = 'login.html';
}
