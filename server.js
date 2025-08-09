/*────────────────────────────────────────────
  server.js
  Серверная часть для бортового журнала VIPавто.
─────────────────────────────────────────────*/

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

// --- НАСТРОЙКИ ---
const PORT = 3000;
const JWT_SECRET = 'your-super-secret-key-for-vipauto-dont-share-it'; // Секретный ключ для подписи токенов
const DB_PATH = path.join(__dirname, 'db.json'); // Путь к нашей "базе данных"

const app = express();
app.use(cors()); // Разрешаем запросы с других доменов (например, с вашего GitHub Pages)
app.use(express.json()); // Позволяем серверу читать JSON из тела запроса

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Разрешаем подключения с любых адресов
    methods: ["GET", "POST"]
  }
});

// --- БАЗА ДАННЫХ В ОПЕРАТИВНОЙ ПАМЯТИ ---
let db = {
  users: {},
  orders: [],
};

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const loadDB = async () => {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    db = JSON.parse(data);
    console.log('База данных успешно загружена.');
  } catch (error) {
    // Если файл не найден, создаем его с пользователями по умолчанию
    console.log('Файл базы данных не найден. Создание новой...');
    db.users = {
      'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Александр Иванов' },
      'vladimir.ch': { password: 'Vch4R5tG', role: 'MASTER', name: 'Владимир Ч.' },
      'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
      'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
      'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
      'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
      'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
    };
    await saveDB();
  }
};

const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)); // `null, 2` для красивого форматирования
  } catch (error) {
    console.error('Ошибка сохранения базы данных:', error);
  }
};

// --- ЛОГИКА АУТЕНТИФИКАЦИИ (HTTP) ---
app.post('/login', (req, res) => {
  const { login, password } = req.body;

  const userRecord = db.users[login];

  if (!userRecord || userRecord.password !== password) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }

  // Создаем "пропуск" (JWT токен)
  const token = jwt.sign(
    { login: login, role: userRecord.role, name: userRecord.name },
    JWT_SECRET,
    { expiresIn: '24h' } // Токен действует 24 часа
  );

  res.json({
    message: 'Успешный вход',
    token,
    user: {
      name: userRecord.name,
      role: userRecord.role
    }
  });
});

// --- ЛОГИКА РЕАЛЬНОГО ВРЕМЕНИ (SOCKET.IO) ---

// Middleware для проверки "пропуска" при подключении
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return next(new Error('Invalid token'));
    }
    socket.user = user; // Сохраняем информацию о пользователе в сокете
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`Пользователь '${socket.user.name}' (${socket.user.role}) подключился.`);

  // Отправляем начальные данные при подключении
  socket.emit('initialData', {
    masters: Object.values(db.users).filter(u => u.role === 'MASTER').map(u => u.name),
    // TODO: Здесь будет отправка заказов, статистики и т.д.
  });

  socket.on('disconnect', () => {
    console.log(`Пользователь '${socket.user.name}' отключился.`);
  });

  // TODO: Здесь будут обработчики событий от клиента (добавление заказа и т.д.)
});


// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB(); // Загружаем базу данных перед запуском
  console.log(`Сервер VIPавто запущен на порту ${PORT}...`);
  console.log('Теперь вы можете открыть login.html в браузере и попробовать войти.');
});
