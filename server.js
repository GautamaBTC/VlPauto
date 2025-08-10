/*────────────────────────────────────────────
  server.js
  Версия 5.0 - "Чистый лист". Гарантированное создание данных.
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
app.use(express.static(__dirname));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

let db = { users: {}, orders: [], history: [] };

// --- ГЕНЕРАЦИЯ ТЕСТОВЫХ ДАННЫХ ---
const seedDatabaseWithTestData = () => {
    console.log('--- ЗАПУСК ЗАПОЛНЕНИЯ ТЕСТОВЫМИ ДАННЫМИ ---');
    if (!db.users || Object.keys(db.users).length === 0) {
        db.users = {
            'director': { password: 'Dir7wK9c', role: 'DIRECTOR', name: 'Владимир Орлов' },
            'vladimir.ch': { password: 'Vch4R5tG', role: 'SENIOR_MASTER', name: 'Владимир Ч.' },
            'vladimir.a': { password: 'Vla9L2mP', role: 'MASTER', name: 'Владимир А.' },
            'andrey': { password: 'And3Z8xY', role: 'MASTER', name: 'Андрей' },
            'danila': { password: 'Dan6J1vE', role: 'MASTER', name: 'Данила' },
            'maxim': { password: 'Max2B7nS', role: 'MASTER', name: 'Максим' },
            'artyom': { password: 'Art5H4qF', role: 'MASTER', name: 'Артём' }
        };
    }
    const masterNames = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const carBrands = ['Lada Vesta', 'Toyota Camry', 'Ford Focus', 'BMW X5', 'Mercedes C-Class', 'Audi A6', 'Kia Rio', 'Hyundai Solaris'];
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ', 'Ремонт подвески'];
    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));
        testOrders.push({
            id: `ord-${Date.now()}-${i}`, masterName: masterNames[Math.floor(Math.random() * masterNames.length)],
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)],
            description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * (1500 - 50 + 1) + 50) * 10,
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
    const stats = await fs.stat(DB_PATH);
    // Если файл существует, но он пустой (или почти пустой), удаляем его.
    if (stats.size < 100) {
        console.log(`Файл ${DB_PATH} пуст. Удаляем его для пересоздания.`);
        await fs.unlink(DB_PATH);
        throw new Error("Empty DB file, forcing recreation.");
    }
    const data = await fs.readFile(DB_PATH, 'utf-8');
    db = JSON.parse(data);
    if (!db.history) db.history = [];
    console.log('База данных успешно загружена.');
  } catch (error) {
    console.log('База данных не найдена или требует пересоздания. Создание новой...');
    db = { users: {}, orders: [], history: [] };
    seedDatabaseWithTestData();
    await saveDB();
  }
};

const saveDB = async () => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)).catch(err => console.error('ОШИБКА СОХРАНЕНИЯ БД:', err));

// --- БИЗНЕС-ЛОГИКА ---
const isPrivileged = (user) => user && (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER');
const getWeekOrders = () => (db.orders || []).filter(o => (new Date() - new Date(o.createdAt)) < 7 * 24 * 3600 * 1000).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
const calculateStats = (orders) => { const count = orders.length; const revenue = orders.reduce((s, o) => s + o.amount, 0); return { revenue, ordersCount: count, avgCheck: count > 0 ? Math.round(revenue / count) : 0 }; };
const prepareDataForUser = (user) => {
    const allWeekOrders = getWeekOrders();
    const masters = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const userIsPrivileged = isPrivileged(user);
    const relevantOrders = userIsPrivileged ? allWeekOrders : allWeekOrders.filter(o => o.masterName === user.name);
    return {
        weekOrders: relevantOrders,
        weekStats: calculateStats(relevantOrders),
        todayOrders: relevantOrders.filter(o => o.createdAt.startsWith(new Date().toISOString().slice(0, 10))),
        leaderboard: allWeekOrders.length > 0 ? Object.values(allWeekOrders.reduce((acc, o) => { acc[o.masterName] = acc[o.masterName] || { name: o.masterName, revenue: 0 }; acc[o.masterName].revenue += o.amount; return acc; }, {})).sort((a, b) => b.revenue - a.revenue) : [],
        masters, user,
    };
};
const broadcastUpdates = () => io.sockets.sockets.forEach(s => s.user && s.emit('dataUpdate', prepareDataForUser(s.user)));

// --- ЛОГИКА SOCKET.IO ---
io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`Подключился: '${socket.user.name}'`);
  socket.emit('initialData', prepareDataForUser(socket.user));
  socket.on('addOrder', async (d) => { if (!isPrivileged(socket.user)) d.masterName = socket.user.name; db.orders.unshift({ ...d, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() }); await saveDB(); broadcastUpdates(); });
  socket.on('updateOrder', async (d) => { const i = db.orders.findIndex(o => o.id === d.id); if (i!==-1) { db.orders[i] = { ...db.orders[i], ...d }; await saveDB(); broadcastUpdates(); } });
  socket.on('deleteOrder', async (id) => { if (isPrivileged(socket.user)) { db.orders = db.orders.filter(o => o.id !== id); await saveDB(); broadcastUpdates(); } });
  socket.on('closeWeek', async () => { if (isPrivileged(socket.user) && db.orders.length) { db.history.unshift({ weekId: `week-${Date.now()}`, orders: [...db.orders] }); db.orders = []; await saveDB(); broadcastUpdates(); } });
  socket.on('clearData', async () => { if (isPrivileged(socket.user)) { db.orders = []; db.history = []; seedDatabaseWithTestData(); await saveDB(); broadcastUpdates(); } });
  socket.on('getArchiveData', ({ startDate, endDate }) => { const start = new Date(startDate); const end = new Date(endDate); end.setHours(23, 59, 59, 999); let filtered = (db.history || []).flatMap(w => w.orders).filter(o => new Date(o.createdAt) >= start && new Date(o.createdAt) <= end); if (!isPrivileged(socket.user)) filtered = filtered.filter(o => o.masterName === socket.user.name); socket.emit('archiveData', filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))); });
  socket.on('disconnect', () => console.log(`Отключился: '${socket.user.name}'`));
});

// --- API-ЭНДПОИНТ ДЛЯ ВХОДА ---
app.post('/login', (req, res) => {
  const { login, password } = req.body;
  const userRecord = db.users[login];
  if (!userRecord || userRecord.password !== password) return res.status(401).json({ message: 'Неверный логин или пароль' });
  const token = jwt.sign({ login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { login, name: userRecord.name, role: userRecord.role } });
});

// --- ЗАПУСК СЕРВЕРА ---
server.listen(PORT, async () => {
  await loadDB();
  console.log(`Сервер VIPавто v5.0 запущен на порту ${PORT}...`);
});
