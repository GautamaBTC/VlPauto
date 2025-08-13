/*────────────────────────────────────────────
  js/modules/modals.js
  Управление модальными окнами.
─────────────────────────────────────────────*/

import { state, isPrivileged } from './state.js';
import { formatCurrency, formatDate, showNotification } from './utils.js';
import { renderOrdersList } from './ui.js';
import { createElasticSlider } from './ElasticSlider.js';

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

export function openOrderModal(order = null) {
  closeModal();
  const isEdit = !!order;
  const priv = isPrivileged();
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';
  const paymentTypes = ['Картой', 'Наличные', 'Перевод'];
  const masters = priv ? state.masters : [state.user.name];
  const selectedMaster = isEdit ? order.masterName : state.user.name;
  const selectedPaymentType = isEdit ? order.paymentType : paymentTypes[0];

  modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} заказ-наряд</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><form id="order-form" class="compact-form"><div class="modal-body"><input type="hidden" name="id" value="${isEdit ? order.id : ''}"><div class="form-group"><label for="master-select-wrapper">Исполнитель<span class="required-asterisk">*</span></label><div class="custom-select-wrapper" id="master-select-wrapper"></div></div><div class="form-row"><div class="form-group"><label for="carModel">Модель авто<span class="required-asterisk">*</span></label><input type="text" id="carModel" name="carModel" required value="${isEdit ? order.carModel || '' : ''}" placeholder="Lada Vesta"></div><div class="form-group"><label for="licensePlateMain">Гос. номер<span class="required-asterisk">*</span></label><div class="plate-input-group"><input type="text" id="licensePlateMain" name="licensePlateMain" class="plate-main-input" placeholder="А123ВС" required maxlength="6"><input type="text" id="licensePlateRegion" name="licensePlateRegion" class="plate-region-input" placeholder="777" required maxlength="3" inputmode="numeric"></div></div></div><div class="form-group"><label for="description">Описание работ<span class="required-asterisk">*</span></label><textarea id="description" name="description" rows="2" required>${isEdit ? order.description : ''}</textarea></div><div class="form-row"><div class="form-group"><label for="clientName">Имя клиента<span class="required-asterisk">*</span></label><div class="input-with-icon"><input type="text" id="clientName" name="clientName" required value="${isEdit ? order.clientName || '' : ''}" autocomplete="off"></div></div><div class="form-group"><label for="clientPhone">Телефон клиента<span class="required-asterisk">*</span></label><div class="phone-input-group"><span class="phone-prefix-static">+7</span><input type="tel" id="clientPhone" name="clientPhone" required value="${isEdit ? (order.clientPhone || '').replace(/^\+?7/, '') : ''}" placeholder="(918) 123-45-67" autocomplete="off" inputmode="numeric"></div></div></div><div class="form-row"><div class="form-group"><label for="amount">Сумма<span class="required-asterisk">*</span></label><div class="amount-input-group"><input type="number" id="amount" name="amount" required value="${isEdit ? order.amount : ''}" inputmode="numeric"><span class="amount-suffix">₽</span></div></div><div class="form-group"><label for="payment-select-wrapper">Тип оплаты<span class="required-asterisk">*</span></label><div class="custom-select-wrapper" id="payment-select-wrapper"></div></div></div><div class="form-group explainer-text"><span class="required-asterisk">*</span>&nbsp;Обязательные поля для заполнения</div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="submit" class="btn btn-success">${isEdit ? 'Сохранить' : 'Добавить'}</button></div></form></div>`;
  document.body.appendChild(modal);

  // --- Populate fields for editing ---
  if (isEdit && order.licensePlate) {
    const plateRegex = /^([А-ЯA-Z0-9]+)(\d{2,3})$/;
    const match = order.licensePlate.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').toUpperCase().match(plateRegex);
    if (match) {
        modal.querySelector('[name="licensePlateMain"]').value = match[1];
        modal.querySelector('[name="licensePlateRegion"]').value = match[2];
    } else {
        modal.querySelector('[name="licensePlateMain"]').value = order.licensePlate;
    }
  }

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
    if(isPhone) nameResultsContainer.innerHTML = ''; else phoneResultsContainer.innerHTML = '';
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      resultsContainer.classList.remove('active');
      return;
    }
    resultsContainer.classList.add('active');
    state.socket.emit('searchClients', query);
  };

  clientNameInput.addEventListener('input', handleSearch);
  clientPhoneInput.addEventListener('input', handleSearch);
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

  // Scroll focused input into view on mobile to avoid keyboard overlap
  modal.querySelector('#order-form').addEventListener('focusin', (e) => {
    if (e.target.matches('input, textarea')) {
        setTimeout(() => {
            e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300); // A small delay can help ensure the keyboard is up
    }
  });

  modal.querySelector('#order-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    if (!priv) formData.set('masterName', state.user.name);
    const data = Object.fromEntries(formData.entries());

    // --- Validation ---
    let isValid = true;
    form.querySelectorAll('[required]').forEach(input => {
        const field = input.closest('.form-group') || input;
        if (!input.value.trim()) {
            isValid = false;
            field.classList.add('has-error');
        } else {
            field.classList.remove('has-error');
        }
    });

    if (!isValid) {
        return showNotification('Пожалуйста, заполните все обязательные поля.', 'error');
    }
    // --- End Validation ---

    // Combine license plate fields
    data.licensePlate = `${data.licensePlateMain || ''}${data.licensePlateRegion || ''}`;
    delete data.licensePlateMain;
    delete data.licensePlateRegion;

    // Add prefix to phone number
    if (data.clientPhone) {
      data.clientPhone = `+7${data.clientPhone.replace(/^\+?7/, '')}`;
    }

    if (!data.amount || +data.amount <= 0) {
        showNotification('Сумма должна быть больше нуля.', 'error');
        form.querySelector('[name="amount"]').classList.add('has-error');
        return;
    }
    data.amount = +data.amount;

    openConfirmationModal({
        title: isEdit ? 'Сохранить изменения?' : 'Добавить заказ-наряд?',
        text: 'Вы уверены, что хотите продолжить?',
        onConfirm: () => {
            state.socket.emit(isEdit ? 'updateOrder' : 'addOrder', data);
            closeModal();
        }
    });
  });
}

export function openClientModal(client = null) {
  closeModal();
  const isEdit = !!client;
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop show';

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? 'Редактировать' : 'Добавить'} клиента</h3>
        <button class="modal-close-btn" data-action="close-modal">&times;</button>
      </div>
      <form id="client-form" class="compact-form">
        <div class="modal-body">
          <input type="hidden" name="id" value="${isEdit ? client.id : ''}">
          <div class="form-group">
            <label for="clientName">Имя клиента<span class="required-asterisk">*</span></label>
            <input type="text" id="clientName" name="name" required value="${isEdit ? client.name : ''}">
          </div>
          <div class="form-group">
            <label for="clientPhone">Телефон клиента<span class="required-asterisk">*</span></label>
            <div class="phone-input-group">
              <span class="phone-prefix-static">+7</span>
              <input type="tel" id="clientPhone" name="phone" required value="${isEdit ? (client.phone || '').replace(/^\+?7/, '') : ''}" placeholder="(918) 123-45-67" inputmode="numeric">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
                <label for="carModel">Модель авто</label>
                <input type="text" id="carModel" name="carModel" value="${isEdit ? client.carModel || '' : ''}" placeholder="Lada Vesta">
            </div>
            <div class="form-group">
                <label for="licensePlateMain">Гос. номер</label>
                <div class="plate-input-group">
                    <input type="text" id="licensePlateMain" name="licensePlateMain" class="plate-main-input" placeholder="А123ВС" maxlength="6">
                    <input type="text" id="licensePlateRegion" name="licensePlateRegion" class="plate-region-input" placeholder="777" maxlength="3" inputmode="numeric">
                </div>
            </div>
          </div>
          <div class="form-group explainer-text"><span class="required-asterisk">*</span>&nbsp;Обязательные поля для заполнения</div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button>
          <button type="submit" class="btn btn-success">${isEdit ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  if (isEdit && client.licensePlate) {
    const plateRegex = /^([А-ЯA-Z0-9]+)(\d{2,3})$/;
    const match = client.licensePlate.replace(/[^a-zA-Zа-яА-Я0-9]/g, '').toUpperCase().match(plateRegex);
    if (match) {
        modal.querySelector('[name="licensePlateMain"]').value = match[1];
        modal.querySelector('[name="licensePlateRegion"]').value = match[2];
    } else {
        modal.querySelector('[name="licensePlateMain"]').value = client.licensePlate;
    }
  }

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-modal"]') || e.target === modal) {
      closeModal();
    }
  });

  modal.querySelector('#client-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.phone) {
      return showNotification('Пожалуйста, заполните все обязательные поля.', 'error');
    }

    data.phone = `+7${data.phone.replace(/^\+?7/, '')}`;
    data.licensePlate = `${data.licensePlateMain || ''}${data.licensePlateRegion || ''}`;
    delete data.licensePlateMain;
    delete data.licensePlateRegion;

    openConfirmationModal({
      title: isEdit ? 'Сохранить изменения?' : 'Добавить клиента?',
      text: 'Вы уверены, что хотите продолжить?',
      onConfirm: () => {
        state.socket.emit(isEdit ? 'updateClient' : 'addClient', data);
        closeModal();
      }
    });
  });
}

export function openConfirmationModal({ title, text, onConfirm }) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3 class="modal-title">${title}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div><div class="modal-body">${text || '<p>Это действие нельзя отменить.</p>'}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-danger" id="confirmBtn">Подтвердить</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
    modal.querySelector('#confirmBtn').addEventListener('click', () => { onConfirm(); closeModal(); });
}

export function openClearDataCaptchaModal() {
    closeModal();
    const captcha = String(Math.floor(1000 + Math.random() * 9000));
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header"><h3 class="modal-title">Подтверждение сброса данных</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
        <div class="modal-body">
          <p>Это действие необратимо. Все текущие заказ-наряды и вся история будут удалены. База данных вернется к начальному состоянию.</p>
          <p>Для подтверждения, пожалуйста, введите число <strong>${captcha}</strong> в поле ниже.</p>
          <div class="form-group"><input type="text" id="captcha-input" class="form-control" autocomplete="off" inputmode="numeric" pattern="[0-9]*"></div>
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
    captchaInput.addEventListener('input', () => { confirmBtn.disabled = captchaInput.value !== captcha; });
    confirmBtn.addEventListener('click', () => { state.socket.emit('clearData'); closeModal(); });
}

export function openArchivedWeekModal(weekData) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    const weekRevenue = weekData.orders.reduce((sum, o) => sum + o.amount, 0);
    const sortedOrders = [...weekData.orders].sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    const firstOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[0].createdAt) : 'N/A';
    const lastOrderDate = sortedOrders.length > 0 ? formatDate(sortedOrders[sortedOrders.length - 1].createdAt) : 'N/A';

    modal.innerHTML = `
      <div class="modal-content modal-xl">
        <div class="modal-header"><h3 class="modal-title">Архив недели: ${firstOrderDate} - ${lastOrderDate}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
        <div class="modal-body" id="archived-week-orders-container"></div>
        <div class="modal-footer"><span>Итоговая выручка: <strong>${formatCurrency(weekRevenue)}</strong></span><button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
    renderOrdersList(modal.querySelector('#archived-week-orders-container'), weekData.orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
}

export function openBonusModal(masterName) {
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
      <div class="modal-header"><h3 class="modal-title">Премия для: ${masterName}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
      <div class="modal-body">
        <div class="bonus-info-row"><span>Базовая зарплата</span><strong>${formatCurrency(baseSalary)}</strong></div>
        <div class="form-group">
          <label>Бонус</label>
          <div id="elastic-slider-container"></div>
        </div>
        <div class="bonus-info-row"><span>Сумма премии</span><strong id="bonus-amount-display">${formatCurrency(currentBonus)}</strong></div><hr>
        <div class="bonus-info-row total"><span>Итоговая зарплата</span><strong id="total-salary-display">${formatCurrency(baseSalary + currentBonus)}</strong></div>
      </div>
      <div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Отмена</button><button type="button" class="btn btn-success btn-lg" id="confirm-bonus">Начислить</button></div>
    </div>`;
  document.body.appendChild(modal);

  const bonusAmountDisplay = modal.querySelector('#bonus-amount-display');
  const totalSalaryDisplay = modal.querySelector('#total-salary-display');

  let bonusPercentage = currentBonusPercentage;

  const slider = createElasticSlider(modal.querySelector('#elastic-slider-container'), {
      startingValue: 0,
      maxValue: 30,
      defaultValue: currentBonusPercentage,
      isStepped: true,
      stepSize: 2,
      leftIconHTML: '₽',
      rightIconHTML: '₽',
      onValueChange: (newValue) => {
          bonusPercentage = newValue;
          const bonusAmount = baseSalary * (bonusPercentage / 100);
          bonusAmountDisplay.textContent = formatCurrency(bonusAmount);
          totalSalaryDisplay.textContent = formatCurrency(baseSalary + bonusAmount);
      }
  });

  modal.querySelector('#confirm-bonus').addEventListener('click', () => {
    const bonusAmount = baseSalary * (bonusPercentage / 100);
    salaryItem.dataset.bonus = bonusAmount;
    finalSalaryEl.textContent = formatCurrency(baseSalary + bonusAmount);

    if (bonusAmount > 0) {
      salaryItem.classList.add('bonus-awarded');
    } else {
      salaryItem.classList.remove('bonus-awarded');
    }

    closeModal();
  });

  modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
}

export function openClientHistoryModal(client) {
    closeModal();
    const allOrders = [...state.data.weekOrders, ...state.data.history.flatMap(h => h.orders)];
    const clientOrders = allOrders.filter(o => o.clientId === client.id || o.clientPhone === client.phone).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const totalRevenue = clientOrders.reduce((sum, o) => sum + o.amount, 0);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';
    modal.innerHTML = `
      <div class="modal-content modal-xl">
        <div class="modal-header">
          <div><h3 class="modal-title">История клиента: ${client.name}</h3><p style="color: var(--text-muted); font-size: 0.9rem;">${client.phone}</p></div>
          <button class="modal-close-btn" data-action="close-modal">&times;</button>
        </div>
        <div class="modal-body" id="client-history-orders-container"></div>
        <div class="modal-footer" style="justify-content: space-between;">
            <div><span>Всего заказ-нарядов: <strong>${clientOrders.length}</strong></span><span style="margin-left: 16px;">Общая сумма: <strong>${formatCurrency(totalRevenue)}</strong></span></div>
            <button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
    renderOrdersList(modal.querySelector('#client-history-orders-container'), clientOrders, 'history_modal');
}

export function openWeekReportModal(weekData) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop show';

    const weekRevenue = weekData.orders.reduce((sum, o) => sum + o.amount, 0);
    const serviceProfit = weekRevenue * 0.5;
    const totalPayout = weekData.salaryReport.reduce((sum, r) => sum + r.finalSalary, 0);
    const firstOrderDate = weekData.orders.length > 0 ? formatDate(weekData.orders[0].createdAt) : 'N/A';

    let reportHtml = weekData.salaryReport.map(r => `<tr><td>${r.name}</td><td>${formatCurrency(r.baseSalary)}</td><td>${formatCurrency(r.bonus)}</td><td>${formatCurrency(r.finalSalary)}</td></tr>`).join('');

    modal.innerHTML = `
      <div class="modal-content modal-lg">
        <div class="modal-header"><h3 class="modal-title">Финансовый отчет за неделю от ${firstOrderDate}</h3><button class="modal-close-btn" data-action="close-modal">&times;</button></div>
        <div class="modal-body">
            <div class="dashboard" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
                <div class="dashboard-item"><div class="dashboard-item-title">Общая выручка</div><div class="dashboard-item-value">${formatCurrency(weekRevenue)}</div></div>
                <div class="dashboard-item"><div class="dashboard-item-title">Прибыль сервиса</div><div class="dashboard-item-value">${formatCurrency(serviceProfit)}</div></div>
                <div class="dashboard-item"><div class="dashboard-item-title">Всего выплачено</div><div class="dashboard-item-value">${formatCurrency(totalPayout)}</div></div>
            </div>
            <h4 style="margin-top: 24px; margin-bottom: 12px;">Детализация по мастерам</h4>
            <table class="leaderboard-table"><thead><tr><th>Мастер</th><th>Базовая ЗП (50%)</th><th>Премия</th><th>Итог к выплате</th></tr></thead><tbody>${reportHtml}</tbody></table>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-action="close-modal">Закрыть</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]') || e.target === modal) closeModal(); });
}

// Private function used inside openOrderModal
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
        </div>`;
    if (disabled) return;
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const optionsContainer = wrapper.querySelector('.custom-options');
    const hiddenInput = wrapper.querySelector(`input[name="${name}"]`);
    const selectedSpan = trigger.querySelector('span');
    trigger.addEventListener('click', () => optionsContainer.classList.toggle('active'));
    optionsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-option');
        if (option) {
            hiddenInput.value = option.dataset.value;
            selectedSpan.textContent = option.dataset.value;
            wrapper.querySelector('.custom-option.selected')?.classList.remove('selected');
            option.classList.add('selected');
            optionsContainer.classList.remove('active');
        }
    });
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) optionsContainer.classList.remove('active');
    });
}
