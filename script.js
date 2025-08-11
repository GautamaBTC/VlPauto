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
  token: null, socket: null, activeTab: 'home', user: {},
  data: { weekOrders: [], todayOrders: [], leaderboard: [], weekStats: {}, archive: [], history: [] },
  selectedMaster: 'all',
};

// --- БЛОК 3: ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) return;
    initTheme();
    initClock();
    initSocketConnection();
    initEventListeners();

    const savedTabId = localStorage.getItem('vipauto_active_tab') || 'home';
    const tabToActivate = document.querySelector(`.nav-tab[data-tab="${savedTabId}"]`);

    if (tabToActivate && tabToActivate.style.display !== 'none') {
        tabToActivate.click();
    } else {
        document.querySelector('.nav-tab[data-tab="home"]').click();
    }
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
    // Apply privileged class immediately on load
    document.body.classList.toggle('is-privileged', isPrivileged());
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
  state.socket.on('connect_error', (err) => {
    console.error('Socket connect_error:', err);
    showNotification('Ошибка подключения к серверу.', 'error');
  });
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
  document.getElementById('apply-archive-filter')?.addEventListener('click', renderArchivePage);
  document.getElementById('master-filter')?.addEventListener('change', (e) => {
    state.selectedMaster = e.target.value;
    renderOrdersPage();
  });
  // Use event delegation for the finalize button since it's added dynamically
  document.body.addEventListener('click', e => {
      if (e.target.id === 'finalize-week-btn') {
          finalizeWeek();
      }
  });
}

// --- БЛОК 4: ОБРАБОТЧИКИ ДЕЙСТВИЙ ---
function handleAction(target) {
  const { action, id } = target.dataset;
  const actions = {
    'logout': logout,
    'add-order': () => openOrderModal(),
    'view-clients': () => showNotification('Раздел "Клиенты" находится в разработке.', 'success'),
    'open-export-modal': openExportModal,
    'export-period': () => {
        const period = target.dataset.period;
        if(period) exportData(period);
    },
    'close-week': () => {
        const financeTab = document.querySelector('[data-tab="finance"]');
        if (financeTab) financeTab.click();
    },
    'clear-history': () => openConfirmationModal({ title: 'Очистить историю?', text: 'Все архивные записи будут удалены.', onConfirm: () => state.socket.emit('clearHistory') }),
    'clear-data': () => openClearDataCaptchaModal(),
    'edit-order': () => {
      const order = [...(state.data.weekOrders || []), ...(state.data.history.flatMap(h => h.orders) || [])].find(o => o.id === id);
      if (order) openOrderModal(order);
    },
    'delete-order': () => openConfirmationModal({ title: 'Подтвердить удаление', onConfirm: () => state.socket.emit('deleteOrder', id) }),
    'award-bonus': () => {
      const masterName = target.dataset.masterName;
      if (masterName) openBonusModal(masterName);
    },
    'view-archived-week': () => {
      const weekId = target.dataset.weekId;
      const weekData = state.data.history.find(w => w.weekId === weekId);
      if (weekData) openArchivedWeekModal(weekData);
    },
  };
  if (actions[action]) actions[action]();
}

function handleTabSwitch(target) {
  const tabId = target.dataset.tab;
  if (state.activeTab === tabId) return;

  localStorage.setItem('vipauto_active_tab', tabId);

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
  const handlers = { home: renderHomePage, orders: renderOrdersPage, archive: renderArchivePage, finance: renderFinancePage };
  if (handlers[state.activeTab]) handlers[state.activeTab]();
}

const isPrivileged = () => state.user.role === 'DIRECTOR' || state.user.role === 'SENIOR_MASTER';

const renderHomePage = () => { renderDashboard(); renderMainContributionChart(); };
function renderOrdersStats() {
    const container = document.getElementById('orders-stats-container');
    if (!isPrivileged() || !container) {
        if(container) container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Create a new date for start of month to avoid mutating 'now'
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const ordersToday = allOrders.filter(o => o.createdAt.slice(0, 10) === today);
    const ordersThisWeek = state.data.weekOrders;
    const ordersThisMonth = allOrders.filter(o => new Date(o.createdAt) >= startOfMonth);
    const ordersThisYear = allOrders.filter(o => new Date(o.createdAt) >= startOfYear);

    const countOrdersByMaster = (orders) => orders.reduce((acc, order) => {
        acc[order.masterName] = (acc[order.masterName] || 0) + 1;
        return acc;
    }, {});

    const stats = {
        day: { total: ordersToday.length },
        week: { total: ordersThisWeek.length, byMaster: countOrdersByMaster(ordersThisWeek) },
        month: { total: ordersThisMonth.length },
        year: { total: ordersThisYear.length },
    };

    let masterDetailsHtml = Object.entries(stats.week.byMaster)
        .sort((a, b) => b[1] - a[1]) // Sort by count descending
        .map(([name, count]) => `<li><strong>${name}:</strong> ${count}</li>`)
        .join('');

    if (!masterDetailsHtml) {
        masterDetailsHtml = '<li>Нет данных за неделю</li>';
    }

    const html = `
        <div class="orders-stats-grid">
            <div class="stats-period">
                <div class="stats-header">За день</div>
                <div class="stats-total">${stats.day.total}</div>
            </div>
            <div class="stats-period">
                <div class="stats-header">За неделю</div>
                <div class="stats-total">${stats.week.total}</div>
            </div>
            <div class="stats-period">
                <div class="stats-header">За месяц</div>
                <div class="stats-total">${stats.month.total}</div>
            </div>
            <div class="stats-period">
                <div class="stats-header">За год</div>
                <div class="stats-total">${stats.year.total}</div>
            </div>
        </div>
        <div class="master-stats-details">
            <h4 class="master-stats-title">Вклад мастеров (за неделю)</h4>
            <ul>${masterDetailsHtml}</ul>
        </div>
    `;
    container.innerHTML = html;
}

const renderOrdersPage = () => {
    renderOrdersStats();
    const container = document.getElementById('ordersList');
    const masterFilter = document.getElementById('master-filter');
    const filterContainer = document.querySelector('.order-filters');
    let orders = state.data.weekOrders;

    if (isPrivileged()) {
        filterContainer.style.display = 'flex';

        const currentFilterValue = masterFilter.value;

        masterFilter.innerHTML = '<option value="all">Все мастера</option>';
        state.masters.forEach(name => {
            masterFilter.innerHTML += `<option value="${name}">${name}</option>`;
        });

        masterFilter.value = state.selectedMaster || 'all';

        const selectedMaster = masterFilter.value;
        if (selectedMaster && selectedMaster !== 'all') {
            orders = orders.filter(o => o.masterName === selectedMaster);
        }
    } else {
        if (filterContainer) filterContainer.style.display = 'none';
    }

    renderOrdersList(container, orders);
};
const renderArchivePage = () => {
    const container = document.getElementById('archiveListContainer');
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;

    // If any filter is active, show flat list of orders
    if (startDate || endDate) {
        const allArchivedOrders = state.data.history.flatMap(h => h.orders);

        const start = startDate ? new Date(startDate + 'T00:00:00.000Z') : null;
        const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : null;

        const filteredOrders = allArchivedOrders.filter(order => {
            if (!order.createdAt) return false;
            const orderDate = new Date(order.createdAt);
            if (start && orderDate < start) return false;
            if (end && orderDate > end) return false;
            return true;
        });
        renderOrdersList(container, filteredOrders);
    } else {
        // Otherwise, show list of weeks
        if (!state.data.history?.length) {
            container.innerHTML = '<div class="empty-state"><p>Архив пуст.</p></div>';
            return;
        }

        container.innerHTML = `<div class="week-summary-list">` + state.data.history.map(week => {
            const weekRevenue = week.orders.reduce((sum, o) => sum + o.amount, 0);
            // Sort orders by date to find the first and last date of the week
            const sortedOrders = [...week.orders].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
            const firstOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[0].createdAt) : 'N/A';
            const lastOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[sortedOrders.length - 1].createdAt) : 'N/A';

            return `
                <div class="week-summary-item" data-action="view-archived-week" data-week-id="${week.weekId}">
                    <div class="week-summary-header">
                        <span class="week-date">Неделя: ${firstOrderDate} - ${lastOrderDate}</span>
                        <span class="week-revenue">${formatCurrency(weekRevenue)}</span>
                    </div>
                    <div class="week-summary-meta">
                        <span>Заказ-нарядов: ${week.orders.length}</span>
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>
            `;
        }).join('') + `</div>`;
    }
};

function openExportModal() {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Экспорт данных</h3>
        <button class="modal-close-btn" data-action="close-modal">&times;</button>
      </div>
      <div class="modal-body" style="display: grid; gap: 12px;">
        <button class="btn btn-secondary btn-full-width" data-action="export-period" data-period="week">Экспорт за текущую неделю</button>
        <button class="btn btn-secondary btn-full-width" data-action="export-period" data-period="month">Экспорт за текущий месяц</button>
        <button class="btn btn-secondary btn-full-width" data-action="export-period" data-period="year">Экспорт за текущий год</button>
        <button class="btn btn-secondary btn-full-width" data-action="export-period" data-period="custom">Экспорт за выбранный период</button>
      </div>
    </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="close-modal"]') || e.target === modal) {
            closeModal();
        }
    });
}

function exportData(period) {
    closeModal();
    let ordersToExport = [];
    const now = new Date();
    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];

    if (period === 'week') {
        ordersToExport = state.data.weekOrders;
    } else if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        ordersToExport = allOrders.filter(o => new Date(o.createdAt) >= startOfMonth);
    } else if (period === 'year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        ordersToExport = allOrders.filter(o => new Date(o.createdAt) >= startOfYear);
    } else if (period === 'custom') {
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;
        if (!startDate || !endDate) {
            return showNotification('Пожалуйста, выберите начальную и конечную дату.', 'error');
        }
        const start = new Date(startDate + 'T00:00:00.000Z');
        const end = new Date(endDate + 'T23:59:59.999Z');
        ordersToExport = allOrders.filter(o => {
            const orderDate = new Date(o.createdAt);
            return orderDate >= start && orderDate <= end;
        });
    }

    if (!ordersToExport.length) {
        return showNotification('Нет данных для экспорта за указанный период.', 'error');
    }

    const data = ordersToExport.map(o => ({
        'Дата': formatDate(o.createdAt),
        'Мастер': o.masterName,
        'Авто': o.carModel,
        'Описание': o.description,
        'Имя клиента': o.clientName || '',
        'Телефон клиента': o.clientPhone || '',
        'Сумма': o.amount,
        'Оплата': o.paymentType
    }));
    downloadCSV(data, `report-${period}-${new Date().toISOString().slice(0,10)}`);
}


function renderFinancePage() {
  const container = document.getElementById('finance-content-container');
  if (!isPrivileged()) {
    container.innerHTML = '<div class="empty-state"><p>Доступ запрещен.</p></div>';
    return;
  }

  // For now, we will only work with weekly data.
  // Time period filtering will be added later.
  const weeklyLeaderboard = state.data.leaderboard || [];
  const totalRevenue = weeklyLeaderboard.reduce((sum, m) => sum + m.revenue, 0);
  const totalOrders = weeklyLeaderboard.reduce((sum, m) => sum + m.ordersCount, 0);
  const directorProfit = totalRevenue * 0.5; // Assuming 50% profit margin for the director

  // --- HTML Structure ---
  let html = `
    <div class="finance-header">
      <div class="dashboard" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
        <div class="dashboard-item">
          <div class="dashboard-item-title">Общая выручка</div>
          <div class="dashboard-item-value">${formatCurrency(totalRevenue)}</div>
        </div>
        <div class="dashboard-item">
          <div class="dashboard-item-title">Прибыль сервиса</div>
          <div class="dashboard-item-value">${formatCurrency(directorProfit)}</div>
        </div>
        <div class="dashboard-item">
          <div class="dashboard-item-title">Всего заказ-нарядов</div>
          <div class="dashboard-item-value">${totalOrders}</div>
        </div>
      </div>
    </div>

    <div class="section">
        <div class="section-header"><h3 class="section-title">Вклад мастеров</h3></div>
        <div id="finance-pie-chart-container" class="section-content" style="padding: 16px; display: flex; justify-content: center; align-items: center; min-height: 350px;"></div>
    </div>

    <div class="section">
        <div class="section-header"><h3 class="section-title">Расчет зарплаты и премии</h3></div>
        <div class="salary-calculation-list">
  `;

  if (weeklyLeaderboard.length > 0) {
    weeklyLeaderboard.forEach(master => {
      const baseSalary = master.revenue * 0.5;
      html += `
        <div class="salary-item" data-master-name="${master.name}">
          <div class="salary-item-header">
            <span class="master-name">${master.name}</span>
            <span class="final-salary" data-base-salary="${baseSalary}">${formatCurrency(baseSalary)}</span>
          </div>
          <div class="salary-details">
            <span>Выручка: <strong>${formatCurrency(master.revenue)}</strong></span>
            <span>База (50%): <strong>${formatCurrency(baseSalary)}</strong></span>
          </div>
          <div class="salary-actions">
            <button class="btn btn-secondary btn-sm" data-action="award-bonus" data-master-name="${master.name}">
              <i class="fas fa-plus"></i> Премировать
            </button>
          </div>
        </div>
      `;
    });
  } else {
    html += '<div class="empty-state"><p>Нет данных для расчета.</p></div>';
  }

  html += `
        </div>
    </div>
    <div class="finance-actions">
        <button id="finalize-week-btn" class="btn btn-success quick-action-main">
            <i class="fas fa-check-circle"></i> Закрыть неделю и начислить ЗП
        </button>
    </div>
  `;

  container.innerHTML = html;

  // Render charts
  renderFinanceCharts(weeklyLeaderboard);

  // Event listeners for bonus button will be added in a separate step
}

function renderFinanceCharts(leaderboardData) {
    // Pie Chart
    const pieContainer = document.getElementById('finance-pie-chart-container');
    if (pieContainer) {
        if (!leaderboardData || leaderboardData.length === 0) {
            pieContainer.innerHTML = '<div class="empty-state"><p>Нет данных для графика.</p></div>';
            return;
        }

        const totalRevenue = leaderboardData.reduce((sum, item) => sum + item.revenue, 0);
        const colors = ['#38BDF8', '#FBBF24', '#34D399', '#F87171', '#818CF8', '#A78BFA'];

        let cumulativePercent = 0;
        const segments = leaderboardData.map((item, index) => {
            const percent = totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0;
            const startAngle = cumulativePercent / 100 * 360;
            cumulativePercent += percent;
            return `<circle class="pie-chart-slice" r="25" cx="50" cy="50" fill="transparent"
                        stroke="${colors[index % colors.length]}"
                        stroke-width="50"
                        stroke-dasharray="${percent} ${100 - percent}"
                        stroke-dashoffset="${25 - startAngle / 3.6}"
                        transform="rotate(-90 50 50)"></circle>`;
        }).join('');

        const legend = leaderboardData.map((item, index) => `
            <div class="pie-chart-legend-item">
                <span class="legend-color-box" style="background-color: ${colors[index % colors.length]}"></span>
                <span class="legend-label">${item.name} (${((item.revenue / totalRevenue) * 100).toFixed(1)}%)</span>
            </div>
        `).join('');

        pieContainer.innerHTML = `
            <div class="pie-chart-wrapper">
                <svg viewBox="0 0 100 100" class="pie-chart">${segments}</svg>
                <div class="pie-chart-legend">${legend}</div>
            </div>`;
    }
}

function renderDashboard() {
  const { weekStats, todayOrders, user } = state.data;
  if (!weekStats || !user) return;

  const userIsPrivileged = isPrivileged();

  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-revenue .dashboard-item-title').textContent = userIsPrivileged ? 'Выручка (неделя)' : 'Моя выручка';
  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);

  const todayValueEl = document.querySelector('#dash-today-personal .dashboard-item-value');
  const todayTitleEl = document.querySelector('#dash-today-personal .dashboard-item-title');

  if(userIsPrivileged) {
    const totalTodayRevenue = (todayOrders || []).reduce((sum, o) => sum + o.amount, 0);
    todayValueEl.textContent = formatCurrency(totalTodayRevenue);
    todayTitleEl.textContent = 'Сегодня (всего)';
  } else {
    const personalTodayRevenue = (todayOrders || []).filter(o => o.masterName === user.name).reduce((sum, o) => sum + o.amount, 0);
    todayValueEl.textContent = formatCurrency(personalTodayRevenue);
    todayTitleEl.textContent = 'Сегодня (лично)';
  }
}

function renderMainContributionChart() {
  const container = document.getElementById('main-contribution-chart-container');
  if (!container) return;

  const leaderboardData = state.data.leaderboard;
  if (!leaderboardData || leaderboardData.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Нет данных для графика.</p></div>';
    return;
  }

  const maxRevenue = Math.max(...leaderboardData.map(m => m.revenue), 0);

  const PALE_YELLOW = { h: 60, s: 80, l: 75 };
  const RICH_GREEN = { h: 120, s: 60, l: 45 };

  let html = '<div class="chart">';
  leaderboardData.forEach(master => {
    const percentageOfMax = maxRevenue > 0 ? (master.revenue / maxRevenue) : 0;

    const hue = PALE_YELLOW.h + (RICH_GREEN.h - PALE_YELLOW.h) * percentageOfMax;
    const saturation = PALE_YELLOW.s + (RICH_GREEN.s - PALE_YELLOW.s) * percentageOfMax;
    const lightness = PALE_YELLOW.l + (RICH_GREEN.l - PALE_YELLOW.l) * percentageOfMax;
    const barColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    const barWidth = maxRevenue > 0 ? (master.revenue / maxRevenue) * 100 : 0;

    html += `
      <div class="chart-item">
        <div class="chart-label">${master.name}</div>
        <div class="chart-bar-container">
          <div class="chart-bar" style="width: ${barWidth}%; background-color: ${barColor};"></div>
        </div>
        <div class="chart-value">${formatCurrency(master.revenue)}</div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;
}



function canEditOrder(order) {
  const user = state.user;
  if (!user || !order || !order.createdAt) return false;

  const orderAge = Date.now() - new Date(order.createdAt).getTime();
  const twoHours = 2 * 60 * 60 * 1000;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  if (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER') {
    return orderAge < sevenDays;
  }

  if (user.role === 'MASTER') {
    return order.masterName === user.name && orderAge < twoHours;
  }

  return false;
}

function renderLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  if (!container || !state.data.leaderboard?.length) return container.innerHTML = '<div class="empty-state"><p>Нет данных</p></div>';

  const userIsPrivileged = isPrivileged();
  const totalRevenue = state.data.leaderboard.reduce((sum, m) => sum + m.revenue, 0);

  let html = `<table class="leaderboard-table"><thead><tr><th>Место</th><th>Мастер</th>`;

  if (userIsPrivileged) {
    html += '<th>Выручка</th><th>Заказы</th>';
  } else {
    html += '<th>Доля</th>';
  }

  html += `</tr></thead><tbody>`;

  html += state.data.leaderboard.map((m, i) => {
    const placeIcon = i < 3 ? `<i class="fas fa-trophy ${['gold', 'silver', 'bronze'][i]}"></i>` : i + 1;
    let valueCell;

    if (userIsPrivileged) {
      valueCell = `<td>${formatCurrency(m.revenue)}</td><td>${m.ordersCount}</td>`;
    } else {
      const percentage = totalRevenue > 0 ? ((m.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%';
      valueCell = `<td>${percentage}</td>`;
    }

    return `<tr class="${m.name === state.user.name ? 'is-current-user' : ''}"><td class="leaderboard-place">${placeIcon}</td><td>${m.name}</td>${valueCell}</tr>`;
  }).join('');

  html += `</tbody></table>`;
  container.innerHTML = html;
}

function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders?.length) return container.innerHTML = '<div class="empty-state"><p>Заказ-нарядов нет</p></div>';
  container.innerHTML = '';
  orders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'order-item';
    const smsBody = encodeURIComponent(`Здравствуйте, ${order.clientName || 'клиент'}. Ваш автомобиль ${order.carModel || ''} готов к выдаче. С уважением, VipАвто.`);
    item.innerHTML = `
      <div>
        <p class="order-description">${order.carModel}: ${order.description}</p>
        <div class="order-meta">
          ${isPrivileged() ? `<span><i class="fas fa-user"></i>${order.masterName}</span>` : ''}
          ${order.clientName ? `<span><i class="fas fa-user-tie"></i>${order.clientName}</span>` : ''}
          ${order.clientPhone ? `<span><i class="fas fa-phone"></i><a href="tel:${order.clientPhone}">${order.clientPhone}</a></span>` : ''}
          <span><i class="fas fa-tag"></i>${order.paymentType}</span>
          <span><i class="far fa-calendar-alt"></i>${formatDate(order.createdAt)}</span>
        </div>
      </div>
      <div class="order-amount">
        <div class="order-amount-value">${formatCurrency(order.amount)}</div>
        <div class="order-actions">
          ${order.clientPhone ? `<a href="sms:${order.clientPhone}?body=${smsBody}" class="btn btn-secondary btn-sm" title="Отправить SMS"><i class="fas fa-comment-sms"></i></a>` : ''}
          ${canEditOrder(order) ? `<button class="btn btn-secondary btn-sm" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>` : ''}
          ${isPrivileged() ? `<button class="btn btn-danger btn-sm" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
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
  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ-наряд</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label>Исполнитель</label><select name="masterName" ${!priv ? 'disabled' : ''}>${priv ? state.masters.map(n => `<option value="${n}" ${isEdit && order.masterName === n ? 'selected' : ''}>${n}</option>`).join('') : `<option>${state.user.name}</option>`}</select></div><div class="form-group"><label>Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label>Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-group"><label>Имя клиента</label><input type="text" name="clientName" required value="${isEdit ? order.clientName || '' : ''}"></div><div class="form-group"><label>Телефон клиента</label><input type="tel" name="clientPhone" required value="${isEdit ? order.clientPhone || '' : ''}"></div><div class="form-group"><label>Сумма</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label>Тип оплаты</label><select name="paymentType">${['Картой', 'Наличные', 'Перевод'].map(t => `<option value="${t}" ${isEdit && order.paymentType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
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


function finalizeWeek() {
    const salaryItems = document.querySelectorAll('.salary-item');
    if (!salaryItems.length) {
        return showNotification('Нет данных для расчета.', 'error');
    }

    const salaryReport = Array.from(salaryItems).map(item => {
        const name = item.dataset.masterName;
        const baseSalary = parseFloat(item.querySelector('.final-salary').dataset.baseSalary);
        const bonus = parseFloat(item.dataset.bonus || '0');
        const finalSalary = baseSalary + bonus;
        return { name, baseSalary, bonus, finalSalary };
    });

    const totalPayout = salaryReport.reduce((sum, item) => sum + item.finalSalary, 0);

    const confirmationText = `
        <p>Вы собираетесь закрыть неделю. Это действие перенесет все текущие заказ-наряды в архив.</p>
        <p>Итого к выплате: <strong>${formatCurrency(totalPayout)}</strong></p>
        <p>Вы уверены?</p>
    `;

    openConfirmationModal({
        title: 'Подтвердить закрытие недели?',
        text: confirmationText,
        onConfirm: () => {
            state.socket.emit('closeWeek', { salaryReport });
        }
    });
}

function openArchivedWeekModal(weekData) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    const weekRevenue = weekData.orders.reduce((sum, o) => sum + o.amount, 0);
    const sortedOrders = [...weekData.orders].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[0].createdAt) : 'N/A';
    const lastOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[sortedOrders.length - 1].createdAt) : 'N/A';

    modal.innerHTML = `
      <div class="modal-content modal-xl">
        <div class="modal-header">
          <h3 class="modal-title">Архив недели: ${firstOrderDate} - ${lastOrderDate}</h3>
          <button class="modal-close-btn" data-action="close-modal">&times;</button>
        </div>
        <div class="modal-body" id="archived-week-orders-container">
          <!-- renderOrdersList will populate this -->
        </div>
        <div class="modal-footer">
            <span>Итоговая выручка: <strong>${formatCurrency(weekRevenue)}</strong></span>
            <button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });

    const ordersContainer = modal.querySelector('#archived-week-orders-container');
    renderOrdersList(ordersContainer, weekData.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
}

function openClearDataCaptchaModal() {
    closeModal();
    const captcha = String(Math.floor(1000 + Math.random() * 9000));
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Подтверждение сброса данных</h3>
          <button class="modal-close-btn" data-action="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p>Это действие необратимо. Все текущие заказ-наряды и вся история будут удалены. База данных вернется к начальному состоянию.</p>
          <p>Для подтверждения, пожалуйста, введите число <strong>${captcha}</strong> в поле ниже.</p>
          <div class="form-group">
            <input type="text" id="captcha-input" class="form-control" autocomplete="off" inputmode="numeric" pattern="[0-9]*">
          </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button>
            <button type="button" class="btn btn-danger" id="confirm-clear-data" disabled>Подтвердить и сбросить</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });

    const captchaInput = modal.querySelector('#captcha-input');
    const confirmBtn = modal.querySelector('#confirm-clear-data');

    captchaInput.addEventListener('input', () => {
        confirmBtn.disabled = captchaInput.value !== captcha;
    });

    confirmBtn.addEventListener('click', () => {
        state.socket.emit('clearData');
        closeModal();
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
    </tbody></table><br><p>После закрытия недели эти заказ-наряды будут перенесены в архив. Вы уверены?</p>`;
    openConfirmationModal({ title: 'Закрыть неделю?', text: reportHtml, onConfirm: () => state.socket.emit('closeWeek') });
}

function openBonusModal(masterName) {
  closeModal(); // Close any existing modals
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';

  const salaryItem = document.querySelector(`.salary-item[data-master-name="${masterName}"]`);
  const finalSalaryEl = salaryItem.querySelector('.final-salary');
  const baseSalary = parseFloat(finalSalaryEl.dataset.baseSalary);
  const currentBonus = parseFloat(salaryItem.dataset.bonus || '0');
  const currentBonusPercentage = baseSalary > 0 ? (currentBonus / baseSalary * 100) : 0;

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Премия для: ${masterName}</h3>
        <button class="modal-close-btn" data-action="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <p>Базовая зарплата: <strong>${formatCurrency(baseSalary)}</strong></p>
        <div class="form-group">
          <label for="bonus-slider">Бонус (<span id="bonus-percentage-display">${currentBonusPercentage.toFixed(0)}%</span>)</label>
          <input type="range" class="bonus-slider" id="bonus-slider" min="0" max="20" step="2" value="${currentBonusPercentage.toFixed(0)}">
        </div>
        <p>Сумма премии: <strong id="bonus-amount-display">${formatCurrency(currentBonus)}</strong></p>
        <hr>
        <p style="font-weight: 600; font-size: 1.1rem;">Итоговая зарплата: <strong id="total-salary-display">${formatCurrency(baseSalary + currentBonus)}</strong></p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button>
        <button type="button" class="btn btn-accent" id="confirm-bonus">Начислить</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const bonusSlider = modal.querySelector('#bonus-slider');
  const percentageDisplay = modal.querySelector('#bonus-percentage-display');
  const bonusAmountDisplay = modal.querySelector('#bonus-amount-display');
  const totalSalaryDisplay = modal.querySelector('#total-salary-display');

  const updateTotal = () => {
    const bonusPercentage = parseInt(bonusSlider.value, 10);
    const bonusAmount = baseSalary * (bonusPercentage / 100);
    const totalSalary = baseSalary + bonusAmount;

    percentageDisplay.textContent = `${bonusPercentage}%`;
    bonusAmountDisplay.textContent = formatCurrency(bonusAmount);
    totalSalaryDisplay.textContent = formatCurrency(totalSalary);
  };

  bonusSlider.addEventListener('input', updateTotal);

  modal.querySelector('#confirm-bonus').addEventListener('click', () => {
    const bonusPercentage = parseInt(bonusSlider.value, 10);
    const bonusAmount = baseSalary * (bonusPercentage / 100);

    salaryItem.dataset.bonus = bonusAmount;
    finalSalaryEl.textContent = formatCurrency(baseSalary + bonusAmount);

    const masterNameEl = salaryItem.querySelector('.master-name');
    const existingIcon = masterNameEl.querySelector('.fa-star');
    if (bonusAmount > 0 && !existingIcon) {
        masterNameEl.innerHTML += ' <i class="fas fa-star" style="color: var(--gold);"></i>';
    } else if (bonusAmount === 0 && existingIcon) {
        existingIcon.remove();
    }

    closeModal();
  });

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-modal"]') || e.target === modal) {
      closeModal();
    }
  });
}

// --- БЛОК 7: ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
