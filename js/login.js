/*────────────────────────────────────────────
  js/login.js
  Логика для страницы входа.
─────────────────────────────────────────────*/

import { showNotification } from './utils.js';

// URL сервера. В будущем здесь будет публичный адрес.
const SERVER_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', () => {
  // --- Блок 1: Хедер (Дата, время, тема) ---
  const dateEl = document.getElementById('current-date');
  const timeEl = document.getElementById('current-time');
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;

  if (!dateEl || !timeEl || !themeToggle) {
    console.error('Не найдены обязательные элементы хедера.');
    return;
  }

  function updateDateTime() {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    timeEl.textContent = now.toLocaleTimeString('ru-RU');
  }
  updateDateTime();
  setInterval(updateDateTime, 1000);

  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    themeToggle.checked = (theme === 'light');
    localStorage.setItem('vipauto_theme', theme);
  }

  themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'light' : 'dark';
    applyTheme(newTheme);
  });

  const savedTheme = localStorage.getItem('vipauto_theme') || 'dark';
  applyTheme(savedTheme);

  // --- Блок 2: Логика формы входа ---
  const form = document.getElementById('login-form');
  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const togglePassBtn = document.getElementById('toggle-password');
  const submitBtn = form.querySelector('button[type="submit"]');
  const rememberMe = document.getElementById('remember-me');

  if (!form || !userInput || !passInput || !submitBtn) {
    console.error('Не найдены обязательные элементы формы.');
    return;
  }

  // Показать/скрыть пароль
  togglePassBtn.addEventListener('click', () => {
    const isPassword = passInput.type === 'password';
    passInput.type = isPassword ? 'text' : 'password';
    togglePassBtn.classList.toggle('fa-eye', !isPassword);
    togglePassBtn.classList.toggle('fa-eye-slash', isPassword);
  });

  // Валидация полей
  function validateField(input) {
    const errorEl = input.closest('.form-group').querySelector('.error-message');
    if (!input.value.trim()) {
      if (errorEl) errorEl.textContent = 'Поле не может быть пустым';
      return false;
    }
    if (errorEl) errorEl.textContent = '';
    return true;
  }

  userInput.addEventListener('input', () => validateField(userInput));
  passInput.addEventListener('input', () => validateField(passInput));

  // Обработка отправки формы
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isLoginValid = validateField(userInput);
    const isPassValid = validateField(passInput);
    if (!isLoginValid || !isPassValid) return;

    const login = userInput.value.trim();
    const password = passInput.value;

    submitBtn.disabled = true;
    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';

    try {
      // Отправляем запрос на сервер для аутентификации
      const response = await fetch(`${SERVER_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ login, password }),
      });

      const result = await response.json();

      if (response.ok) {
        // Сервер подтвердил вход
        const storage = rememberMe.checked ? localStorage : sessionStorage;
        storage.setItem('vipauto_token', result.token);
        storage.setItem('vipauto_user', JSON.stringify(result.user));
        
        showNotification('Успешный вход! Перенаправляем...', 'success');
        
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1200);

      } else {
        // Сервер вернул ошибку
        throw new Error(result.message || 'Неверный логин или пароль');
      }

    } catch (error) {
      showNotification(error.message || 'Ошибка сети. Сервер недоступен.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnContent;
    }
  });

  // При загрузке страницы проверяем, не залогинен ли уже пользователь
  const token = localStorage.getItem('vipauto_token') || sessionStorage.getItem('vipauto_token');
  if (token) {
    // Если токен есть, сразу перенаправляем в приложение
    window.location.href = 'index.html';
  }
});
