/*────────────────────────────────────────────
  server.js
  Финальная полировка - Версия 9.0
─────────────────────────────────────────────*/

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-for-vipauto-dont-share-it';
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(__dirname));

let db = { users: {}, orders: [], history: [] };

const saveDB = async () => fs.writeFile(DB_PATH, JSON.stringify(db, null, 2)).catch(err => console.error('!!! ОШИБКА СОХРАНЕНИЯ БД:', err));

const loadDB = async () => {
  try {
    const fileContent = await fs.readFile(DB_PATH, 'utf-8');
    if (fileContent.length < 20) throw new Error("Empty DB file");
    const parsedDb = JSON.parse(fileContent);
    if (!parsedDb.orders || parsedDb.orders.length === 0) {
      console.log(`[DB] База пуста. Заполняем тестовыми данными.`);
      db = parsedDb;
      seedDatabaseWithTestData();
      await saveDB();
    } else {
      db = parsedDb;
      console.log(`[DB] База успешно загружена. Заказов: ${db.orders.length}`);
    }
  } catch (error) {
    console.log(`[DB] Файл db.json не найден или поврежден. Создаем новую базу.`);
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
    const services = ['Замена масла ДВС', 'Комплексный шиномонтаж', 'Диагностика ходовой', 'Ремонт тормозной системы', 'Замена ГРМ'];
    let testOrders = [];
    for (let i = 0; i < 50; i++) {
        const date = new Date();
        date.setDate(date.getDate() - Math.floor(Math.random() * 7));
        date.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));
        testOrders.push({
            id: `ord-${Date.now()}-${i}`, masterName: masterNames[Math.floor(Math.random() * masterNames.length)],
            carModel: carBrands[Math.floor(Math.random() * carBrands.length)], description: services[Math.floor(Math.random() * services.length)],
            amount: Math.floor(Math.random() * 2500 + 500), paymentType: ['Картой', 'Наличные', 'Перевод'][Math.floor(Math.random() * 3)],
            createdAt: date.toISOString(),
        });
    }
    db.orders = testOrders;
    console.log(`[SEED] Создано ${testOrders.length} тестовых заказ-нарядов.`);
};

const isPrivileged = (user) => user && (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER');
const getWeekOrders = () => (db.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const prepareDataForUser = (user) => {
    const allWeekOrders = getWeekOrders();
    const masters = Object.values(db.users).filter(u => u.role.includes('MASTER')).map(u => u.name);
    const userIsPrivileged = isPrivileged(user);
    const relevantOrders = userIsPrivileged ? allWeekOrders : allWeekOrders.filter(o => o.masterName === user.name);
    const weekStats = {
        revenue: relevantOrders.reduce((s, o) => s + o.amount, 0), ordersCount: relevantOrders.length,
        avgCheck: relevantOrders.length > 0 ? Math.round(relevantOrders.reduce((s, o) => s + o.amount, 0) / relevantOrders.length) : 0
    };
    const leaderboard = Object.values(allWeekOrders.reduce((acc, o) => {
        if (!acc[o.masterName]) acc[o.masterName] = { name: o.masterName, revenue: 0, ordersCount: 0 };
        acc[o.masterName].revenue += o.amount;
        acc[o.masterName].ordersCount++;
        return acc;
    }, {})).sort((a, b) => b.revenue - a.revenue);
    return { weekOrders: relevantOrders, weekStats, todayOrders: relevantOrders.filter(o => o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10)), leaderboard, masters, user, history: db.history || [] };
};

const broadcastUpdates = () => io.sockets.sockets.forEach(s => s.user && s.emit('dataUpdate', prepareDataForUser(s.user)));

app.post('/login', (req, res) => {
  const { login, password } = req.body;
  const userRecord = db.users[login];
  if (!userRecord || userRecord.password !== password) return res.status(401).json({ message: 'Неверный логин или пароль' });
  const token = jwt.sign({ login, role: userRecord.role, name: userRecord.name }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { login, name: userRecord.name, role: userRecord.role } });
});

io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth.token, JWT_SECRET); next(); }
  catch (err) { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Подключился: '${socket.user.name}'`);
  socket.emit('initialData', prepareDataForUser(socket.user));
  socket.on('addOrder', async (d) => { if (!isPrivileged(socket.user)) d.masterName = socket.user.name; db.orders.unshift({ ...d, id: `ord-${Date.now()}`, createdAt: new Date().toISOString() }); await saveDB(); broadcastUpdates(); });
  socket.on('updateOrder', async (d) => {
    const orderIndex = db.orders.findIndex(o => o.id === d.id);
    if (orderIndex === -1) return socket.emit('serverError', 'Заказ-наряд не найден.');

    const order = db.orders[orderIndex];
    const user = socket.user;
    const orderAge = Date.now() - new Date(order.createdAt).getTime();
    const twoHours = 2 * 60 * 60 * 1000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const canEdit = (() => {
      if (user.role === 'DIRECTOR' || user.role === 'SENIOR_MASTER') {
        return orderAge < sevenDays;
      }
      if (user.role === 'MASTER') {
        return order.masterName === user.name && orderAge < twoHours;
      }
      return false;
    })();

    if (!canEdit) {
      return socket.emit('serverError', 'У вас нет прав на редактирование или время истекло.');
    }

    db.orders[orderIndex] = { ...order, ...d };
    await saveDB();
    broadcastUpdates();
  });
  socket.on('deleteOrder', async (id) => { if (isPrivileged(socket.user)) { db.orders = db.orders.filter(o => o.id !== id); await saveDB(); broadcastUpdates(); } });
  socket.on('closeWeek', async () => { if (isPrivileged(socket.user) && db.orders.length) { db.history.unshift({ weekId: `week-${Date.now()}`, orders: [...db.orders] }); db.orders = []; await saveDB(); broadcastUpdates(); } });
  socket.on('clearData', async () => { if (isPrivileged(socket.user)) { db.orders = []; db.history = []; seedDatabaseWithTestData(); await saveDB(); broadcastUpdates(); } });
  socket.on('clearHistory', async () => { if (isPrivileged(socket.user)) { db.history = []; await saveDB(); broadcastUpdates(); } });
  socket.on('disconnect', () => console.log(`[Socket] Отключился: '${socket.user.name}'`));
});

server.listen(PORT, async () => {
  await loadDB();
  console.log(`>>> Сервер VIPавто v9.0 запущен на порту ${PORT} <<<`);
});
