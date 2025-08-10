/*────────────────────────────────────────────
  js/login.js
  Версия 5.0 - "Чистый лист". Стабильная логика входа.
─────────────────────────────────────────────*/

const SERVER_URL = '';

document.addEventListener('DOMContentLoaded', () => {
  // --- Блок 1: Тема ---
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;
  
  function applyTheme(theme) {
    htmlEl.setAttribute('data-theme', theme);
    if(themeToggle) themeToggle.checked = (theme === 'light');
    localStorage.setItem('vipauto_theme', theme);
  }

  if(themeToggle) {
    themeToggle.addEventListener('change', () => {
      applyTheme(themeToggle.checked ? 'light' : 'dark');
    });
  }
  applyTheme(localStorage.getItem('vipauto_theme') || 'dark');

  // --- Блок 2: Логика формы входа ---
  const form = document.getElementById('login-form');
  if (!form) return;

  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const togglePassBtn = document.getElementById('toggle-password');
  const submitBtn = form.querySelector('button[type="submit"]');
  const rememberMe = document.getElementById('remember-me');

  // Показать/скрыть пароль
  if(togglePassBtn) {
    togglePassBtn.addEventListener('click', () => {
      const isPassword = passInput.type === 'password';
      passInput.type = isPassword ? 'text' : 'password';
      togglePassBtn.classList.toggle('fa-eye', !isPassword);
      togglePassBtn.classList.toggle('fa-eye-slash', isPassword);
    });
  }

  function setFieldError(input, message) {
      const errorEl = input.closest('.form-group').querySelector('.error-message');
      if (errorEl) errorEl.textContent = message;
  }

  function validateField(input) {
    if (!input.value.trim()) {
      setFieldError(input, 'Поле не может быть пустым');
      return false;
    }
    setFieldError(input, '');
    return true;
  }
  
  userInput.addEventListener('input', () => validateField(userInput));
  passInput.addEventListener('input', () => validateField(passInput));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isLoginValid = validateField(userInput);
    const isPassValid = validateField(passInput);
    if (!isLoginValid || !isPassValid) return;

    const login = userInput.value.trim();
    const password = passInput.value;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Вход...';
    // Сбрасываем общую ошибку
    const generalErrorEl = form.querySelector('.general-error-message');
    if(generalErrorEl) generalErrorEl.textContent = '';


    try {
      const response = await fetch(`${SERVER_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Неверный логин или пароль');
      }

      const storage = rememberMe.checked ? localStorage : sessionStorage;
      storage.setItem('vipauto_token', result.token);
      storage.setItem('vipauto_user', JSON.stringify(result.user));

      // Успех! Перенаправляем на главную страницу.
      window.location.href = 'index.html';

    } catch (error) {
      // Используем поле для общей ошибки под кнопкой
      if(generalErrorEl) {
        generalErrorEl.textContent = error.message || 'Ошибка сети. Попробуйте снова.';
      } else {
        // Fallback если нет специального поля
        setFieldError(passInput, error.message || 'Ошибка сети.');
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket btn-fa"></i> Войти';
    }
  });

  // КРИТИЧЕСКАЯ ОШИБКА БЫЛА ЗДЕСЬ. БЛОК УДАЛЕН.
  // Страница входа НЕ ДОЛЖНА решать, авторизован ли пользователь.
  // Это задача страницы index.html.
});
