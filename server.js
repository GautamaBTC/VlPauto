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
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-for-vipauto-dont-share-it';
const DB_PATH = path.join(__dirname, 'db.json'); // Путь к нашей "базе данных"

const app = express();

// --- Настройка обслуживания статических файлов ---
// Это позволяет Express раздавать файлы index.html, login.html, script.js, style.css и т.д.
app.use(express.static(__dirname));

app.use(cors()); // Разрешаем запросы с других доменов (например, с вашего GitHub Pages)
app.use(express.json()); // Позволяем серверу читать JSON из тела запроса

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Разрешает запросы с того же источника
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
      'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' }, // Исправлено имя из db.json
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

// --- РЕЗЕРВНОЕ КОПИРОВАНИЕ ---
const BACKUP_DIR = path.join(__dirname, 'backups');

const backupDatabase = async () => {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true }); // Создаем папку, если ее нет
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const backupPath = path.join(BACKUP_DIR, `db-backup-${timestamp}.json`);

    // Копируем только если бэкапа за сегодня еще нет
    await fs.access(backupPath, fs.constants.F_OK).catch(async () => {
        await fs.copyFile(DB_PATH, backupPath);
        console.log(`Создана резервная копия: ${backupPath}`);
    });
  } catch (error) {
    console.error('Ошибка создания резервной копии:', error);
  }
};


// --- БИЗНЕС-ЛОГИКА ---

/**
 * Возвращает заказы за последние 7 дней.
 */
const getWeekOrders = () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  // Сортируем от новых к старым
  return db.orders
    .filter(order => new Date(order.createdAt) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Рассчитывает статистику на основе списка заказов.
 * @param {Array} orders - Список заказов.
 * @returns {object} - Объект со статистикой { revenue, ordersCount, avgCheck }.
 */
const calculateStats = (orders) => {
  const ordersCount = orders.length;
  const revenue = orders.reduce((sum, order) => sum + order.amount, 0);
  const avgCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;
  return { revenue, ordersCount, avgCheck };
};

/**
 * Генерирует доску лидеров.
 * @param {Array} weekOrders - Заказы за неделю.
 * @param {Array} masters - Список всех мастеров.
 * @returns {Array} - Отсортированный список мастеров со статистикой.
 */
const generateLeaderboard = (weekOrders, masters) => {
  const statsByMaster = {};
  masters.forEach(masterName => {
    statsByMaster[masterName] = { name: masterName, revenue: 0, ordersCount: 0 };
  });

  weekOrders.forEach(order => {
    if (statsByMaster[order.masterName]) {
      statsByMaster[order.masterName].revenue += order.amount;
      statsByMaster[order.masterName].ordersCount += 1;
    }
  });

  return Object.values(statsByMaster).sort((a, b) => b.revenue - a.revenue);
};

/**
 * Подготавливает полный набор данных для отправки клиенту.
 * @param {object} user - Объект пользователя из токена.
 * @returns {object} - Данные для отправки.
 */
const prepareDataForUser = (user) => {
    const weekOrders = getWeekOrders();
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = weekOrders.filter(o => o.createdAt.startsWith(today));
    const masters = Object.values(db.users)
        .filter(u => u.role === 'MASTER')
        .map(u => u.name);

    const leaderboard = generateLeaderboard(weekOrders, masters);

    // Для директора - общая статистика. Для мастера - его личная.
    const relevantOrdersForStats = user.role === 'DIRECTOR'
        ? weekOrders
        : weekOrders.filter(o => o.masterName === user.name);

    const weekStats = calculateStats(relevantOrdersForStats);

    // Расчет ЗП (упрощенный, 50% от выручки)
    const salaryData = leaderboard.map(m => ({
        name: m.name,
        total: m.revenue * 0.5, // Пример расчета: 50% от выручки
    }));

    // Для мастера фильтруем weekOrders, чтобы он видел только свои в истории
    const relevantWeekOrders = user.role === 'DIRECTOR'
        ? weekOrders
        : weekOrders.filter(o => o.masterName === user.name);


    return {
        todayOrders,
        weekOrders: relevantWeekOrders,
        weekStats,
        leaderboard,
        salaryData,
        masters,
    };
};

/**
 * Рассылает обновленные данные всем подключенным пользователям.
 */
const broadcastUpdates = () => {
    // io.sockets.sockets — это Map, а не Array, поэтому используем forEach
    io.sockets.sockets.forEach(socket => {
        const data = prepareDataForUser(socket.user);
        socket.emit('dataUpdate', data);
    });
    console.log('Обновления разосланы всем клиентам.');
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
  const initialData = prepareDataForUser(socket.user);
  socket.emit('initialData', initialData);

  socket.on('disconnect', () => {
    console.log(`Пользователь '${socket.user.name}' отключился.`);
  });

  // --- ОБРАБОТЧИКИ СОБЫТИЙ ОТ КЛИЕНТА ---

  socket.on('addOrder', async (orderData) => {
    // Простая валидация
    if (!orderData || !orderData.description || !orderData.amount) {
      return socket.emit('serverError', 'Некорректные данные заказа.');
    }

    // Директор может назначить любого мастера, мастер - только себя
    if (socket.user.role === 'MASTER' && orderData.masterName !== socket.user.name) {
        orderData.masterName = socket.user.name;
    }

    const newOrder = {
      ...orderData,
      id: `ord-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };

    db.orders.push(newOrder);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('updateOrder', async (orderData) => {
    if (!orderData || !orderData.id) {
      return socket.emit('serverError', 'Необходим ID заказа для обновления.');
    }

    const orderIndex = db.orders.findIndex(o => o.id === orderData.id);
    if (orderIndex === -1) {
      return socket.emit('serverError', 'Заказ не найден.');
    }

    // Проверка прав: может редактировать директор или владелец заказа
    const canUpdate = socket.user.role === 'DIRECTOR' || db.orders[orderIndex].masterName === socket.user.name;
    if (!canUpdate) {
      return socket.emit('serverError', 'Недостаточно прав для редактирования этого заказа.');
    }

    db.orders[orderIndex] = { ...db.orders[orderIndex], ...orderData };
    await saveDB();
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (orderId) => {
    if (!orderId) {
      return socket.emit('serverError', 'Необходим ID заказа для удаления.');
    }

    const orderIndex = db.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        return socket.emit('serverError', 'Заказ не найден.');
    }

    // Проверка прав: может удалить директор или владелец заказа
    const canDelete = socket.user.role === 'DIRECTOR' || db.orders[orderIndex].masterName === socket.user.name;
    if (!canDelete) {
      return socket.emit('serverError', 'Недостаточно прав для удаления этого заказа.');
    }

    db.orders = db.orders.filter(o => o.id !== orderId);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('getArchiveData', ({ startDate, endDate }) => {
    if (!startDate || !endDate) {
      return socket.emit('serverError', 'Необходимо указать начальную и конечную даты.');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Включаем весь конечный день

    let filteredOrders = db.orders.filter(order => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= start && orderDate <= end;
    });

    // Мастер видит только свои архивные заказы
    if (socket.user.role === 'MASTER') {
      filteredOrders = filteredOrders.filter(o => o.masterName === socket.user.name);
    }

    // Сортируем от новых к старым
    filteredOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    socket.emit('archiveData', filteredOrders);
  });
});


// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB(); // Загружаем базу данных перед запуском

  // Инициализация и планирование резервного копирования
  await backupDatabase();
  setInterval(backupDatabase, 1000 * 60 * 60 * 24); // Раз в 24 часа

  console.log(`Сервер VIPавто запущен на порту ${PORT}...`);
  console.log('Теперь вы можете открыть login.html в браузере и попробовать войти.');
});
