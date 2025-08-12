/*────────────────────────────────────────────
  js/modules/ui.js
  Функции для рендеринга и обновления UI.
─────────────────────────────────────────────*/

import { state, isPrivileged } from './state.js';
import { formatCurrency, formatDate, canEditOrder } from './utils.js';

export function updateAndRender(data, isInitialLoad = false) {
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

export function renderContent() {
  const handlers = {
    home: renderHomePage,
    orders: renderOrdersPage,
    archive: renderArchivePage,
    finance: renderFinancePage
  };
  if (handlers[state.activeTab]) {
    handlers[state.activeTab]();
  }
}

function renderHomePage() {
  renderDashboard();
  renderMainContributionChart();
}

export function renderOrdersPage() {
    renderOrdersStats();
    const container = document.getElementById('ordersList');
    const masterFilter = document.getElementById('master-filter');
    const filterContainer = document.querySelector('.order-filters');
    let orders = state.data.weekOrders;

    if (isPrivileged()) {
        filterContainer.style.display = 'flex';
        masterFilter.innerHTML = '<option value="all">Все мастера</option>';
        (state.masters || []).forEach(name => {
            masterFilter.innerHTML += `<option value="${name}">${name}</option>`;
        });
        masterFilter.value = state.selectedMaster || 'all';
        if (state.selectedMaster && state.selectedMaster !== 'all') {
            orders = orders.filter(o => o.masterName === state.selectedMaster);
        }
    } else {
        if (filterContainer) filterContainer.style.display = 'none';
    }

    renderOrdersList(container, orders);
}

export function renderArchivePage() {
    const container = document.getElementById('archiveListContainer');
    const datePickerInput = document.getElementById('archive-date-picker');

    // Check if flatpickr instance exists and has selected dates
    if (datePickerInput && datePickerInput._flatpickr && datePickerInput._flatpickr.selectedDates.length === 2) {
        const allArchivedOrders = state.data.history.flatMap(h => h.orders);
        const [start, end] = datePickerInput._flatpickr.selectedDates;

        // Ensure the end date covers the entire day
        const endOfDay = new Date(end.getTime());
        endOfDay.setHours(23, 59, 59, 999);

        const filteredOrders = allArchivedOrders.filter(order => {
            if (!order.createdAt) return false;
            const orderDate = new Date(order.createdAt);
            return orderDate >= start && orderDate <= endOfDay;
        });
        renderOrdersList(container, filteredOrders);
    } else {
        if (!state.data.history?.length) {
            container.innerHTML = '<div class="empty-state"><p>Архив пуст.</p></div>';
            return;
        }

        container.innerHTML = `<div class="week-summary-list">${state.data.history.map(week => {
            const weekRevenue = week.orders.reduce((sum, o) => sum + o.amount, 0);
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
                </div>`;
        }).join('')}</div>`;
    }
}

function renderFinancePage() {
  const container = document.getElementById('finance-content-container');
  if (!isPrivileged()) {
    container.innerHTML = '<div class="empty-state"><p>Доступ запрещен.</p></div>';
    return;
  }

  const weeklyLeaderboard = state.data.leaderboard || [];
  const totalRevenue = weeklyLeaderboard.reduce((sum, m) => sum + m.revenue, 0);
  const totalOrders = weeklyLeaderboard.reduce((sum, m) => sum + m.ordersCount, 0);
  const directorProfit = totalRevenue * 0.5;
  const totalBasePayroll = weeklyLeaderboard.reduce((sum, m) => sum + (m.revenue * 0.5), 0);
  const avgProfitPerOrder = totalOrders > 0 ? (directorProfit / totalOrders) : 0;
  const payrollToRevenueRatio = totalRevenue > 0 ? (totalBasePayroll / totalRevenue) * 100 : 0;

  let html = `
    <div class="finance-header">
      <div class="dashboard">
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-ruble-sign"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Общая выручка</div><div class="dashboard-item-value">${formatCurrency(totalRevenue)}</div></div></div>
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-sack-dollar"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Прибыль сервиса</div><div class="dashboard-item-value">${formatCurrency(directorProfit)}</div></div></div>
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-file-invoice"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Всего заказ-нарядов</div><div class="dashboard-item-value">${totalOrders}</div></div></div>
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-wallet"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Базовый ФОТ</div><div class="dashboard-item-value">${formatCurrency(totalBasePayroll)}</div></div></div>
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-chart-line"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Прибыль с заказа</div><div class="dashboard-item-value">${formatCurrency(avgProfitPerOrder)}</div></div></div>
        <div class="dashboard-item"><div class="dashboard-item-icon"><i class="fas fa-percentage"></i></div><div class="dashboard-item-content"><div class="dashboard-item-title">Доля ФОТ в выручке</div><div class="dashboard-item-value">${payrollToRevenueRatio.toFixed(1)}%</div></div></div>
      </div>
    </div>
    <div class="section">
        <div class="section-header"><h3 class="section-title">Расчет зарплаты и премии</h3></div>
        <div class="salary-calculation-list">`;

  if (weeklyLeaderboard.length > 0) {
    html += weeklyLeaderboard.map(master => {
      const baseSalary = master.revenue * 0.5;
      return `
        <div class="salary-item" data-master-name="${master.name}">
          <div class="salary-item-header">
            <span class="master-name"><i class="fas fa-user-cog master-icon"></i> ${master.name}</span>
            <span class="final-salary" data-base-salary="${baseSalary}">${formatCurrency(baseSalary)}</span>
          </div>
          <div class="salary-details">
            <span>Выручка: <strong>${formatCurrency(master.revenue)}</strong></span>
            <span>База (50%): <strong>${formatCurrency(baseSalary)}</strong></span>
          </div>
          <div class="salary-actions">
            <button class="btn btn-secondary btn-sm" data-action="award-bonus" data-master-name="${master.name}"><i class="fas fa-plus"></i> Премировать</button>
          </div>
        </div>`;
    }).join('');
  } else {
    html += '<div class="empty-state"><p>Нет данных для расчета.</p></div>';
  }

  html += `</div></div><div class="finance-actions"><button id="finalize-week-btn" class="btn btn-success quick-action-main"><i class="fas fa-check-circle"></i> Закрыть неделю и начислить ЗП</button></div>`;
  container.innerHTML = html;

  const historyContainer = document.createElement('div');
  historyContainer.className = 'section';
  let historyHtml = '<div class="section-header"><h3 class="section-title">Прошлые периоды</h3></div><div class="section-content list-container">';
  const reportedWeeks = state.data.history.filter(h => h.salaryReport && h.salaryReport.length > 0);

  if (reportedWeeks.length > 0) {
      historyHtml += reportedWeeks.map(week => {
          const weekRevenue = week.orders.reduce((sum, o) => sum + o.amount, 0);
          const firstOrderDate = week.orders.length > 0 ? formatDate(week.orders[0].createdAt) : 'N/A';
          return `<button class="btn btn-secondary btn-full-width" data-action="view-week-report" data-week-id="${week.weekId}"><span>Отчет за неделю от ${firstOrderDate}</span><span>${formatCurrency(weekRevenue)}</span></button>`;
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
  document.querySelector('#dash-revenue .dashboard-item-value').textContent = formatCurrency(weekStats.revenue);
  document.querySelector('#dash-orders .dashboard-item-value').textContent = weekStats.ordersCount || 0;
  document.querySelector('#dash-avg-check .dashboard-item-value').textContent = formatCurrency(weekStats.avgCheck);

  const todayValueEl = document.querySelector('#dash-today-personal .dashboard-item-value');
  if(userIsPrivileged) {
    todayValueEl.textContent = formatCurrency((todayOrders || []).reduce((sum, o) => sum + o.amount, 0));
  } else {
    todayValueEl.textContent = formatCurrency((todayOrders || []).filter(o => o.masterName === user.name).reduce((sum, o) => sum + o.amount, 0));
    document.querySelector('#dash-today-personal .dashboard-item-title').textContent = 'Моя выручка (сегодня)';
  }

  if(userIsPrivileged) {
    document.querySelector('#dash-profit .dashboard-item-value').textContent = formatCurrency(weekStats.revenue * 0.5);
    const weeklyClientIds = new Set((weekOrders || []).map(o => o.clientId));
    document.querySelector('#dash-unique-clients .dashboard-item-value').textContent = weeklyClientIds.size;
    document.querySelector('#dash-master-load .dashboard-item-value').textContent = (masters?.length > 0) ? (weekStats.ordersCount / masters.length).toFixed(1) : 0;
    const historicalClientIds = new Set((history || []).flatMap(h => h.orders).map(o => o.clientId));
    let newClientCount = 0;
    weeklyClientIds.forEach(id => { if (!historicalClientIds.has(id)) newClientCount++; });
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

  container.innerHTML = `<div class="chart">${leaderboardData.map(master => {
    const percentageOfMax = maxRevenue > 0 ? (master.revenue / maxRevenue) : 0;
    const hue = PALE_YELLOW.h + (RICH_GREEN.h - PALE_YELLOW.h) * percentageOfMax;
    const saturation = PALE_YELLOW.s + (RICH_GREEN.s - PALE_YELLOW.s) * percentageOfMax;
    const lightness = PALE_YELLOW.l + (RICH_GREEN.l - PALE_YELLOW.l) * percentageOfMax;
    const barColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const barWidth = maxRevenue > 0 ? (master.revenue / maxRevenue) * 100 : 0;
    return `
      <div class="chart-item">
        <div class="chart-label">${master.name}</div>
        <div class="chart-bar-container">
          <div class="chart-bar" style="width: ${barWidth}%; background-color: ${barColor};"></div>
        </div>
        <div class="chart-value">${formatCurrency(master.revenue)}</div>
      </div>`;
  }).join('')}</div>`;
}

export function renderOrdersList(container, orders) {
  if (!container) return;
  if (!orders?.length) {
    container.innerHTML = '<div class="empty-state"><p>Заказ-нарядов нет</p></div>';
    return;
  }

  const formatPlate = (plate) => {
    if (!plate) return '';

    // Normalize plate: remove all non-alphanumeric chars and convert to uppercase
    const sanitizedPlate = plate.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').toUpperCase();

    // Regex for Russian format: 1 letter, 3 digits, 2 letters, then 2-3 digits region
    // e.g., A123BC77 or A123BC777
    const rusRegex = /^([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})(\d{2,3})$/;
    const match = sanitizedPlate.match(rusRegex);

    if (match) {
      const letter1 = match[1];
      const digits = match[2];
      const letters2 = match[3];
      const region = match[4];

      // Construct the main part of the plate with specific classes for styling
      const mainPart = `<span class="plate-letter">${letter1}</span><span class="plate-digits">${digits}</span><span class="plate-letters">${letters2}</span>`;

      return `<div class="license-plate">
                <div class="plate-main">${mainPart}</div>
                <div class="plate-region">
                  <span class="region-code">${region}</span>
                  <div class="region-flag">
                    <div class="flag-white"></div>
                    <div class="flag-blue"></div>
                    <div class="flag-red"></div>
                    <span class="flag-rus">RUS</span>
                  </div>
                </div>
              </div>`;
    }

    // Fallback for non-standard or foreign plates
    return `<div class="license-plate license-plate-fallback">${sanitizedPlate}</div>`;
  };

  container.innerHTML = '';
  orders.forEach(order => {
    const item = document.createElement('div');
    item.className = 'order-item';
    const smsBody = encodeURIComponent(`Здравствуйте, ${order.clientName || 'клиент'}. Ваш автомобиль ${order.carModel || ''} готов к выдаче. С уважением, VipАвто.`);
    item.innerHTML = `
      <div>
        <div class="order-title">
            <p class="order-description">${order.carModel}</p>
            ${formatPlate(order.licensePlate)}
        </div>
        <p class="order-work-description">${order.description}</p>
        <div class="order-meta">
          ${isPrivileged() ? `<span class="master-info"><i class="fas fa-screwdriver-wrench master-icon"></i> ${order.masterName}</span>` : ''}
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
          ${canEditOrder(order, state.user) ? `<button class="btn btn-secondary btn-sm" data-action="edit-order" data-id="${order.id}"><i class="fas fa-pen"></i></button>` : ''}
          ${isPrivileged() ? `<button class="btn btn-danger btn-sm" data-action="delete-order" data-id="${order.id}"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </div>`;
    container.appendChild(item);
  });
}

function renderOrdersStats() {
    const container = document.getElementById('orders-stats-container');
    if (!isPrivileged() || !container) {
        if(container) container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];
    const today = new Date().toISOString().slice(0, 10);
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);

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
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `<li><strong>${name}:</strong> ${count}</li>`)
        .join('');
    if (!masterDetailsHtml) masterDetailsHtml = '<li>Нет данных за неделю</li>';

    container.innerHTML = `
        <div class="orders-stats-grid">
            <div class="stats-period"><div class="stats-header">За день</div><div class="stats-total">${stats.day.total}</div></div>
            <div class="stats-period"><div class="stats-header">За неделю</div><div class="stats-total">${stats.week.total}</div></div>
            <div class="stats-period"><div class="stats-header">За месяц</div><div class="stats-total">${stats.month.total}</div></div>
            <div class="stats-period"><div class="stats-header">За год</div><div class="stats-total">${stats.year.total}</div></div>
        </div>
        <div class="master-stats-details">
            <h4 class="master-stats-title">Вклад мастеров (за неделю)</h4>
            <ul>${masterDetailsHtml}</ul>
        </div>`;
}
