/*────────────────────────────────────────────
  server.js
  Финальная Сборка - Версия 6.0
  Максимально стабильная и простая логика.
─────────────────────────────────────────────*/

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

// --- Константы и настройки ---
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-for-vipauto-dont-share-it';
const DB_PATH = path.join(__dirname, 'db.json');

// --- Инициализация Express и Socket.IO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname)); // Обслуживание статических файлов

// --- База данных в памяти ---
let db = { users: {}, orders: [], history: [] };

// --- Ключевая логика: Управление базой данных ---

const saveDB = async () => {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('!!! КРИТИЧЕСКАЯ ОШИБКА: Не удалось сохранить db.json', err);
  }
};

const loadDB = async () => {
  try {
    // Проверяем, существует ли файл
    await fs.access(DB_PATH);
    const fileContent = await fs.readFile(DB_PATH, 'utf-8');

    // Если файл пустой или содержит только "{}", считаем его невалидным
    if (fileContent.length < 20) {
      console.log(`[DB] Файл db.json найден, но он пуст. Принудительно пересоздаем.`);
      throw new Error("Empty DB file");
    }

    const parsedDb = JSON.parse(fileContent);

    // Проверяем, есть ли в нем заказы
    if (!parsedDb.orders || parsedDb.orders.length === 0) {
      console.log(`[DB] База данных загружена, но в ней нет заказов. Заполняем тестовыми данными.`);
      db = parsedDb; // Загружаем пользователей
      seedDatabaseWithTestData(); // Генерируем заказы
      await saveDB();
    } else {
      db = parsedDb;
      console.log(`[DB] База данных успешно загружена. Заказов: ${db.orders.length}`);
    }
  } catch (error) {
    // Если файла нет или он невалидный
    console.log(`[DB] Файл db.json не найден или поврежден. Создаем новую базу с тестовыми данными.`);
    db = { users: {}, orders: [], history: [] };
    seedDatabaseWithTestData();
    await saveDB();
  }
};

const seedDatabaseWithTestData = () => {
    console.log('[SEED] Запуск генерации тестовых данных...');
    db.users = {
        'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' },
        'vladimir.ch': { password: 'Vch4R5tG', role: 'SENIOR_MASTER', name: 'Владимир Ч.' },
        'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
        'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
        'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
        'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
        'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
    };

    const masterNames = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const carBrands = ['Lada Vesta', 'Toyota Camry', 'Ford Focus', 'BMW X5', 'Mercedes C-Class', 'Audi A6', 'Kia Rio', 'Hyundai Solaris'];
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ', 'Ремонт подвески'];
    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));
        testOrders.push({
            id: `ord-${Date.now()}-${i}`,
            masterName: masterNames[Math.floor(Math.random() * masterNames.length)],
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * 2500 + 500),
            paymentType: ['Картой', 'Наличные', 'Перевод'][Math.floor(Math.random() * 3)],
            createdAt: date.toISOString(),
        });
    }
    db.orders = testOrders;
    console.log(`[SEED] Создано ${testOrders.length} тестовых заказ-нарядов.`);
};


// --- Бизнес-логика ---
const isPrivileged = (user) => user && (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER');
const getWeekOrders = () => (db.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const prepareDataForUser = (user) => {
    const allWeekOrders = getWeekOrders();
    const masters = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const userIsPrivileged = isPrivileged(user);
    const relevantOrders = userIsPrivileged ? allWeekOrders : allWeekOrders.filter(o => o.masterName === user.name);
    const weekStats = {
        revenue: relevantOrders.reduce((s, o) => s + o.amount, 0),
        ordersCount: relevantOrders.length,
        avgCheck: relevantOrders.length > 0 ? Math.round(relevantOrders.reduce((s, o) => s + o.amount, 0) / relevantOrders.length) : 0
    };

    return {
        weekOrders: relevantOrders,
        weekStats: weekStats,
        todayOrders: relevantOrders.filter(o => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)),
        leaderboard: Object.values(allWeekOrders.reduce((acc, o) => {
            if (!acc[o.masterName]) acc[o.masterName] = { name: o.masterName, revenue: 0 };
            acc[o.masterName].revenue += o.amount;
            return acc;
        }, {})).sort((a, b) => b.revenue - a.revenue),
        masters,
        user,
    };
};

const broadcastUpdates = () => {
    io.sockets.sockets.forEach(socket => {
        if(socket.user) {
            socket.emit('dataUpdate', prepareDataForUser(socket.user));
        }
    });
    console.log('[Broadcast] Обновления разосланы всем клиентам.');
};

// --- API эндпоинты и Socket.IO ---

app.post('/login', (req, res) => {
  const { login, password } = req.body;
  const userRecord = db.users[login];
  if (!userRecord || userRecord.password !== password) {
    return res.status(401).json({ message: 'Неверный логин или пароль' });
  }
  const token = jwt.sign({ login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { login, name: userRecord.name, role: userRecord.role } });
});

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Подключился: '${socket.user.name}'`);
  socket.emit('initialData', prepareDataForUser(socket.user));

  socket.on('addOrder', async (orderData) => {
    if (!isPrivileged(socket.user)) orderData.masterName = socket.user.name;
    db.orders.unshift({ ...orderData, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() });
    await saveDB();
    broadcastUpdates();
  });

  socket.on('deleteOrder', async (orderId) => {
    if (!isPrivileged(socket.user)) return;
    const initialCount = db.orders.length;
    db.orders = db.orders.filter(o => o.id !== orderId);
    if (db.orders.length < initialCount) {
        await saveDB();
        broadcastUpdates();
    }
  });

  socket.on('clearData', async () => {
    if (!isPrivileged(socket.user)) return;
    console.log(`[DB] Данные очищены пользователем ${socket.user.name}`);
    db.orders = [];
    db.history = [];
    seedDatabaseWithTestData();
    await saveDB();
    broadcastUpdates();
  });

  socket.on('disconnect', () => console.log(`[Socket] Отключился: '${socket.user.name}'`));
});

// --- Запуск сервера ---
server.listen(PORT, async () => {
  await loadDB();
  console.log(`>>> Сервер VIPавто v6.0 (Финальная Сборка) запущен на порту ${PORT} <<<`);
});
