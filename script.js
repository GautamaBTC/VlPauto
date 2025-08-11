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
let isConnectionErrorShown = false;

// --- БЛОК 3: ИНИЦИАЛИЗАЦИЯ ---
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!initAuth()) return;
    initTheme();
    initClock();
    initSocketConnection();
    initEventListeners();

    // Determine initial tab but don't activate it yet
    const savedTabId = localStorage.getItem('vipauto_active_tab') || 'home';
    const tabToActivate = document.querySelector(`.nav-tab[data-tab="${savedTabId}"]`);
    if (tabToActivate && getComputedStyle(tabToActivate).display !== 'none') {
      state.activeTab = savedTabId;
    } else {
      state.activeTab = 'home';
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

  state.socket.on('connect', () => {
    console.log('Подключено к серверу.');
    isConnectionErrorShown = false;
  });

  state.socket.on('connect_error', (err) => {
    console.error('Socket connect_error:', err);
    if (!isConnectionErrorShown) {
      showNotification('Ошибка подключения к серверу.', 'error');
      isConnectionErrorShown = true;
    }
  });

  state.socket.on('initialData', (data) => updateAndRender(data, true));
  state.socket.on('dataUpdate', (data) => { updateAndRender(data); showNotification('Данные обновлены', 'success'); });
  state.socket.on('serverError', (msg) => showNotification(msg, 'error'));

  state.socket.on('clientSearchResults', (results) => {
    const activeResultsContainer = document.querySelector('.search-results-list.active');
    if (!activeResultsContainer) return;

    if (results.length === 0) {
        activeResultsContainer.innerHTML = '<div class="search-result-item disabled">Совпадений не найдено</div>';
        return;
    }

    activeResultsContainer.innerHTML = results.map(client =>
        `<div class="search-result-item" data-id="${client.id}" data-name="${client.name}" data-phone="${client.phone}">
            <strong>${client.name}</strong> (${client.phone})
         </div>`
    ).join('');
  });
}

function initEventListeners() {
  document.body.addEventListener('click', (e) => {
    const actionTarget = e.target.closest('[data-action]');
    const tabTarget = e.target.closest('[data-tab]');
    if (actionTarget) handleAction(actionTarget);
    if (tabTarget) handleTabSwitch(tabTarget);
  });

  const voiceSearchBtn = document.getElementById('voice-search-btn');
  const homeSearchInput = document.getElementById('home-client-search');

  // Voice Search Logic
  if (!window.isSecureContext) {
    if (voiceSearchBtn) {
        voiceSearchBtn.style.opacity = '0.5';
        voiceSearchBtn.style.cursor = 'not-allowed';
        voiceSearchBtn.addEventListener('click', () => {
            showNotification('Голосовой поиск доступен только на защищенном соединении (HTTPS).', 'error');
        });
    }
  } else {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (voiceSearchBtn) voiceSearchBtn.style.display = 'none';
    } else {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ru-RU';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (voiceSearchBtn && homeSearchInput) {
            voiceSearchBtn.addEventListener('click', () => {
                try {
                    recognition.start();
                } catch(e) {
                    voiceSearchBtn.classList.remove('is-recording');
                    showNotification('Распознавание уже активно.', 'error');
                }
            });

            recognition.addEventListener('speechstart', () => {
                voiceSearchBtn.classList.add('is-recording');
            });

            recognition.addEventListener('speechend', () => {
                recognition.stop();
                voiceSearchBtn.classList.remove('is-recording');
            });

            recognition.addEventListener('result', (e) => {
                const transcript = e.results[0][0].transcript;
                homeSearchInput.value = transcript;
                homeSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
            });

            recognition.addEventListener('error', (e) => {
                voiceSearchBtn.classList.remove('is-recording');
                let errorMessage = `Ошибка: ${e.error}`;
                if (e.error === 'not-allowed') {
                    errorMessage = 'Необходимо разрешить доступ к микрофону в настройках браузера.';
                } else if (e.error === 'no-speech') {
                    errorMessage = 'Речь не распознана. Попробуйте еще раз.';
                }
                showNotification(errorMessage, 'error');
            });
        }
    }
  }

  // Text Search Logic
  if(homeSearchInput) {
    homeSearchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      const resultsContainer = document.getElementById('home-search-results');
      if (query.length < 2) {
        resultsContainer.innerHTML = '';
        resultsContainer.classList.remove('active');
        return;
      }
      resultsContainer.classList.add('active');
      state.socket.emit('searchClients', query);
    });
  }

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

  const archiveResultsContainer = document.getElementById('archive-search-results');
  if (archiveResultsContainer) {
    archiveResultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item:not(.disabled)');
        if (!item) return;

        const client = { id: item.dataset.id, name: item.dataset.name, phone: item.dataset.phone };
        openClientHistoryModal(client);

        archiveResultsContainer.classList.remove('active');
        document.getElementById('archive-client-search').value = '';
    });
  }
}

// --- БЛОК 4: ОБРАБОТЧИКИ ДЕЙСТВИЙ ---
function handleAction(target) {
  const { action, id } = target.dataset;
  const actions = {
    'logout': logout,
    'add-order': () => openOrderModal(),
    'view-clients': () => showNotification('Раздел "Клиенты" находится в разработке.', 'success'),
    'export-csv-archive': () => exportData(),
    'set-archive-period': () => {
        const period = target.dataset.period;
        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
        const now = new Date();
        let startDate = new Date();

        if (period === 'week') {
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust for Sunday
            startDate = new Date(now.setDate(diff));
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }

        startDateInput.value = startDate.toISOString().slice(0, 10);
        endDateInput.value = new Date().toISOString().slice(0, 10);

        // Trigger filter application
        document.getElementById('apply-archive-filter').click();
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
    'view-week-report': () => {
        const weekId = target.dataset.weekId;
        const weekData = state.data.history.find(w => w.weekId === weekId);
        if(weekData) openWeekReportModal(weekData);
    }
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

  if (isInitialLoad) {
    const tabButton = document.querySelector(`.nav-tab[data-tab="${state.activeTab}"]`);
    if (tabButton) {
      document.querySelector('.nav-tab.active')?.classList.remove('active');
      document.querySelector('.tab-content.active')?.classList.remove('active');
      tabButton.classList.add('active');
      document.getElementById(state.activeTab)?.classList.add('active');
    }
  }

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

function exportData() {
    const startDate = document.getElementById('filter-start-date').value;
    const endDate = document.getElementById('filter-end-date').value;

    if (!startDate || !endDate) {
        return showNotification('Пожалуйста, выберите начальную и конечную дату для экспорта.', 'error');
    }

    const start = new Date(startDate + 'T00:00:00.000Z');
    const end = new Date(endDate + 'T23:59:59.999Z');

    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];
    const ordersToExport = allOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= start && orderDate <= end;
    });

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
      <div class="dashboard">
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
        <div class="section-header">
            <h3 class="section-title">Расчет зарплаты и премии</h3>
        </div>
        <div class="salary-calculation-list">
  `;

  if (weeklyLeaderboard.length > 0) {
    weeklyLeaderboard.forEach(master => {
      const baseSalary = master.revenue * 0.5;
      html += `
        <div class="salary-item" data-master-name="${master.name}">
          <div class="salary-item-header">
            <span class="master-name"><i class="fas fa-crown icon-crown"></i> ${master.name}</span>
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

  // Render history reports
  const historyContainer = document.createElement('div');
  historyContainer.className = 'section';
  let historyHtml = '<div class="section-header"><h3 class="section-title">Прошлые периоды</h3></div><div class="section-content list-container">';

  const reportedWeeks = state.data.history.filter(h => h.salaryReport && h.salaryReport.length > 0);

  if (reportedWeeks.length > 0) {
      historyHtml += reportedWeeks.map(week => {
          const weekRevenue = week.orders.reduce((sum, o) => sum + o.amount, 0);
          const firstOrderDate = week.orders.length > 0 ? formatDate(week.orders[0].createdAt) : 'N/A';
          return `
              <button class="btn btn-secondary btn-full-width" data-action="view-week-report" data-week-id="${week.weekId}">
                  <span>Отчет за неделю от ${firstOrderDate}</span>
                  <span>${formatCurrency(weekRevenue)}</span>
              </button>
          `;
      }).join('');
  } else {
      historyHtml += '<div class="empty-state" style="padding: 16px 0;">Нет закрытых периодов.</div>';
  }

  historyHtml += '</div>';
  historyContainer.innerHTML = historyHtml;
  container.appendChild(historyContainer);
}

function renderDashboard() {
  const { weekStats, todayOrders, user, weekOrders, history, masters } = state.data;
  if (!weekStats || !user) return;

  const userIsPrivileged = isPrivileged();

  // --- Standard Metrics ---
  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);

  // --- Today's Revenue ---
  const todayValueEl = document.querySelector('#dash-today-personal .dashboard-item-value');
  if(userIsPrivileged) {
    const totalTodayRevenue = (todayOrders || []).reduce((sum, o) => sum + o.amount, 0);
    todayValueEl.textContent = formatCurrency(totalTodayRevenue);
  } else {
    const personalTodayRevenue = (todayOrders || []).filter(o => o.masterName === user.name).reduce((sum, o) => sum + o.amount, 0);
    todayValueEl.textContent = formatCurrency(personalTodayRevenue);
    document.querySelector('#dash-today-personal .dashboard-item-title').textContent = 'Моя выручка (сегодня)';
  }

  if(userIsPrivileged) {
    // --- New Director-Level Metrics ---
    // 1. Weekly Profit
    const weeklyProfit = weekStats.revenue * 0.5; // Assuming 50% profit margin
    document.querySelector('#dash-profit .dashboard-item-value').textContent = formatCurrency(weeklyProfit);

    // 2. Unique Clients
    const weeklyClientIds = new Set((weekOrders || []).map(o => o.clientId));
    document.querySelector('#dash-unique-clients .dashboard-item-value').textContent = weeklyClientIds.size;

    // 3. Master Utilization
    const masterLoad = (masters?.length > 0) ? (weekStats.ordersCount / masters.length).toFixed(1) : 0;
    document.querySelector('#dash-master-load .dashboard-item-value').textContent = masterLoad;

    // 4. New Client %
    const historicalClientIds = new Set((history || []).flatMap(h => h.orders).map(o => o.clientId));
    let newClientCount = 0;
    weeklyClientIds.forEach(id => {
        if (!historicalClientIds.has(id)) {
            newClientCount++;
        }
    });
    const newClientPercentage = weeklyClientIds.size > 0 ? (newClientCount / weeklyClientIds.size * 100).toFixed(0) : 0;
    document.querySelector('#dash-new-clients .dashboard-item-value').textContent = `${newClientPercentage}%`;
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
        <div class="order-title">
            <p class="order-description">${order.carModel}</p>
            ${order.licensePlate ? `<div class="license-plate">${order.licensePlate}</div>` : ''}
        </div>
        <p class="order-work-description">${order.description}</p>
        <div class="order-meta">
          ${isPrivileged() ? `<span class="master-info"><i class="fas fa-crown icon-crown"></i> ${order.masterName}</span>` : ''}
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

function createCustomSelect(wrapper, name, options, selectedValue, disabled = false) {
    wrapper.innerHTML = `
        <div class="custom-select ${disabled ? 'disabled' : ''}">
            <input type="hidden" name="${name}" value="${selectedValue}">
            <div class="custom-select-trigger">
                <span>${selectedValue}</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="custom-options">
                ${options.map(opt => `<span class="custom-option ${opt === selectedValue ? 'selected' : ''}" data-value="${opt}">${opt}</span>`).join('')}
            </div>
        </div>
    `;

    if (disabled) return;

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const optionsContainer = wrapper.querySelector('.custom-options');
    const hiddenInput = wrapper.querySelector(`input[name="${name}"]`);
    const selectedSpan = trigger.querySelector('span');

    trigger.addEventListener('click', () => {
        optionsContainer.classList.toggle('active');
    });

    optionsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-option');
        if (option) {
            const value = option.dataset.value;
            hiddenInput.value = value;
            selectedSpan.textContent = value;

            wrapper.querySelector('.custom-option.selected')?.classList.remove('selected');
            option.classList.add('selected');

            optionsContainer.classList.remove('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            optionsContainer.classList.remove('active');
        }
    });
}

function openOrderModal(order = null) {
  closeModal();
  const isEdit = !!order;
  const priv = isPrivileged();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';
  const paymentTypes = ['Картой', 'Наличные', 'Перевод'];
  const masters = priv ? state.masters : [state.user.name];
  const selectedMaster = isEdit ? order.masterName : state.user.name;
  const selectedPaymentType = isEdit ? order.paymentType : paymentTypes[0];

  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ-наряд</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label>Исполнитель</label><div class="custom-select-wrapper" id="master-select-wrapper"></div></div><div class="form-row"><div class="form-group"><label>Модель авто</label><input type="text" name="carModel" required value="${isEdit ? order.carModel || '' : ''}"></div><div class="form-group"><label>Гос. номер</label><input type="text" name="licensePlate" value="${isEdit ? order.licensePlate || '' : ''}" placeholder="А 123 ВС 777"></div></div><div class="form-group"><label>Описание работ</label><textarea name="description" rows="3" required>${isEdit ? order.description : ''}</textarea></div><div class="form-group"><label>Имя клиента</label><div class="input-with-icon"><input type="text" name="clientName" required value="${isEdit ? order.clientName || '' : ''}" autocomplete="off"><div class="search-results-list" id="client-name-results"></div></div></div><div class="form-group"><label>Телефон клиента</label><div class="input-with-icon"><input type="tel" name="clientPhone" required value="${isEdit ? order.clientPhone || '' : ''}" autocomplete="off"><div class="search-results-list" id="client-phone-results"></div></div></div><div class="form-group"><label>Сумма</label><input type="number" name="amount" required value="${isEdit ? order.amount : ''}"></div><div class="form-group"><label>Тип оплаты</label><div class="custom-select-wrapper" id="payment-select-wrapper"></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-accent">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
  document.body.appendChild(modal);

  createCustomSelect(modal.querySelector('#master-select-wrapper'), 'masterName', masters, selectedMaster, !priv);
  createCustomSelect(modal.querySelector('#payment-select-wrapper'), 'paymentType', paymentTypes, selectedPaymentType);

  const clientNameInput = modal.querySelector('[name="clientName"]');
  const clientPhoneInput = modal.querySelector('[name="clientPhone"]');
  const nameResultsContainer = modal.querySelector('#client-name-results');
  const phoneResultsContainer = modal.querySelector('#client-phone-results');

  const handleSearch = (e) => {
    const query = e.target.value;
    const isPhone = e.target.name === 'clientPhone';
    const resultsContainer = isPhone ? phoneResultsContainer : nameResultsContainer;

    // Clear other results
    if(isPhone) nameResultsContainer.innerHTML = ''; else phoneResultsContainer.innerHTML = '';

    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('active');
      return;
    }
    state.socket.emit('searchClients', query);
  };

  clientNameInput.addEventListener('input', handleSearch);
  clientPhoneInput.addEventListener('input', handleSearch);

  const populateResults = (results) => {
      const resultsContainer = document.querySelector('.search-results-list.active');
      if (!resultsContainer) return;

      if (results.length === 0) {
          resultsContainer.innerHTML = '<div class="search-result-item disabled">Совпадений не найдено</div>';
          return;
      }

      resultsContainer.innerHTML = results.map(client =>
          `<div class="search-result-item" data-name="${client.name}" data-phone="${client.phone}">
              <strong>${client.name}</strong> (${client.phone})
           </div>`
      ).join('');
  };

  clientNameInput.addEventListener('focus', () => nameResultsContainer.classList.add('active'));
  clientPhoneInput.addEventListener('focus', () => phoneResultsContainer.classList.add('active'));

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.input-with-icon')) {
      document.querySelectorAll('.search-results-list').forEach(r => r.classList.remove('active'));
    }
  });

  modal.addEventListener('click', (e) => {
    const item = e.target.closest('#client-name-results .search-result-item:not(.disabled), #client-phone-results .search-result-item:not(.disabled)');
    if (item) {
        clientNameInput.value = item.dataset.name;
        clientPhoneInput.value = item.dataset.phone;
        nameResultsContainer.classList.remove('active');
        phoneResultsContainer.classList.remove('active');
    }
    if (e.target.closest('[data-action="close-modal"]') || e.target === modal) {
        closeModal();
    }
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
  closeModal();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';

  const salaryItem = document.querySelector(`.salary-item[data-master-name="${masterName}"]`);
  const finalSalaryEl = salaryItem.querySelector('.final-salary');
  const baseSalary = parseFloat(finalSalaryEl.dataset.baseSalary);
  const currentBonus = parseFloat(salaryItem.dataset.bonus || '0');
  const currentBonusPercentage = baseSalary > 0 ? (currentBonus / baseSalary * 100) : 0;

  modal.innerHTML = `
    <div class="modal-content bonus-modal">
      <div class="modal-header">
        <h3 class="modal-title">Премия для: ${masterName}</h3>
        <button class="modal-close-btn" data-action="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="bonus-info-row">
            <span>Базовая зарплата</span>
            <strong>${formatCurrency(baseSalary)}</strong>
        </div>

        <div class="form-group">
          <label for="bonus-slider">Бонус (<span class="bonus-percentage-value">${currentBonusPercentage.toFixed(0)}%</span>)</label>
          <div class="slider-container">
            <input type="range" class="bonus-slider" id="bonus-slider" min="0" max="20" step="2" value="${currentBonusPercentage.toFixed(0)}">
            <div class="slider-ticks"></div>
          </div>
        </div>

        <div class="bonus-info-row">
            <span>Сумма премии</span>
            <strong id="bonus-amount-display">${formatCurrency(currentBonus)}</strong>
        </div>
        <hr>
        <div class="bonus-info-row total">
            <span>Итоговая зарплата</span>
            <strong id="total-salary-display">${formatCurrency(baseSalary + currentBonus)}</strong>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button>
        <button type="button" class="btn btn-success btn-lg" id="confirm-bonus">Начислить</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const bonusSlider = modal.querySelector('#bonus-slider');
  const percentageDisplay = modal.querySelector('.bonus-percentage-value');
  const bonusAmountDisplay = modal.querySelector('#bonus-amount-display');
  const totalSalaryDisplay = modal.querySelector('#total-salary-display');
  const ticksContainer = modal.querySelector('.slider-ticks');

  for (let i = 0; i <= 20; i += 2) {
      const tick = document.createElement('span');
      ticksContainer.appendChild(tick);
  }

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

function openClientHistoryModal(client) {
    closeModal();
    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];
    const clientOrders = allOrders.filter(o => o.clientId === client.id || o.clientPhone === client.phone).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const totalRevenue = clientOrders.reduce((sum, o) => sum + o.amount, 0);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
      <div class="modal-content modal-xl">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">История клиента: ${client.name}</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${client.phone}</p>
          </div>
          <button class="modal-close-btn" data-action="close-modal">&times;</button>
        </div>
        <div class="modal-body" id="client-history-orders-container">
          <!-- renderOrdersList will populate this -->
        </div>
        <div class="modal-footer" style="justify-content: space-between;">
            <div>
                <span>Всего заказ-нарядов: <strong>${clientOrders.length}</strong></span>
                <span style="margin-left: 16px;">Общая сумма: <strong>${formatCurrency(totalRevenue)}</strong></span>
            </div>
            <button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });

    const ordersContainer = modal.querySelector('#client-history-orders-container');
    renderOrdersList(ordersContainer, clientOrders);
}

function openWeekReportModal(weekData) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';

    const weekRevenue = weekData.orders.reduce((sum, o) => sum + o.amount, 0);
    const serviceProfit = weekRevenue * 0.5;
    const totalPayout = weekData.salaryReport.reduce((sum, r) => sum + r.finalSalary, 0);
    const firstOrderDate = weekData.orders.length > 0 ? formatDate(weekData.orders[0].createdAt) : 'N/A';

    let reportHtml = weekData.salaryReport.map(r => `
        <tr>
            <td>${r.name}</td>
            <td>${formatCurrency(r.baseSalary)}</td>
            <td>${formatCurrency(r.bonus)}</td>
            <td>${formatCurrency(r.finalSalary)}</td>
        </tr>
    `).join('');

    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header">
          <h3 class="modal-title">Финансовый отчет за неделю от ${firstOrderDate}</h3>
          <button class="modal-close-btn" data-action="close-modal">&times;</button>
        </div>
        <div class="modal-body">
            <div class="dashboard" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                <div class="dashboard-item">
                    <div class="dashboard-item-title">Общая выручка</div>
                    <div class="dashboard-item-value">${formatCurrency(weekRevenue)}</div>
                </div>
                <div class="dashboard-item">
                    <div class="dashboard-item-title">Прибыль сервиса</div>
                    <div class="dashboard-item-value">${formatCurrency(serviceProfit)}</div>
                </div>
                <div class="dashboard-item">
                    <div class="dashboard-item-title">Всего выплачено</div>
                    <div class="dashboard-item-value">${formatCurrency(totalPayout)}</div>
                </div>
            </div>
            <h4 style="margin-top: 24px; margin-bottom: 12px;">Детализация по мастерам</h4>
            <table class="leaderboard-table">
                <thead>
                    <tr>
                        <th>Мастер</th>
                        <th>Базовая ЗП (50%)</th>
                        <th>Премия</th>
                        <th>Итог к выплате</th>
                    </tr>
                </thead>
                <tbody>${reportHtml}</tbody>
            </table>
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button>
        </div>
      </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
}

// --- БЛОК 7: ВЫХОД ---
function logout() {
  localStorage.clear();
  sessionStorage.clear();
  if (state.socket) state.socket.disconnect();
  window.location.replace('login.html');
}
