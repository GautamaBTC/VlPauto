/*────────────────────────────────────────────
  script.js
  Финальные доработки - Версия 11.0
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
const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return showNotification('Нет данных для экспорта.', 'error');
    const headers = Object.keys(data[0]);
    const csvContent = [headers.join(','), ...data.map(row => headers.map(h => JSON.stringify(row[h])).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
};

// --- БЛОК 2: ГЛОБАЛЬНОЕ СОСТОЯНИЕ ---
const state = {
  currentUser: null, token: null, socket: null, activeTab: 'home', user: {},
  data: { weekOrders: [], todayOrders: [], leaderboard: [], weekStats: {}, archive: [], history: [] },
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
    document.getElementById('user-name-display').textContent = state.currentUser.name;
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
    'view-salary': openSalaryModal,
    'export-csv': exportCurrentWeekCSV,
    'close-week': openCloseWeekModal,
    'clear-history': () => openConfirmationModal({ title: 'Очистить историю?', text: 'Все архивные записи будут удалены.', onConfirm: () => state.socket.emit('clearHistory') }),
    'clear-data': () => openConfirmationModal({ title: 'Сбросить всё?', text: 'Все текущие заказы и история будут удалены. База вернется к тестовому состоянию.', onConfirm: () => state.socket.emit('clearData') }),
    'edit-order': () => {
      const order = [...(state.data.weekOrders || []), ...(state.data.history.flatMap(h => h.orders) || [])].find(o => o.id === id);
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
  document.body.classList.toggle('is-privileged', isPrivileged());
  renderContent();
}

function renderContent() {
  const handlers = { home: renderHomePage, orders: renderOrdersPage, archive: renderArchivePage };
  if (handlers[state.activeTab]) handlers[state.activeTab]();
}

const isPrivileged = () => state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';
const renderHomePage = () => { renderDashboard(); renderLeaderboard(); };
const renderOrdersPage = () => renderOrdersList(document.getElementById('ordersList'), state.data.weekOrders);
const renderArchivePage = () => renderOrdersList(document.getElementById('archiveListContainer'), state.data.history.flatMap(h => h.orders));

function renderDashboard() {
  const { weekStats, todayOrders, user } = state.data;
  if (!weekStats || !user) return;
  const personalTodayRevenue = (todayOrders || []).filter(o => o.masterName === user.name).reduce((sum, o) => sum + o.amount, 0);
  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-revenue .dashboard-item-title').textContent = isPrivileged() ? 'Выручка (неделя)' : 'Моя выручка';
  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);
  document.querySelector('#dash-today-personal .dashboard-item-value').textContent = formatCurrency(personalTodayRevenue);
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container || !state.data.leaderboard?.length) return container.innerHTML = '<div class="empty-state"><p>Нет данных</p></div>';
  const totalRevenue = state.data.leaderboard.reduce((sum, m) => sum + m.revenue, 0);
  let html = `<table class="leaderboard-table"><thead><tr><th>Место</th><th>Мастер</th>${isPrivileged() ? '<th>Выручка</th><th>Заказы</th>' : '<th>Доля</th>'}</tr></thead><tbody>`;
  html += state.data.leaderboard.map((m, i) => {
    const placeIcon = i < 3 ? `<i class="fas fa-trophy ${['gold', 'silver', 'bronze'][i]}"></i>` : i + 1;
    const valueCell = isPrivileged() ? `<td>${formatCurrency(m.revenue)}</td><td>${m.ordersCount}</td>` : `<td>${totalRevenue > 0 ? ((m.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%'}</td>`;
    return `<tr class="${m.name === state.user.name ? 'is-current-user' : ''}"><td class="leaderboard-place">${placeIcon}</td><td>${m.name}</td>${valueCell}</tr>`;
  }).join('');
  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders?.length) return container.innerHTML = '<div class="empty-state"><p>Заказов нет</p></div>';
  container.innerHTML = '';
  orders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'order-item';
    item.innerHTML = `<div><p class="order-description">${order.carModel}: ${order.description}</p><div class="order-meta">${isPrivileged() ? `<span><i class="fas fa-user"></i>${order.masterName}</span>` : ''}<span><i class="fas fa-tag"></i>${order.paymentType}</span><span><i class="far fa-calendar-alt"></i>${formatDate(order.createdAt)}</span></div></div><div class="order-amount"><div class="order-amount-value">${formatCurrency(order.amount)}</div><div class="order-actions"><button class="btn btn-secondary btn-sm" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>${isPrivileged() ? `<button class="btn btn-danger btn-sm" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}</div></div>`;
    container.appendChild(item);
  });
}

// --- БЛОК 6: МОДАЛЬНЫЕ ОКНА ---
function closeModal() { document.querySelector('.modal-backdrop')?.remove(); }

function openOrderModal(order = null) {
  closeModal();
  const isEdit = !!order;
  const priv = isPrivileged();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label>Исполнитель</label><select name="masterName" ${!priv ? 'disabled' : ''}>${priv ? state.masters.map(n => `<option value="${n}" ${isEdit && order.masterName === n ? 'selected' : ''}>${n}</option>`).join('') : `<option>${state.user.name}</option>`}</select></div><div class="form-group"><label>Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label>Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-group"><label>Сумма</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label>Тип оплаты</label><select name="paymentType">${['Картой', 'Наличные', 'Перевод'].map(t => `<option value="${t}" ${isEdit && order.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
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

function openSalaryModal() {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    const salaryData = state.data.leaderboard.map(m => ({ ...m, salary: m.revenue * 0.5, bonus: 0 }));

    modal.innerHTML = `<div class="modal-content" id="salary-modal-content"><div class="modal-header"><h3 class="modal-title">Расчет Зарплаты</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body"><table class="salary-table leaderboard-table"><thead><tr><th>Мастер</th><th>ЗП (50%)</th><th>Премия</th><th>Итог</th></tr></thead><tbody>
      ${salaryData.map(m => `<tr><td>${m.name}</td><td>${formatCurrency(m.salary)}</td><td><input type="number" class="form-control" data-master-name="${m.name}" value="0"></td><td class="final-salary">${formatCurrency(m.salary)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });

    modal.querySelectorAll('input[type="number"]').forEach(input => {
        input.addEventListener('input', (e) => {
            const masterName = e.target.dataset.masterName;
            const bonus = parseFloat(e.target.value) || 0;
            const masterData = salaryData.find(m => m.name === masterName);
            if (!masterData) return;
            const finalSalary = masterData.salary + bonus;
            const row = e.target.closest('tr');
            if (row) row.querySelector('.final-salary').textContent = formatCurrency(finalSalary);
        });
    });
}

function openConfirmationModal({ title, text, onConfirm }) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body"><p>${text || 'Это действие нельзя отменить.'}</p></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" id="confirmBtn">Подтвердить</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
    modal.querySelector('#confirmBtn').addEventListener('click', () => { onConfirm(); closeModal(); });
}

function openCloseWeekModal() {
    const salaryData = state.data.leaderboard.map(m => ({ ...m, salary: m.revenue * 0.5, bonus: 0 }));
    let reportHtml = `<p>Итоговый отчет за неделю:</p><table class="leaderboard-table"><thead><tr><th>Мастер</th><th>Выручка</th><th>ЗП (50%)</th></tr></thead><tbody>
    ${salaryData.map(m => `<tr><td>${m.name}</td><td>${formatCurrency(m.revenue)}</td><td>${formatCurrency(m.salary)}</td></tr>`).join('')}
    </tbody></table><br><p>После закрытия недели эти заказы будут перенесены в архив. Вы уверены?</p>`;
    openConfirmationModal({ title: 'Закрыть неделю?', text: reportHtml, onConfirm: () => state.socket.emit('closeWeek') });
}

function exportCurrentWeekCSV() {
    const dataToExport = state.data.weekOrders.map(o => ({ 'Дата': formatDate(o.createdAt), 'Мастер': o.masterName, 'Авто': o.carModel, 'Описание': o.description, 'Сумма': o.amount, 'Оплата': o.paymentType }));
    downloadCSV(dataToExport, `week-report-${new Date().toISOString().slice(0,10)}`);
}

// --- БЛОК 7: ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
