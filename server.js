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
const JWT_SECRET = 'your-super-secret-key-for-vipauto-dont-share-it';
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let db = { users: {}, orders: [], history: [] };

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
const getWeekId = (date = new Date()) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const loadDB = async () => {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    db = JSON.parse(data);
    if (!db.history) db.history = [];
    console.log('База данных успешно загружена.');
  } catch (error) {
    console.log('Файл базы данных не найден. Создание новой...');
    db = {
      users: {
        'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Михайлович Орлов' },
        'vladimir.ch': { password: 'Vch4R5tG', role: 'MASTER', name: 'Владимир Ч.' },
        'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
        'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
        'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
        'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
        'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
      },
      orders: [],
      history: []
    };
    await saveDB();
  }
};

const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения базы данных:', error);
  }
};

// --- БИЗНЕС-ЛОГИКА ---
const getWeekOrders = () => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return (db.orders || [])
    .filter(order => new Date(order.createdAt) >= sevenDaysAgo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const calculateStats = (orders) => {
  const ordersCount = orders.length;
  const revenue = orders.reduce((sum, order) => sum + order.amount, 0);
  const avgCheck = ordersCount > 0 ? Math.round(revenue / ordersCount) : 0;
  return { revenue, ordersCount, avgCheck };
};

const generateLeaderboard = (weekOrders, masters) => {
  const statsByMaster = {};
  masters.forEach(masterName => {
    statsByMaster[masterName] = { name: masterName, revenue: 0, ordersCount: 0 };
  });
  (weekOrders || []).forEach(order => {
    if (statsByMaster[order.masterName]) {
      statsByMaster[order.masterName].revenue += order.amount;
      statsByMaster[order.masterName].ordersCount += 1;
    }
  });
  return Object.values(statsByMaster).sort((a, b) => b.revenue - a.revenue);
};

const prepareDataForUser = (user) => {
    const weekOrders = getWeekOrders();
    const today = new Date().toISOString().slice(0, 10);
    const todayOrders = (weekOrders || []).filter(o => o.createdAt.startsWith(today));
    const masters = Object.values(db.users).filter(u => u.role === 'MASTER').map(u => u.name);
    const leaderboard = generateLeaderboard(weekOrders, masters);

    const relevantOrdersForStats = user.role === 'DIRECTOR' || user.login === 'vladimir.ch'
        ? weekOrders
        : (weekOrders || []).filter(o => o.masterName === user.name);

    const weekStats = calculateStats(relevantOrdersForStats);

    const salaryData = leaderboard.map(m => ({
        name: m.name,
        total: m.revenue * 0.5,
    }));

    const relevantWeekOrders = user.role === 'DIRECTOR' || user.login === 'vladimir.ch'
        ? weekOrders
        : (weekOrders || []).filter(o => o.masterName === user.name);

    return { todayOrders, weekOrders: relevantWeekOrders, weekStats, leaderboard, salaryData, masters };
};

const broadcastUpdates = () => {
    io.sockets.sockets.forEach(socket => {
        socket.emit('dataUpdate', prepareDataForUser(socket.user));
    });
    console.log('Обновления разосланы всем клиентам.');
};

// --- API & SOCKETS ---
app.post('/login', (req, res) => {
  const { login, password } = req.body;
  const userRecord = db.users[login];
  if (!userRecord || userRecord.password !== password) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ login: login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ message: 'Успешный вход', token, user: { login: login, name: userRecord.name, role: userRecord.role } });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Invalid token'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`Пользователь '${socket.user.name}' (${socket.user.role}) подключился.`);
  socket.emit('initialData', prepareDataForUser(socket.user));

  const isPrivileged = (user) => user.role === 'DIRECTOR' || user.login === 'vladimir.ch';

  socket.on('addOrder', async (orderData) => {
    if (!orderData || !orderData.description || !orderData.amount) return socket.emit('serverError', 'Некорректные данные заказ-наряда.');
    if (!isPrivileged(socket.user)) orderData.masterName = socket.user.name;
    const newOrder = { ...orderData, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() };
    db.orders.push(newOrder);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('updateOrder', async (orderData) => {
    if (!orderData || !orderData.id) return socket.emit('serverError', 'Необходим ID заказ-наряда для обновления.');
    const orderIndex = db.orders.findIndex(o => o.id === orderData.id);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');

    const order = db.orders[orderIndex];
    const user = socket.user;
    const isOwner = order.masterName === user.name;
    const canEditMaster = isPrivileged(user);
    const canEditMasterLimited = isOwner && (new Date() - new Date(order.createdAt)) < 3600 * 1000; // 1 час
    const canEditDirectorLimited = isPrivileged(user) && (new Date() - new Date(order.createdAt)) < 3600 * 1000 * 24 * 7; // 7 дней

    if (!canEditMaster && !canEditMasterLimited && !canEditDirectorLimited) {
      return socket.emit('serverError', 'Недостаточно прав или время для редактирования истекло.');
    }

    db.orders[orderIndex] = { ...order, ...orderData };
    await saveDB();
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (orderId) => {
    if (!orderId) return socket.emit('serverError', 'Необходим ID заказ-наряда для удаления.');
    const orderIndex = db.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Недостаточно прав для удаления.');
    db.orders = db.orders.filter(o => o.id !== orderId);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('closeWeek', async () => {
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Недостаточно прав.');
    if (db.orders.length === 0) return socket.emit('serverError', 'Нет заказ-нарядов для закрытия недели.');
    const weekId = getWeekId();
    db.history.push({ weekId, orders: [...db.orders] });
    db.orders = [];
    await saveDB();
    broadcastUpdates();
  });

  socket.on('clearData', async () => {
    if (!isPrivileged(socket.user)) return socket.emit('serverError', 'Недостаточно прав.');
    db.orders = [];
    db.history = [];
    await saveDB();
    broadcastUpdates();
  });

  socket.on('disconnect', () => console.log(`Пользователь '${socket.user.name}' отключился.`));
});

// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB();
  console.log(`Сервер VIPавто запущен на порту ${PORT}...`);
});
