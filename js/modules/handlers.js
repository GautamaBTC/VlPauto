/*────────────────────────────────────────────
  js/modules/handlers.js
  Обработчики событий и действий пользователя.
─────────────────────────────────────────────*/

import { state, isPrivileged } from './state.js';
import { renderContent, renderOrdersPage, renderArchivePage } from './ui.js';
import { openOrderModal, openConfirmationModal, openClearDataCaptchaModal, openBonusModal, openArchivedWeekModal, openWeekReportModal, openClientHistoryModal } from './modals.js';
import { logout } from './app.js';
import { showNotification, downloadCSV } from './utils.js';

export function handleAction(target) {
  const { action, id, masterName, weekId, period } = target.dataset;

  const actions = {
    'logout': logout,
    'add-order': () => openOrderModal(),
    'view-clients': () => showNotification('Раздел "Клиенты" находится в разработке.', 'success'),
    'export-csv-archive': () => exportData(),
    'set-archive-period': () => {
        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
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

        startDateInput.value = startDate.toISOString().slice(0, 10);
        endDateInput.value = new Date().toISOString().slice(0, 10);
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
  const voiceSearchBtn = document.getElementById('voice-search-btn');
  const homeSearchInput = document.getElementById('home-client-search');

  // Voice Search Logic
  if (isSecureContextAndSpeechRecognitionSupported()) {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    setupVoiceRecognition(recognition, voiceSearchBtn, homeSearchInput);
  } else {
    disableVoiceSearch(voiceSearchBtn);
  }

  // Text Search Logic
  if(homeSearchInput) {
    homeSearchInput.addEventListener('input', (e) => {
      handleClientSearch(e.target.value, 'home-search-results');
    });
  }

  document.getElementById('apply-archive-filter')?.addEventListener('click', renderArchivePage);
  document.getElementById('master-filter')?.addEventListener('change', (e) => {
    state.selectedMaster = e.target.value;
    renderOrdersPage();
  });

  // Event delegation for dynamically added elements
  document.body.addEventListener('click', e => {
      if (e.target.id === 'finalize-week-btn') {
          finalizeWeek();
      }
      const clientItem = e.target.closest('.search-result-item:not(.disabled)');
      if(clientItem && clientItem.parentElement.id === 'home-search-results') {
          const client = { id: clientItem.dataset.id, name: clientItem.dataset.name, phone: clientItem.dataset.phone };
          openClientHistoryModal(client);
          clientItem.parentElement.classList.remove('active');
          homeSearchInput.value = '';
      }
  });
}

function handleClientSearch(query, resultsContainerId) {
    const resultsContainer = document.getElementById(resultsContainerId);
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
    downloadCSV(data, `report-${startDate}-to-${endDate}.csv`);
}

// --- Voice Search Helpers ---
function isSecureContextAndSpeechRecognitionSupported() {
    return window.isSecureContext && (window.SpeechRecognition || window.webkitSpeechRecognition);
}

function disableVoiceSearch(button) {
    if (!button) return;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    const message = window.isSecureContext
        ? 'Голосовой поиск не поддерживается в вашем браузере.'
        : 'Голосовой поиск доступен только на защищенном соединении (HTTPS).';
    button.addEventListener('click', () => showNotification(message, 'error'));
}

function setupVoiceRecognition(recognition, button, input) {
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    button.addEventListener('click', () => {
        try {
            recognition.start();
        } catch(e) {
            button.classList.remove('is-recording');
            showNotification('Распознавание уже активно.', 'error');
        }
    });

    recognition.addEventListener('speechstart', () => button.classList.add('is-recording'));
    recognition.addEventListener('speechend', () => {
        recognition.stop();
        button.classList.remove('is-recording');
    });
    recognition.addEventListener('result', (e) => {
        input.value = e.results[0][0].transcript;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    recognition.addEventListener('error', (e) => {
        button.classList.remove('is-recording');
        let errorMessage = `Ошибка: ${e.error}`;
        if (e.error === 'not-allowed') errorMessage = 'Необходимо разрешить доступ к микрофону.';
        else if (e.error === 'no-speech') errorMessage = 'Речь не распознана.';
        showNotification(errorMessage, 'error');
    });
}
