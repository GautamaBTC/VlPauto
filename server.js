/*────────────────────────────────────────────
  server.js
  Серверная часть для бортового журнала VIPавто.
  ВЕРСИЯ 2.0 - Полная переработка логики
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

// --- ЯВНЫЕ МАРШРУТЫ ДЛЯ HTML СТРАНИЦ ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- ОБСЛУЖИВАНИЕ СТАТИЧЕСКИХ ФАЙЛОВ (CSS, JS, etc.) ---
app.use(express.static(path.join(__dirname)));
app.use('/js', express.static(path.join(__dirname, 'js')));


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

let db = { users: {}, orders: [], history: [] };

// --- НОВАЯ ФУНКЦИЯ: Генерация тестовых данных ---
const seedDatabaseWithTestData = async () => {
    console.log('База данных пуста. Заполняем тестовыми данными...');
    const masterNames = Object.values(db.users).filter(u => u.role === 'MASTER' || u.role === 'SENIOR_MASTER').map(u => u.name);
    const carBrands = ['Lada', 'Toyota', 'Ford', 'BMW', 'Mercedes', 'Audi', 'Kia', 'Hyundai', 'Renault', 'Nissan'];
    const services = ['Замена масла', 'Шиномонтаж', 'Диагностика двигателя', 'Ремонт тормозов', 'Замена фильтров', 'Ремонт подвески', 'Сход-развал'];

    let testOrders = [];
    for (let i = 0; i < 50; i++) { // Создадим 50 заказ-нарядов
        const masterName = masterNames[Math.floor(Math.random() * masterNames.length)];
        const car = carBrands[Math.floor(Math.random() * carBrands.length)];
        const service = services[Math.floor(Math.random() * services.length)];
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7)); // за последнюю неделю

        testOrders.push({
            id: `ord-${Date.now()}-${i}`,
            masterName: masterName,
            carModel: `${car} ${Math.floor(Math.random() * 10) + 1}`,
            description: service,
            amount: Math.floor(Math.random() * (25000 - 1000 + 1) + 1000),
            createdAt: date.toISOString(),
        });
    }
    db.orders = testOrders;
    await saveDB();
    console.log(`Создано ${testOrders.length} тестовых заказ-нарядов.`);
};


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
    // Если база загружена, но она пустая, заполняем ее
    if (!db.orders || db.orders.length === 0) {
        await seedDatabaseWithTestData();
    }
  } catch (error) {
    console.log('Файл базы данных не найден. Создание новой...');
    db = {
      users: {
        'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' },
        'vladimir.ch': { password: 'Vch4R5tG', role: 'SENIOR_MASTER', name: 'Владимир Ч.' }, // <-- Назначаем роль Старшего Мастера
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
    await seedDatabaseWithTestData(); // Заполняем новую базу тестовыми данными
  }
};

const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error('Ошибка сохранения базы данных:', error);
  }
};

const backupDatabase = async () => {
  const BACKUP_DIR = path.join(__dirname, 'backups');
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().slice(0, 10);
    const backupPath = path.join(BACKUP_DIR, `db-backup-${timestamp}.json`);
    await fs.access(backupPath).catch(async () => {
        const data = await fs.readFile(DB_PATH, 'utf-8');
        await fs.writeFile(backupPath, data);
        console.log(`Создана резервная копия: ${backupPath}`);
    });
  } catch (error) {
    console.error('Ошибка создания резервной копии:', error);
  }
};

// --- БИЗНЕС-ЛОГИКА ---

// Новая функция проверки привилегий
const isPrivileged = (user) => user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER';

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

// Переработанная функция подготовки данных для пользователя
const prepareDataForUser = (user) => {
    const allWeekOrders = getWeekOrders();
    const masters = Object.values(db.users)
        .filter(u => u.role === 'MASTER' || u.role === 'SENIOR_MASTER')
        .map(u => u.name);

    // Лидерборд и данные для зарплаты всегда считаются по всем
    const leaderboard = generateLeaderboard(allWeekOrders, masters);
    const salaryData = leaderboard.map(m => ({
        name: m.name,
        total: m.revenue * 0.5,
    }));

    let userSpecificData;

    if (isPrivileged(user)) {
        // Директор и Старший мастер видят всё
        userSpecificData = {
            weekOrders: allWeekOrders,
            weekStats: calculateStats(allWeekOrders),
            todayOrders: allWeekOrders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))),
        };
    } else {
        // Обычный мастер видит только свое
        const masterOrders = allWeekOrders.filter(o => o.masterName === user.name);
        userSpecificData = {
            weekOrders: masterOrders,
            weekStats: calculateStats(masterOrders),
            todayOrders: masterOrders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))),
        };
    }

    return {
        ...userSpecificData,
        leaderboard,
        salaryData,
        masters, // Список мастеров нужен для выпадающего списка
        user, // Передаем информацию о пользователе на клиент
    };
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

  socket.on('addOrder', async (orderData) => {
    if (!orderData || !orderData.description || !orderData.amount) return socket.emit('serverError', 'Некорректные данные заказ-наряда.');
    // Если добавляет обычный мастер, его имя подставляется автоматически
    if (!isPrivileged(socket.user)) {
        orderData.masterName = socket.user.name;
    }
    // Если добавляет директор/ст.мастер, но не выбрал мастера - ошибка
    if (isPrivileged(socket.user) && !orderData.masterName) {
        return socket.emit('serverError', 'Необходимо выбрать исполнителя.');
    }
    const newOrder = { ...orderData, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() };
    db.orders.unshift(newOrder); // Добавляем в начало
    await saveDB();
    broadcastUpdates();
  });

  socket.on('updateOrder', async (orderData) => {
    if (!orderData || !orderData.id) return socket.emit('serverError', 'Необходим ID заказ-наряда для обновления.');
    const orderIndex = db.orders.findIndex(o => o.id === orderData.id);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');

    const order = db.orders[orderIndex];
    if (!isPrivileged(socket.user) && order.masterName !== socket.user.name) {
        return socket.emit('serverError', 'Вы не можете редактировать чужой заказ-наряд.');
    }

    db.orders[orderIndex] = { ...order, ...orderData };
    await saveDB();
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (orderId) => {
    if (!orderId) return socket.emit('serverError', 'Необходим ID заказ-наряда для удаления.');
    const orderIndex = db.orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');

    const order = db.orders[orderIndex];
    if (!isPrivileged(socket.user) && order.masterName !== socket.user.name) {
        return socket.emit('serverError', 'Вы не можете удалять чужой заказ-наряд.');
    }

    db.orders = db.orders.filter(o => o.id !== orderId);
    await saveDB();
    broadcastUpdates();
  });

  socket.on('getArchiveData', ({ startDate, endDate }) => {
    if (!startDate || !endDate) return socket.emit('serverError', 'Необходимо указать начальную и конечную даты.');
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    let filtered = (db.history || []).flatMap(w => w.orders).filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= start && orderDate <= end;
    });
    if (!isPrivileged(socket.user)) {
        filtered = filtered.filter(o => o.masterName === socket.user.name);
    }
    socket.emit('archiveData', filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
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
    await seedDatabaseWithTestData(); // Перезаполняем базу тестовыми данными после полной очистки
    broadcastUpdates();
  });

  socket.on('disconnect', () => console.log(`Пользователь '${socket.user.name}' отключился.`));
});

// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB();
  await backupDatabase();
  setInterval(backupDatabase, 1000 * 60 * 60 * 24);
  console.log(`Сервер VIPавто v2.0 запущен на порту ${PORT}...`);
});
