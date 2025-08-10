/*────────────────────────────────────────────
  js/login.js
  Финальная полировка - Версия 9.0
─────────────────────────────────────────────*/
document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-toggle');
  const htmlEl = document.documentElement;

  const applyTheme = (theme) => {
    htmlEl.setAttribute('data-theme', theme);
    if (themeToggle) themeToggle.checked = (theme === 'light');
    localStorage.setItem('vipauto_theme', theme);
  };

  if (themeToggle) {
    themeToggle.addEventListener('change', () => applyTheme(themeToggle.checked ? 'light' : 'dark'));
  }
  applyTheme(localStorage.getItem('vipauto_theme') || 'dark');

  const form = document.getElementById('login-form');
  if (!form) return;

  const userInput = document.getElementById('username');
  const passInput = document.getElementById('password');
  const togglePassBtn = document.getElementById('toggle-password');
  const submitBtn = form.querySelector('button[type="submit"]');
  const rememberMe = document.getElementById('remember-me');
  const errorEl = form.querySelector('.general-error-message');

  if (togglePassBtn) {
    togglePassBtn.addEventListener('click', () => {
      const isPassword = passInput.type === 'password';
      passInput.type = isPassword ? 'text' : 'password';
      togglePassBtn.classList.toggle('fa-eye', !isPassword);
      togglePassBtn.classList.toggle('fa-eye-slash', isPassword);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!userInput.value || !passInput.value) {
        if(errorEl) errorEl.textContent = 'Все поля обязательны для заполнения.';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Вход...</span>`;
    if(errorEl) errorEl.textContent = '';

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: userInput.value, password: passInput.value }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.message || 'Ошибка сервера');

      const storage = rememberMe.checked ? localStorage : sessionStorage;
      storage.setItem('vipauto_token', result.token);
      storage.setItem('vipauto_user', JSON.stringify(result.user));

      window.location.href = 'index.html';

    } catch (error) {
      if(errorEl) errorEl.textContent = error.message;
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Войти</span>';
    }
  });
});
