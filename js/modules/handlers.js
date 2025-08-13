/*────────────────────────────────────────────
  js/modules/handlers.js
  Обработчики событий и действий пользователя.
─────────────────────────────────────────────*/

import { state, isPrivileged } from './state.js';
import { renderContent, renderOrdersPage, renderArchivePage } from './ui.js';
import { openOrderModal, openClientModal, openConfirmationModal, openClearDataCaptchaModal, openBonusModal, openArchivedWeekModal, openWeekReportModal, openClientHistoryModal } from './modals.js';
import { logout } from './app.js';
import { showNotification, downloadCSV } from './utils.js';

let flatpickrInstance = null;

export function handleAction(target) {
  const { action, id, masterName, weekId, period, status } = target.dataset;

  const actions = {
    'toggle-order-status': () => {
      const newStatus = status === 'done' ? 'new' : 'done';
      state.socket.emit('updateOrderStatus', { id, status: newStatus });
    },
    'logout': logout,
    'add-order': () => openOrderModal(),
    'add-client': () => openClientModal(),
    'edit-client': () => {
        const client = state.data.clients.find(c => c.id === id);
        if (client) openClientModal(client);
    },
    'view-client-history': () => {
        const client = state.data.clients.find(c => c.id === id);
        if (client) openClientHistoryModal(client);
    },
    'view-clients': () => document.querySelector('.nav-tab[data-tab="clients"]').click(),
    'export-csv-archive': () => exportData(),
    'set-archive-period': () => {
        if (!flatpickrInstance) return;
        const now = new Date();
        let startDate = new Date();

        if (period === 'week') {
            const dayOfWeek = now.getDay();
            const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            startDate = new Date(now.setDate(diff));
        } else if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }

        flatpickrInstance.setDate([startDate, new Date()], true); // true to trigger onChange
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
      if (masterName) openBonusModal(masterName);
    },
    'view-archived-week': () => {
      const weekData = state.data.history.find(w => w.weekId === weekId);
      if (weekData) openArchivedWeekModal(weekData);
    },
    'view-week-report': () => {
        const weekData = state.data.history.find(w => w.weekId === weekId);
        if(weekData) openWeekReportModal(weekData);
    }
  };
  if (actions[action]) actions[action]();
}

export function handleTabSwitch(target) {
  const tabId = target.dataset.tab;
  if (state.activeTab === tabId) return;

  localStorage.setItem('vipauto_active_tab', tabId);

  document.querySelector('.nav-tab.active')?.classList.remove('active');
  target.classList.add('active');
  document.querySelector('.tab-content.active')?.classList.remove('active');

  const newTabContent = document.getElementById(tabId);
  if (newTabContent) {
    newTabContent.classList.add('active');
  }

  state.activeTab = tabId;
  renderContent();
}

export function initEventListeners() {
  // Client Search Logic (now in the Clients tab)
  const clientSearchInput = document.getElementById('client-search-input');
  if(clientSearchInput) {
    clientSearchInput.addEventListener('input', (e) => {
      handleClientSearch(e.target.value, 'client-search-results');
    });
  }

  // Flatpickr Initialization
  const datePicker = document.getElementById('archive-date-picker');
  if (datePicker) {
    flatpickrInstance = flatpickr(datePicker, {
      mode: "range",
      dateFormat: "Y-m-d",
      locale: "ru", // Requires Russian locale to be loaded
      onChange: function(selectedDates, dateStr, instance) {
        // When a date range is selected, automatically trigger the filter.
        if (selectedDates.length === 2) {
          document.getElementById('apply-archive-filter').click();
        }
      }
    });
  }


  document.getElementById('apply-archive-filter')?.addEventListener('click', renderArchivePage);
  document.getElementById('master-filter')?.addEventListener('change', (e) => {
    state.selectedMaster = e.target.value;
    renderOrdersPage();
  });

  // Home dashboard period toggle
  const periodToggle = document.querySelector('.period-toggle');
  if (periodToggle) {
    periodToggle.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button || button.classList.contains('active')) return;

      const period = button.dataset.period;
      if (period) {
        // Update active button
        periodToggle.querySelector('.active')?.classList.remove('active');
        button.classList.add('active');

        // Request new data from server
        state.socket.emit('getDashboardData', period);
      }
    });
  }

  // Event delegation for dynamically added elements
  document.body.addEventListener('click', e => {
      if (e.target.id === 'finalize-week-btn') {
          finalizeWeek();
      }
      const clientItem = e.target.closest('.search-result-item:not(.disabled)');
      if(clientItem && (clientItem.parentElement.id === 'home-search-results' || clientItem.parentElement.id === 'client-search-results')) {
          const client = { id: clientItem.dataset.id, name: clientItem.dataset.name, phone: clientItem.dataset.phone };
          openClientHistoryModal(client);
          clientItem.parentElement.classList.remove('active');
          // Also clear the input field
          const input = document.getElementById(clientItem.parentElement.id.replace('-results', '-input'));
          if (input) input.value = '';
      }
  });
}

function handleClientSearch(query, resultsContainerId) {
    const resultsContainer = document.getElementById(resultsContainerId);
    if (!resultsContainer) return;
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('active');
      return;
    }
    resultsContainer.classList.add('active');
    state.socket.emit('searchClients', query);
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
        onConfirm: () => state.socket.emit('closeWeek', { salaryReport })
    });
}

function exportData() {
    const datePickerInput = document.getElementById('archive-date-picker');
    if (!datePickerInput || !datePickerInput._flatpickr || datePickerInput._flatpickr.selectedDates.length !== 2) {
        return showNotification('Пожалуйста, выберите диапазон дат для экспорта.', 'error');
    }

    const [start, end] = datePickerInput._flatpickr.selectedDates;
    const endOfDay = new Date(end.getTime());
    endOfDay.setHours(23, 59, 59, 999);

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

    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    downloadCSV(data, `report-${startStr}-to-${endStr}.csv`);
}
