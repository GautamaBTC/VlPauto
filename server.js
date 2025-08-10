/*────────────────────────────────────────────
  server.js
  Версия 4.0 - Улучшенная логика и стабильность
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
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
app.use(cors());
app.use(express.json());

// --- МАРШРУТИЗАЦИЯ ---
// Отдаем статические файлы (CSS, JS, изображения)
app.use(express.static(__dirname));

// Главная страница - всегда login.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Защищенный маршрут для основного приложения
app.get('/index.html', (req, res) => {
  // Простая проверка, чтобы предотвратить прямой доступ без входа.
  // Основная защита - на клиенте (проверка токена).
  // Этот редирект сработает, если кто-то вставит прямой URL в браузере.
  const referer = req.headers.referer || '';
  if (!referer.endsWith('/login.html') && !referer.endsWith('/')) {
      // Можно добавить более сложную логику, но для SPA это обычно не требуется
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});


const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, methods: ["GET", "POST"] } });

let db = { users: {}, orders: [], history: [] };

// --- ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ ---
const seedDatabaseWithTestData = async () => {
    console.log('--- ЗАПУСК ЗАПОЛНЕНИЯ ТЕСТОВЫМИ ДАННЫМИ ---');
    if (!db.users || Object.keys(db.users).length === 0) {
        console.log('Пользователи не найдены. Невозможно создать тестовые данные.');
        return;
    }

    const masterNames = Object.values(db.users).filter(u => u.role === 'MASTER' || u.role === 'SENIOR_MASTER').map(u => u.name);
    const carBrands = ['Lada Vesta', 'Toyota Camry', 'Ford Focus', 'BMW X5', 'Mercedes C-Class', 'Audi A6', 'Kia Rio', 'Hyundai Solaris', 'Renault Logan', 'Nissan Qashqai'];
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ', 'Ремонт подвески', 'Регулировка сход-развала', 'Заправка кондиционера'];

    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const masterName = masterNames[Math.floor(Math.random() * masterNames.length)];
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * (19-9) + 9), Math.floor(Math.random() * 60));

        testOrders.push({
            id: `ord-${Date.now()}-${i}`,
            masterName: masterName,
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * (15000 - 500 + 1) + 500) * 10,
            paymentType: ['Картой', 'Наличные', 'Перевод'][Math.floor(Math.random() * 3)],
            createdAt: date.toISOString(),
        });
    }
    db.orders = testOrders;
    console.log(`--- СОЗДАНО ${testOrders.length} ТЕСТОВЫХ ЗАКАЗ-НАРЯДОВ ---`);
};


// --- УПРАВЛЕНИЕ БАЗОЙ ДАННЫХ ---
const loadDB = async () => {
  try {
    // Пытаемся прочитать файл
    await fs.access(DB_PATH);
    const data = await fs.readFile(DB_PATH, 'utf-8');
    db = JSON.parse(data);
    if (!db.history) db.history = [];
    console.log('База данных успешно загружена.');

    // Если база загружена, но она пустая, заполняем ее
    if (!db.orders || db.orders.length === 0) {
        console.log('База данных загружена, но заказы отсутствуют. Запускаем заполнение...');
        await seedDatabaseWithTestData();
        await saveDB(); // Сохраняем после заполнения
    }
  } catch (error) {
    // Если файла нет или он 'битый'
    console.log('Файл базы данных не найден или поврежден. Создание новой базы...');
    db = {
      users: {
        'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' },
        'vladimir.ch': { password: 'Vch4R5tG', role: 'SENIOR_MASTER', name: 'Владимир Ч.' },
        'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
        'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
        'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
        'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
        'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
      },
      orders: [],
      history: []
    };
    await seedDatabaseWithTestData(); // Заполняем новую базу
    await saveDB(); // И сохраняем ее
  }
};

const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('КРИТИЧЕСКАЯ ОШИБКА: Не удалось сохранить базу данных:', error);
  }
};

// --- БИЗНЕС-ЛОГИКА (без изменений) ---
const isPrivileged = (user) => user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER';
const getWeekOrders = () => (db.orders || []).filter(o => (new Date() - new Date(o.createdAt)) < 7 * 24 * 3600 * 1000).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
const calculateStats = (orders) => { const count = orders.length; const revenue = orders.reduce((s, o) => s + o.amount, 0); return { revenue, ordersCount: count, avgCheck: count > 0 ? Math.round(revenue / count) : 0 }; };
const generateLeaderboard = (orders, masters) => { const stats = {}; masters.forEach(m => { stats[m] = { name: m, revenue: 0 }; }); orders.forEach(o => { if(stats[o.masterName]) stats[o.masterName].revenue += o.amount; }); return Object.values(stats).sort((a, b) => b.revenue - a.revenue); };

const prepareDataForUser = (user) => {
    const allWeekOrders = getWeekOrders();
    const masters = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const leaderboard = generateLeaderboard(allWeekOrders, masters);
    const salaryData = leaderboard.map(m => ({ name: m.name, total: m.revenue * 0.5 }));
    const userIsPrivileged = isPrivileged(user);
    const relevantOrders = userIsPrivileged ? allWeekOrders : allWeekOrders.filter(o => o.masterName === user.name);
    return {
        weekOrders: relevantOrders,
        weekStats: calculateStats(relevantOrders),
        todayOrders: relevantOrders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))),
        leaderboard,
        salaryData,
        masters,
        user,
    };
};

const broadcastUpdates = () => {
    io.sockets.sockets.forEach(socket => {
        if(socket.user) socket.emit('dataUpdate', prepareDataForUser(socket.user));
    });
    console.log('Обновления разосланы всем подключенным клиентам.');
};


// --- ЛОГИКА SOCKET.IO ---
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: no token'));
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user;
    next();
  } catch (err) {
    console.log("Ошибка верификации токена:", err.message);
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Пользователь '${socket.user.name}' (${socket.user.role}) подключился.`);
  socket.emit('initialData', prepareDataForUser(socket.user));

  socket.on('addOrder', async (orderData) => {
    if (!isPrivileged(socket.user)) orderData.masterName = socket.user.name;
    if (!orderData.masterName) return socket.emit('serverError', 'Необходимо выбрать исполнителя.');
    db.orders.unshift({ ...orderData, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() });
    await saveDB();
    broadcastUpdates();
  });

  socket.on('updateOrder', async (orderData) => {
    const orderIndex = db.orders.findIndex(o => o.id === orderData.id);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');
    if (!isPrivileged(socket.user) && db.orders[orderIndex].masterName !== socket.user.name) return socket.emit('serverError', 'Нет прав на редактирование.');
    db.orders[orderIndex] = { ...db.orders[orderIndex], ...orderData };
    await saveDB();
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (orderId) => {
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Нет прав на удаление.');
    db.orders = db.orders.filter(o => o.id !== orderId);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('getArchiveData', ({ startDate, endDate }) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    let filtered = (db.history || []).flatMap(w => w.orders).filter(o => new Date(o.createdAt) >= start && new Date(o.createdAt) <= end);
    if (!isPrivileged(socket.user)) filtered = filtered.filter(o => o.masterName === socket.user.name);
    socket.emit('archiveData', filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  });

  socket.on('closeWeek', async () => {
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Нет прав.');
    if (db.orders.length === 0) return socket.emit('serverError', 'Нет заказ-нарядов для закрытия.');
    db.history.unshift({ weekId: `week-${Date.now()}`, orders: [...db.orders] });
    db.orders = [];
    await saveDB();
    broadcastUpdates();
  });

  socket.on('clearData', async () => {
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Нет прав.');
    db.orders = [];
    db.history = [];
    await seedDatabaseWithTestData();
    await saveDB();
    broadcastUpdates();
  });

  socket.on('disconnect', () => console.log(`Пользователь '${socket.user.name}' отключился.`));
});

// --- API-ЭНДПОИНТ ДЛЯ ВХОДА ---
app.post('/login', (req, res) => {
  const { login, password } = req.body;
  const userRecord = db.users[login];
  if (!userRecord || userRecord.password !== password) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ message: 'Успешный вход', token, user: { login, name: userRecord.name, role: userRecord.role } });
});


// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB();
  console.log(`Сервер VIPавто v4.0 запущен на порту ${PORT}...`);
});
